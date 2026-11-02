/**
 * Acciones del asistente: lo que la IA propone y la app ejecuta.
 *
 * La IA NO toca los datos. Devuelve una lista de acciones estructuradas
 * («añadir examen de Matemáticas I el jueves») y este módulo, puro y probado,
 * las valida y las aplica con el MISMO reductor que usa la interfaz. Así lo
 * que crea la IA es indistinguible de lo que creas a mano: se valida igual,
 * se sincroniza igual y se deshace igual.
 *
 * Criterio: ante la duda, no inventar. Una acción con una asignatura que no
 * existe, una fecha imposible o una nota fuera de escala se descarta con un
 * motivo legible, en lugar de guardar algo que no has dicho.
 */

import { normalize } from '../domain/tasks.ts'
import { addDays, formatDayMonth } from '../domain/dates.ts'
import type { AppData, GradeKind, Priority, Subject, TermId } from '../domain/types.ts'
import { reducer } from '../state/reducer.ts'

export type AssistantActionType =
  | 'add_task'
  | 'complete_task'
  | 'add_exam'
  | 'add_grade'
  | 'add_event'
  | 'add_subject'
  | 'log_study'

/** Forma plana que devuelve el modelo (todo opcional salvo el tipo). */
export interface AssistantAction {
  type: AssistantActionType
  title?: string
  subject_id?: string
  /** Para asignaturas recién creadas en la misma petición. */
  subject_name?: string
  date?: string
  time?: string
  priority?: string
  estimated_minutes?: number
  notes?: string
  score?: number
  max_score?: number
  weight?: number
  term?: string
  grade_kind?: string
  task_id?: string
  exam_id?: string
  category_id?: string
  minutes?: number
}

export interface AppliedItem {
  kind: 'tarea' | 'examen' | 'nota' | 'evento' | 'asignatura' | 'completada' | 'estudio'
  text: string
}

export interface ApplyResult {
  data: AppData
  applied: AppliedItem[]
  /** Acciones descartadas, con el motivo, para enseñárselo al alumno. */
  skipped: string[]
}

const PRIORITIES: Priority[] = ['baja', 'media', 'alta', 'urgente']
const TERMS: TermId[] = ['T1', 'T2', 'T3']
const KINDS: GradeKind[] = ['examen', 'trabajo', 'practica', 'oral', 'participacion', 'otro']

/** Número a la española: «7,5», no «7.5». */
const es = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })

const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate()
}
const isTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const text = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

/** Busca la asignatura por id; si no, por nombre o abreviatura, sin tildes. */
export function resolveSubject(
  subjects: Subject[],
  id?: string,
  name?: string,
): Subject | undefined {
  if (id) {
    const exact = subjects.find((s) => s.id === id)
    if (exact) return exact
  }
  const wanted = normalize(name ?? id ?? '').trim()
  if (!wanted) return undefined
  return (
    subjects.find((s) => normalize(s.name) === wanted) ??
    subjects.find((s) => normalize(s.shortName ?? '') === wanted) ??
    subjects.find((s) => normalize(s.name).startsWith(wanted)) ??
    subjects.find((s) => normalize(s.name).includes(wanted))
  )
}

function dayLabel(day: string): string {
  return formatDayMonth(day)
}

/**
 * Aplica, en orden, las acciones válidas. Una acción puede apoyarse en otra
 * anterior de la misma lista (crear «Biología» y apuntarle un examen).
 */
export function applyAssistantActions(
  initial: AppData,
  actions: AssistantAction[],
  today: string,
): ApplyResult {
  let data = initial
  const applied: AppliedItem[] = []
  const skipped: string[] = []

  for (const action of actions.slice(0, 20)) {
    const subject = () => resolveSubject(data.subjects, action.subject_id, action.subject_name)
    const term = (TERMS as string[]).includes(action.term ?? '')
      ? (action.term as TermId)
      : data.settings.activeTerm

    switch (action.type) {
      case 'add_subject': {
        const name = text(action.subject_name ?? action.title, 80)
        if (!name) {
          skipped.push('Una asignatura sin nombre.')
          break
        }
        if (resolveSubject(data.subjects, undefined, name)) {
          // Ya existe: no se duplica, y lo que venga detrás la encontrará.
          break
        }
        data = reducer(data, {
          type: 'subject/add',
          subject: { name, color: nextFreeColor(data), weight: 4, schedule: [], categories: [] },
        })
        applied.push({ kind: 'asignatura', text: name })
        break
      }

      case 'add_task': {
        const title = text(action.title)
        if (!title) {
          skipped.push('Una tarea sin título.')
          break
        }
        const s = action.subject_id || action.subject_name ? subject() : undefined
        if ((action.subject_id || action.subject_name) && !s) {
          skipped.push(
            `«${title}»: no encuentro la asignatura «${action.subject_name ?? action.subject_id}».`,
          )
          break
        }
        const dueDate = isDay(action.date) ? action.date : undefined
        data = reducer(data, {
          type: 'task/add',
          task: {
            title,
            subjectId: s?.id,
            dueDate,
            dueTime: dueDate && isTime(action.time) ? action.time : undefined,
            priority: (PRIORITIES as string[]).includes(action.priority ?? '')
              ? (action.priority as Priority)
              : 'media',
            status: 'pendiente',
            estimatedMinutes:
              num(action.estimated_minutes) && action.estimated_minutes! > 0
                ? Math.min(Math.round(action.estimated_minutes!), 24 * 60)
                : undefined,
            description: text(action.notes, 2000),
            tags: [],
            subtasks: [],
          },
        })
        applied.push({
          kind: 'tarea',
          text: `${title}${dueDate ? ` · ${dueDate === today ? 'hoy' : dayLabel(dueDate)}` : ''}`,
        })
        break
      }

      case 'complete_task': {
        const target =
          data.tasks.find((t) => t.id === action.task_id) ??
          (action.title
            ? data.tasks.find(
                (t) =>
                  t.status !== 'completada' &&
                  normalize(t.title).includes(normalize(action.title!)),
              )
            : undefined)
        if (!target) {
          skipped.push(
            `No encuentro la tarea «${action.title ?? action.task_id}» para completarla.`,
          )
          break
        }
        if (target.status !== 'completada') {
          data = reducer(data, { type: 'task/toggle', id: target.id })
        }
        applied.push({ kind: 'completada', text: target.title })
        break
      }

      case 'add_exam': {
        const s = subject()
        if (!s) {
          skipped.push(
            `Examen: no encuentro la asignatura «${action.subject_name ?? action.subject_id ?? '?'}».`,
          )
          break
        }
        if (!isDay(action.date)) {
          skipped.push(`Examen de ${s.name}: falta una fecha válida.`)
          break
        }
        const weight = num(action.weight)
        data = reducer(data, {
          type: 'exam/add',
          exam: {
            subjectId: s.id,
            title: text(action.title) ?? `Examen de ${s.name}`,
            date: action.date,
            time: isTime(action.time) ? action.time : undefined,
            topics: text(action.notes, 1000),
            weight: weight !== undefined && weight > 0 && weight <= 100 ? weight : undefined,
            term,
          },
        })
        applied.push({ kind: 'examen', text: `${s.name} · ${dayLabel(action.date)}` })
        break
      }

      case 'add_grade': {
        const s = subject()
        if (!s) {
          skipped.push(
            `Nota: no encuentro la asignatura «${action.subject_name ?? action.subject_id ?? '?'}».`,
          )
          break
        }
        const maxScore =
          num(action.max_score) && action.max_score! > 0
            ? action.max_score!
            : data.settings.gradeScale.max
        const score = num(action.score)
        if (score === undefined || score < 0 || score > maxScore) {
          skipped.push(`Nota de ${s.name}: el valor no es válido sobre ${maxScore}.`)
          break
        }
        const weight = num(action.weight)
        const category =
          action.category_id && s.categories.some((c) => c.id === action.category_id)
            ? action.category_id
            : null
        // Se enlaza con el examen si la IA lo identificó y sigue sin nota.
        const exam = data.exams.find(
          (e) => e.id === action.exam_id && e.subjectId === s.id && !e.gradeEntryId,
        )
        data = reducer(data, {
          type: 'grade/add',
          grade: {
            subjectId: s.id,
            categoryId: category,
            term: exam?.term ?? term,
            name: text(action.title) ?? exam?.title ?? 'Examen',
            kind: (KINDS as string[]).includes(action.grade_kind ?? '')
              ? (action.grade_kind as GradeKind)
              : 'examen',
            score,
            maxScore,
            weight: weight !== undefined && weight > 0 && weight <= 100 ? weight : 0,
            date: isDay(action.date) ? action.date : (exam?.date ?? today),
          },
          linkExamId: exam?.id,
        })
        applied.push({
          kind: 'nota',
          text: `${s.name} · ${es(score)}/${es(maxScore)}${weight ? ` · ${es(weight)} %` : ''}`,
        })
        break
      }

      case 'add_event': {
        const title = text(action.title)
        if (!title || !isDay(action.date)) {
          skipped.push(`Evento${title ? ` «${title}»` : ''}: falta título o fecha válida.`)
          break
        }
        const s = action.subject_id || action.subject_name ? subject() : undefined
        data = reducer(data, {
          type: 'event/add',
          event: {
            title,
            date: action.date,
            startTime: isTime(action.time) ? action.time : undefined,
            subjectId: s?.id,
            kind: 'otro',
            notes: text(action.notes, 1000),
          },
        })
        applied.push({ kind: 'evento', text: `${title} · ${dayLabel(action.date)}` })
        break
      }

      case 'log_study': {
        const minutes = num(action.minutes)
        if (!minutes || minutes <= 0) {
          skipped.push('Sesión de estudio sin duración.')
          break
        }
        const s = action.subject_id || action.subject_name ? subject() : undefined
        const day = isDay(action.date) ? action.date : today
        const start = new Date(`${day}T12:00:00`)
        data = reducer(data, {
          type: 'session/add',
          session: {
            subjectId: s?.id,
            topic: text(action.title),
            startedAt: start.toISOString(),
            minutes: Math.min(Math.round(minutes), 24 * 60),
            mode: 'libre',
          },
        })
        applied.push({
          kind: 'estudio',
          text: `${Math.round(minutes)} min${s ? ` · ${s.name}` : ''}`,
        })
        break
      }

      default:
        skipped.push('Una acción que no sé hacer.')
    }
  }

  return { data, applied, skipped }
}

const COLORS = [
  'sky',
  'sage',
  'amber',
  'terracotta',
  'plum',
  'teal',
  'indigo',
  'moss',
  'clay',
  'slate',
] as const

function nextFreeColor(data: AppData): Subject['color'] {
  const used = new Set(data.subjects.map((s) => s.color))
  return COLORS.find((c) => !used.has(c)) ?? COLORS[data.subjects.length % COLORS.length]
}

// ---------------------------------------------------------------------------
// Deshacer
// ---------------------------------------------------------------------------

export interface UndoPlan {
  created: {
    tasks: string[]
    exams: string[]
    grades: string[]
    events: string[]
    sessions: string[]
    subjects: string[]
  }
  completedTasks: string[]
}

/** Qué ha cambiado entre antes y después, para poder deshacerlo todo. */
export function planUndo(before: AppData, after: AppData): UndoPlan {
  const added = <T extends { id: string }>(a: T[], b: T[]) => {
    const old = new Set(a.map((x) => x.id))
    return b.filter((x) => !old.has(x.id)).map((x) => x.id)
  }
  const wasOpen = new Set(before.tasks.filter((t) => t.status !== 'completada').map((t) => t.id))
  return {
    created: {
      tasks: added(before.tasks, after.tasks),
      exams: added(before.exams, after.exams),
      grades: added(before.grades, after.grades),
      events: added(before.events, after.events),
      sessions: added(before.sessions, after.sessions),
      subjects: added(before.subjects, after.subjects),
    },
    completedTasks: after.tasks
      .filter((t) => t.status === 'completada' && wasOpen.has(t.id))
      .map((t) => t.id),
  }
}

/** Revierte un plan sobre el estado actual (que puede haber cambiado algo). */
export function applyUndo(data: AppData, plan: UndoPlan): AppData {
  let next = data
  for (const id of plan.created.grades) next = reducer(next, { type: 'grade/remove', id })
  for (const id of plan.created.exams) next = reducer(next, { type: 'exam/remove', id })
  for (const id of plan.created.tasks) next = reducer(next, { type: 'task/remove', id })
  for (const id of plan.created.events) next = reducer(next, { type: 'event/remove', id })
  for (const id of plan.created.sessions) next = reducer(next, { type: 'session/remove', id })
  for (const id of plan.created.subjects) next = reducer(next, { type: 'subject/remove', id })
  for (const id of plan.completedTasks) {
    const task = next.tasks.find((t) => t.id === id)
    if (task?.status === 'completada') next = reducer(next, { type: 'task/toggle', id })
  }
  return next
}

// ---------------------------------------------------------------------------
// Contexto para el modelo
// ---------------------------------------------------------------------------

/**
 * Lo que la IA necesita saber para resolver «biología», «el jueves» o «el
 * examen de mates»: asignaturas, tareas abiertas y exámenes sin nota. Nada
 * más del curso viaja al modelo.
 */
export function buildContext(data: AppData, today: string) {
  const weekday = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long' })
  return {
    today,
    weekday: weekday(today),
    // Calendario de los próximos días: el modelo busca «el jueves» aquí en
    // lugar de calcularlo, que es donde se equivocaba.
    next_days: Array.from({ length: 15 }, (_, i) => {
      const day = addDays(today, i)
      return { date: day, weekday: weekday(day) }
    }),
    active_term: data.settings.activeTerm,
    grade_max: data.settings.gradeScale.max,
    subjects: data.subjects
      .filter((s) => !s.archived)
      .map((s) => ({
        id: s.id,
        name: s.name,
        short: s.shortName,
        categories: s.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
      })),
    open_tasks: data.tasks
      .filter((t) => t.status !== 'completada')
      .slice(0, 60)
      .map((t) => ({ id: t.id, title: t.title, subject_id: t.subjectId, due: t.dueDate })),
    exams_without_grade: data.exams
      .filter((e) => !e.gradeEntryId)
      .slice(0, 40)
      .map((e) => ({
        id: e.id,
        subject_id: e.subjectId,
        title: e.title,
        date: e.date,
        term: e.term,
      })),
  }
}
