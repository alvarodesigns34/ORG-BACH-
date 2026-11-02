/**
 * Acciones del asistente: lo que la IA propone y la app ejecuta.
 *
 * La IA NO toca los datos. Devuelve una lista de acciones estructuradas
 * («añadir examen de Matemáticas I el jueves», «mover la tarea X al viernes»)
 * y este módulo, puro y probado, las valida y las aplica con el MISMO reductor
 * que usa la interfaz. Así lo que hace la IA es indistinguible de lo que haces
 * a mano: se valida igual, se sincroniza igual y se deshace igual.
 *
 * Criterio: ante la duda, no inventar. Una acción con una asignatura que no
 * existe, una fecha imposible o una nota fuera de escala se descarta con un
 * motivo legible, en lugar de guardar algo que no has dicho.
 */

import { normalize } from '../domain/tasks.ts'
import { addDays, formatDayMonth } from '../domain/dates.ts'
import { requiredGrade, round, subjectResult } from '../domain/grades.ts'
import { newId } from '../domain/id.ts'
import type {
  AppData,
  CalendarEvent,
  Exam,
  GradeEntry,
  GradeKind,
  Priority,
  Subject,
  Task,
  TaskStatus,
  TermId,
} from '../domain/types.ts'
import { reducer } from '../state/reducer.ts'

export const ACTION_TYPES = [
  'add_task',
  'update_task',
  'complete_task',
  'reopen_task',
  'delete_task',
  'add_subtasks',
  'add_exam',
  'update_exam',
  'delete_exam',
  'add_grade',
  'update_grade',
  'delete_grade',
  'add_event',
  'update_event',
  'delete_event',
  'add_subject',
  'set_target',
  'log_study',
] as const

export type AssistantActionType = (typeof ACTION_TYPES)[number]

/** Forma plana que devuelve el modelo (todo opcional salvo el tipo). */
export interface AssistantAction {
  type: AssistantActionType
  title?: string
  subject_id?: string
  /** Para asignaturas recién creadas en la misma petición. */
  subject_name?: string
  /** En las ediciones, `null` quita la fecha o la hora. */
  date?: string | null
  time?: string | null
  priority?: string
  status?: string
  estimated_minutes?: number
  notes?: string
  score?: number
  max_score?: number
  weight?: number
  term?: string
  grade_kind?: string
  task_id?: string
  exam_id?: string
  grade_id?: string
  event_id?: string
  category_id?: string
  minutes?: number
  /** Subtareas que añadir (add_subtasks). */
  items?: string[]
  /** Nota objetivo (set_target); `null` la quita. */
  target?: number | null
}

export type AppliedKind =
  | 'tarea'
  | 'examen'
  | 'nota'
  | 'evento'
  | 'asignatura'
  | 'completada'
  | 'reabierta'
  | 'estudio'
  | 'editada'
  | 'borrada'
  | 'subtareas'
  | 'objetivo'

export interface AppliedItem {
  kind: AppliedKind
  /** Texto para el alumno. */
  text: string
  /**
   * Lo mismo para el modelo, con el id: así en el siguiente mensaje puede
   * entender «muévelo al viernes» sin buscar a ciegas.
   */
  memo: string
}

export interface ApplyResult {
  data: AppData
  applied: AppliedItem[]
  /** Acciones descartadas, con el motivo, para enseñárselo al alumno. */
  skipped: string[]
}

const PRIORITIES: Priority[] = ['baja', 'media', 'alta', 'urgente']
const STATUSES: TaskStatus[] = ['pendiente', 'en_progreso', 'completada']
const TERMS: TermId[] = ['T1', 'T2', 'T3']
const KINDS: GradeKind[] = ['examen', 'trabajo', 'practica', 'oral', 'participacion', 'otro']

/** Número a la española: «7,5», no «7.5». */
export const es = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })

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
const has = (a: AssistantAction, key: keyof AssistantAction) =>
  Object.prototype.hasOwnProperty.call(a, key) && a[key] !== undefined
const pct = (v: unknown): number | undefined => {
  const n = num(v)
  return n !== undefined && n > 0 && n <= 100 ? n : undefined
}

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

const dayLabel = (day: string, today: string) =>
  day === today ? 'hoy' : day === addDays(today, 1) ? 'mañana' : formatDayMonth(day)

/** Tarea por id; si no, por título (primero entre las abiertas). */
function findTask(data: AppData, action: AssistantAction, openOnly = false): Task | undefined {
  const byId = data.tasks.find((t) => t.id === action.task_id)
  if (byId) return byId
  const wanted = action.title ? normalize(action.title) : ''
  if (!wanted) return undefined
  const pool = data.tasks.filter((t) => !openOnly || t.status !== 'completada')
  const open = pool.filter((t) => t.status !== 'completada')
  const match = (list: Task[]) =>
    list.find((t) => normalize(t.title) === wanted) ??
    list.find((t) => normalize(t.title).includes(wanted))
  return match(open) ?? match(pool)
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
  const subjectName = (id?: string) => data.subjects.find((s) => s.id === id)?.name

  for (const action of actions.slice(0, 25)) {
    if (!action || typeof action !== 'object') continue
    const mentionsSubject = has(action, 'subject_id') || has(action, 'subject_name')
    const subject = () => resolveSubject(data.subjects, action.subject_id, action.subject_name)
    const term = (TERMS as string[]).includes(action.term ?? '')
      ? (action.term as TermId)
      : data.settings.activeTerm
    const missingSubject = (what: string) =>
      skipped.push(
        `${what}: no encuentro la asignatura «${action.subject_name ?? action.subject_id ?? '?'}».`,
      )

    switch (action.type) {
      // ----------------------------------------------------------- asignaturas
      case 'add_subject': {
        const name = text(action.subject_name ?? action.title, 80)
        if (!name) {
          skipped.push('Una asignatura sin nombre.')
          break
        }
        // Ya existe: no se duplica, y lo que venga detrás la encontrará.
        if (resolveSubject(data.subjects, undefined, name)) break
        data = reducer(data, {
          type: 'subject/add',
          subject: {
            name,
            color: nextFreeColor(data),
            weight: 4,
            schedule: [],
            categories: [],
          },
        })
        const created = data.subjects[data.subjects.length - 1]
        applied.push({
          kind: 'asignatura',
          text: name,
          memo: `asignatura creada «${name}» [${created.id}]`,
        })
        break
      }

      case 'set_target': {
        const s = subject()
        if (!s) {
          missingSubject('Objetivo')
          break
        }
        const max = data.settings.gradeScale.max
        const target = action.target === null ? null : num(action.target)
        if (target !== null && (target === undefined || target <= 0 || target > max)) {
          skipped.push(`Objetivo de ${s.name}: tiene que ser una nota entre 0 y ${es(max)}.`)
          break
        }
        data = reducer(data, {
          type: 'subject/update',
          id: s.id,
          patch: { targetGrade: target ?? undefined },
        })
        applied.push({
          kind: 'objetivo',
          text: target === null ? `${s.name} · sin objetivo` : `${s.name} · ${es(target)}`,
          memo: `objetivo de ${s.name} [${s.id}] = ${target ?? 'ninguno'}`,
        })
        break
      }

      // ---------------------------------------------------------------- tareas
      case 'add_task': {
        const title = text(action.title)
        if (!title) {
          skipped.push('Una tarea sin título.')
          break
        }
        const s = mentionsSubject ? subject() : undefined
        if (mentionsSubject && !s) {
          missingSubject(`«${title}»`)
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
            subtasks: cleanItems(action.items).map((t) => ({
              id: newId('st'),
              title: t,
              done: false,
            })),
          },
        })
        const created = data.tasks[data.tasks.length - 1]
        applied.push({
          kind: 'tarea',
          text: `${title}${dueDate ? ` · ${dayLabel(dueDate, today)}` : ''}`,
          memo: `tarea creada «${title}» [${created.id}]${dueDate ? ` para ${dueDate}` : ''}${s ? ` de ${s.name}` : ''}`,
        })
        break
      }

      case 'update_task': {
        const task = findTask(data, action)
        if (!task) {
          skipped.push(`No encuentro la tarea «${action.title ?? action.task_id}» para cambiarla.`)
          break
        }
        const patch: Partial<Task> = {}
        const changes: string[] = []
        // Con task_id, `title` es el título nuevo; sin él, sirvió para buscarla.
        const newTitle =
          action.task_id && action.task_id === task.id ? text(action.title) : undefined
        if (newTitle && newTitle !== task.title) {
          patch.title = newTitle
          changes.push(`título «${newTitle}»`)
        }
        if (action.date === null) {
          patch.dueDate = undefined
          patch.dueTime = undefined
          changes.push('sin fecha')
        } else if (isDay(action.date)) {
          patch.dueDate = action.date
          changes.push(dayLabel(action.date, today))
        } else if (has(action, 'date')) {
          skipped.push(`«${task.title}»: la fecha «${action.date}» no es válida.`)
          break
        }
        const hasDate =
          (patch.dueDate ?? (has(action, 'date') ? undefined : task.dueDate)) !== undefined
        if (action.time === null) {
          patch.dueTime = undefined
          changes.push('sin hora')
        } else if (isTime(action.time) && hasDate) {
          patch.dueTime = action.time
          changes.push(`a las ${action.time}`)
        }
        if ((PRIORITIES as string[]).includes(action.priority ?? '')) {
          patch.priority = action.priority as Priority
          changes.push(`prioridad ${action.priority}`)
        }
        if ((STATUSES as string[]).includes(action.status ?? '')) {
          patch.status = action.status as TaskStatus
          changes.push(action.status === 'en_progreso' ? 'en progreso' : action.status!)
        }
        if (num(action.estimated_minutes) && action.estimated_minutes! > 0) {
          patch.estimatedMinutes = Math.min(Math.round(action.estimated_minutes!), 24 * 60)
          changes.push(`${patch.estimatedMinutes} min`)
        }
        if (text(action.notes, 2000)) {
          patch.description = text(action.notes, 2000)
          changes.push('notas')
        }
        if (mentionsSubject) {
          const s = subject()
          if (!s) {
            missingSubject(`«${task.title}»`)
            break
          }
          patch.subjectId = s.id
          changes.push(s.name)
        }
        if (changes.length === 0) {
          skipped.push(`«${task.title}»: no me has dicho qué cambiar.`)
          break
        }
        data = reducer(data, { type: 'task/update', id: task.id, patch })
        applied.push({
          kind: 'editada',
          text: `${patch.title ?? task.title} · ${changes.join(', ')}`,
          memo: `tarea [${task.id}] «${patch.title ?? task.title}» cambiada: ${changes.join(', ')}${patch.dueDate ? ` (${patch.dueDate})` : ''}`,
        })
        break
      }

      case 'complete_task':
      case 'reopen_task': {
        const completing = action.type === 'complete_task'
        const task = findTask(data, action, completing)
        if (!task) {
          skipped.push(
            `No encuentro la tarea «${action.title ?? action.task_id}» para ${completing ? 'completarla' : 'reabrirla'}.`,
          )
          break
        }
        const done = task.status === 'completada'
        if (done !== completing) {
          data = reducer(data, {
            type: 'task/update',
            id: task.id,
            patch: { status: completing ? 'completada' : 'pendiente' },
          })
        }
        applied.push({
          kind: completing ? 'completada' : 'reabierta',
          text: task.title,
          memo: `tarea [${task.id}] «${task.title}» ${completing ? 'completada' : 'reabierta'}`,
        })
        break
      }

      case 'delete_task': {
        const task = findTask(data, action)
        if (!task) {
          skipped.push(`No encuentro la tarea «${action.title ?? action.task_id}» para borrarla.`)
          break
        }
        data = reducer(data, { type: 'task/remove', id: task.id })
        applied.push({
          kind: 'borrada',
          text: `Tarea «${task.title}»`,
          memo: `tarea [${task.id}] «${task.title}» borrada`,
        })
        break
      }

      case 'add_subtasks': {
        const task = findTask(data, action)
        const items = cleanItems(action.items)
        if (!task || items.length === 0) {
          skipped.push(
            task
              ? `«${task.title}»: no hay pasos que añadir.`
              : `No encuentro la tarea «${action.title ?? action.task_id}» para añadirle pasos.`,
          )
          break
        }
        data = reducer(data, {
          type: 'task/update',
          id: task.id,
          patch: {
            subtasks: [
              ...task.subtasks,
              ...items.map((t) => ({ id: newId('st'), title: t, done: false })),
            ],
          },
        })
        applied.push({
          kind: 'subtareas',
          text: `${task.title} · ${items.length} paso${items.length === 1 ? '' : 's'}`,
          memo: `tarea [${task.id}] con ${items.length} subtareas nuevas: ${items.join('; ')}`,
        })
        break
      }

      // -------------------------------------------------------------- exámenes
      case 'add_exam': {
        const s = subject()
        if (!s) {
          missingSubject('Examen')
          break
        }
        if (!isDay(action.date)) {
          skipped.push(`Examen de ${s.name}: falta una fecha válida.`)
          break
        }
        data = reducer(data, {
          type: 'exam/add',
          exam: {
            subjectId: s.id,
            title: text(action.title) ?? `Examen de ${s.name}`,
            date: action.date,
            time: isTime(action.time) ? action.time : undefined,
            topics: text(action.notes, 1000),
            weight: pct(action.weight),
            term,
          },
        })
        const created = data.exams[data.exams.length - 1]
        applied.push({
          kind: 'examen',
          text: `${s.name} · ${dayLabel(action.date, today)}`,
          memo: `examen creado «${created.title}» [${created.id}] de ${s.name} el ${action.date}`,
        })
        break
      }

      case 'update_exam': {
        const exam = data.exams.find((e) => e.id === action.exam_id)
        if (!exam) {
          skipped.push('No encuentro ese examen para cambiarlo.')
          break
        }
        const patch: Partial<Exam> = {}
        const changes: string[] = []
        if (text(action.title) && text(action.title) !== exam.title) {
          patch.title = text(action.title)
          changes.push(`título «${patch.title}»`)
        }
        if (isDay(action.date)) {
          patch.date = action.date
          changes.push(dayLabel(action.date, today))
        } else if (has(action, 'date') && action.date !== null) {
          skipped.push(`Examen «${exam.title}»: la fecha «${action.date}» no es válida.`)
          break
        }
        if (action.time === null) {
          patch.time = undefined
          changes.push('sin hora')
        } else if (isTime(action.time)) {
          patch.time = action.time
          changes.push(`a las ${action.time}`)
        }
        if (text(action.notes, 1000)) {
          patch.topics = text(action.notes, 1000)
          changes.push('temario')
        }
        if (pct(action.weight)) {
          patch.weight = pct(action.weight)
          changes.push(`${es(patch.weight!)} %`)
        }
        if ((TERMS as string[]).includes(action.term ?? '')) {
          patch.term = action.term as TermId
          changes.push(`${action.term}`)
        }
        if (mentionsSubject) {
          const s = subject()
          if (!s) {
            missingSubject(`Examen «${exam.title}»`)
            break
          }
          patch.subjectId = s.id
          changes.push(s.name)
        }
        if (changes.length === 0) {
          skipped.push(`Examen «${exam.title}»: no me has dicho qué cambiar.`)
          break
        }
        data = reducer(data, { type: 'exam/update', id: exam.id, patch })
        applied.push({
          kind: 'editada',
          text: `Examen de ${subjectName(patch.subjectId ?? exam.subjectId) ?? '?'} · ${changes.join(', ')}`,
          memo: `examen [${exam.id}] cambiado: ${changes.join(', ')}${patch.date ? ` (${patch.date})` : ''}`,
        })
        break
      }

      case 'delete_exam': {
        const exam = data.exams.find((e) => e.id === action.exam_id)
        if (!exam) {
          skipped.push('No encuentro ese examen para borrarlo.')
          break
        }
        data = reducer(data, { type: 'exam/remove', id: exam.id })
        applied.push({
          kind: 'borrada',
          text: `Examen «${exam.title}» · ${subjectName(exam.subjectId) ?? ''}`,
          memo: `examen [${exam.id}] «${exam.title}» borrado`,
        })
        break
      }

      // ----------------------------------------------------------------- notas
      case 'add_grade': {
        const s = subject()
        if (!s) {
          missingSubject('Nota')
          break
        }
        const maxScore =
          num(action.max_score) && action.max_score! > 0
            ? action.max_score!
            : data.settings.gradeScale.max
        const score = num(action.score)
        if (score === undefined || score < 0 || score > maxScore) {
          skipped.push(`Nota de ${s.name}: el valor no es válido sobre ${es(maxScore)}.`)
          break
        }
        const weight = pct(action.weight)
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
            term: has(action, 'term') ? term : (exam?.term ?? term),
            name: text(action.title) ?? exam?.title ?? 'Examen',
            kind: (KINDS as string[]).includes(action.grade_kind ?? '')
              ? (action.grade_kind as GradeKind)
              : 'examen',
            score,
            maxScore,
            weight: weight ?? exam?.weight ?? 0,
            date: isDay(action.date) ? action.date : (exam?.date ?? today),
          },
          linkExamId: exam?.id,
        })
        const created = data.grades[data.grades.length - 1]
        const shownWeight = weight ?? exam?.weight
        applied.push({
          kind: 'nota',
          text: `${s.name} · ${es(score)}/${es(maxScore)}${shownWeight ? ` · ${es(shownWeight)} %` : ''}`,
          memo: `nota creada [${created.id}] ${s.name}: ${score}/${maxScore}, peso ${created.weight} %, ${created.term}${exam ? `, del examen [${exam.id}]` : ''}`,
        })
        break
      }

      case 'update_grade': {
        const grade = data.grades.find((g) => g.id === action.grade_id)
        if (!grade) {
          skipped.push('No encuentro esa nota para cambiarla.')
          break
        }
        const patch: Partial<GradeEntry> = {}
        const changes: string[] = []
        const maxScore =
          num(action.max_score) && action.max_score! > 0 ? action.max_score! : grade.maxScore
        if (maxScore !== grade.maxScore) patch.maxScore = maxScore
        const score = num(action.score)
        if (has(action, 'score')) {
          if (score === undefined || score < 0 || score > maxScore) {
            skipped.push(`Nota «${grade.name}»: el valor no es válido sobre ${es(maxScore)}.`)
            break
          }
          patch.score = score
          changes.push(`${es(score)}/${es(maxScore)}`)
        } else if (grade.score > maxScore) {
          skipped.push(`Nota «${grade.name}»: un ${es(grade.score)} no cabe sobre ${es(maxScore)}.`)
          break
        }
        if (pct(action.weight)) {
          patch.weight = pct(action.weight)
          changes.push(`${es(patch.weight!)} %`)
        }
        if ((TERMS as string[]).includes(action.term ?? '')) {
          patch.term = action.term as TermId
          changes.push(action.term!)
        }
        if (text(action.title)) {
          patch.name = text(action.title)
          changes.push(`«${patch.name}»`)
        }
        if ((KINDS as string[]).includes(action.grade_kind ?? '')) {
          patch.kind = action.grade_kind as GradeKind
          changes.push(action.grade_kind!)
        }
        if (isDay(action.date)) {
          patch.date = action.date
          changes.push(formatDayMonth(action.date))
        }
        const s = data.subjects.find((x) => x.id === grade.subjectId)
        if (action.category_id && s?.categories.some((c) => c.id === action.category_id)) {
          patch.categoryId = action.category_id
          changes.push('categoría')
        }
        if (changes.length === 0 && patch.maxScore === undefined) {
          skipped.push(`Nota «${grade.name}»: no me has dicho qué cambiar.`)
          break
        }
        data = reducer(data, { type: 'grade/update', id: grade.id, patch })
        applied.push({
          kind: 'editada',
          text: `Nota de ${s?.name ?? '?'} · ${changes.join(', ')}`,
          memo: `nota [${grade.id}] cambiada: ${changes.join(', ')}`,
        })
        break
      }

      case 'delete_grade': {
        const grade = data.grades.find((g) => g.id === action.grade_id)
        if (!grade) {
          skipped.push('No encuentro esa nota para borrarla.')
          break
        }
        data = reducer(data, { type: 'grade/remove', id: grade.id })
        applied.push({
          kind: 'borrada',
          text: `Nota «${grade.name}» · ${subjectName(grade.subjectId) ?? ''} · ${es(grade.score)}`,
          memo: `nota [${grade.id}] borrada`,
        })
        break
      }

      // --------------------------------------------------------------- eventos
      case 'add_event': {
        const title = text(action.title)
        if (!title || !isDay(action.date)) {
          skipped.push(`Evento${title ? ` «${title}»` : ''}: falta título o fecha válida.`)
          break
        }
        const s = mentionsSubject ? subject() : undefined
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
        const created = data.events[data.events.length - 1]
        applied.push({
          kind: 'evento',
          text: `${title} · ${dayLabel(action.date, today)}`,
          memo: `evento creado «${title}» [${created.id}] el ${action.date}`,
        })
        break
      }

      case 'update_event': {
        const event = data.events.find((e) => e.id === action.event_id)
        if (!event) {
          skipped.push('No encuentro ese evento para cambiarlo.')
          break
        }
        const patch: Partial<CalendarEvent> = {}
        const changes: string[] = []
        if (text(action.title)) {
          patch.title = text(action.title)
          changes.push(`«${patch.title}»`)
        }
        if (isDay(action.date)) {
          patch.date = action.date
          changes.push(dayLabel(action.date, today))
        }
        if (action.time === null) {
          patch.startTime = undefined
          changes.push('sin hora')
        } else if (isTime(action.time)) {
          patch.startTime = action.time
          changes.push(`a las ${action.time}`)
        }
        if (text(action.notes, 1000)) {
          patch.notes = text(action.notes, 1000)
          changes.push('notas')
        }
        if (changes.length === 0) {
          skipped.push(`Evento «${event.title}»: no me has dicho qué cambiar.`)
          break
        }
        data = reducer(data, { type: 'event/update', id: event.id, patch })
        applied.push({
          kind: 'editada',
          text: `${patch.title ?? event.title} · ${changes.join(', ')}`,
          memo: `evento [${event.id}] cambiado: ${changes.join(', ')}`,
        })
        break
      }

      case 'delete_event': {
        const event = data.events.find((e) => e.id === action.event_id)
        if (!event) {
          skipped.push('No encuentro ese evento para borrarlo.')
          break
        }
        data = reducer(data, { type: 'event/remove', id: event.id })
        applied.push({
          kind: 'borrada',
          text: `Evento «${event.title}»`,
          memo: `evento [${event.id}] borrado`,
        })
        break
      }

      // --------------------------------------------------------------- estudio
      case 'log_study': {
        const minutes = num(action.minutes)
        if (!minutes || minutes <= 0) {
          skipped.push('Sesión de estudio sin duración.')
          break
        }
        const s = mentionsSubject ? subject() : undefined
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
          memo: `estudio registrado: ${Math.round(minutes)} min${s ? ` de ${s.name}` : ''} el ${day}`,
        })
        break
      }

      default:
        skipped.push('Una acción que no sé hacer.')
    }
  }

  return { data, applied, skipped }
}

function cleanItems(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return items
    .map((i) => text(i, 200))
    .filter((i): i is string => !!i)
    .slice(0, 20)
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

const ENTITIES = ['subjects', 'tasks', 'exams', 'grades', 'events', 'sessions'] as const
type EntityKey = (typeof ENTITIES)[number]
type Entity = { id: string } & Record<string, unknown>

interface Change {
  id: string
  /** Campos cambiados. Va aparte porque JSON pierde las claves `undefined`. */
  fields: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
}

/**
 * Lo que hizo una respuesta del asistente, para poder revertirlo. Se guarda
 * con la conversación (JSON), así que solo lleva datos planos.
 */
export interface UndoPlan {
  created: Record<EntityKey, string[]>
  deleted: Record<EntityKey, Entity[]>
  changed: Record<EntityKey, Change[]>
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Qué ha cambiado entre antes y después, entidad a entidad y campo a campo. */
export function planUndo(before: AppData, after: AppData): UndoPlan {
  const plan: UndoPlan = {
    created: {} as UndoPlan['created'],
    deleted: {} as UndoPlan['deleted'],
    changed: {} as UndoPlan['changed'],
  }
  for (const key of ENTITIES) {
    const old = new Map((before[key] as unknown as Entity[]).map((x) => [x.id, x]))
    const now = new Map((after[key] as unknown as Entity[]).map((x) => [x.id, x]))
    plan.created[key] = [...now.keys()].filter((id) => !old.has(id))
    plan.deleted[key] = [...old.values()].filter((x) => !now.has(x.id))
    plan.changed[key] = []
    for (const [id, next] of now) {
      const prev = old.get(id)
      if (!prev || prev === next) continue
      const fields = [...new Set([...Object.keys(prev), ...Object.keys(next)])].filter(
        (f) => !same(prev[f], next[f]),
      )
      if (fields.length === 0) continue
      plan.changed[key].push({
        id,
        fields,
        before: Object.fromEntries(fields.map((f) => [f, prev[f]])),
        after: Object.fromEntries(fields.map((f) => [f, next[f]])),
      })
    }
  }
  return plan
}

export function isEmptyPlan(plan: UndoPlan): boolean {
  return ENTITIES.every(
    (k) => !plan.created[k]?.length && !plan.deleted[k]?.length && !plan.changed[k]?.length,
  )
}

/**
 * Revierte un plan sobre el estado ACTUAL, que puede haber cambiado después:
 * un campo solo se devuelve a su valor anterior si nadie lo ha vuelto a tocar.
 */
export function applyUndo(data: AppData, plan: UndoPlan): AppData {
  let next = data
  const list = (key: EntityKey) => next[key] as unknown as Entity[]
  const set = (key: EntityKey, items: Entity[]) => {
    next = { ...next, [key]: items }
  }

  // 1. Quitar lo creado (las notas antes que los exámenes, por el enlace).
  for (const id of plan.created.grades ?? []) next = reducer(next, { type: 'grade/remove', id })
  for (const key of ['exams', 'tasks', 'events', 'sessions'] as const) {
    const ids = new Set(plan.created[key] ?? [])
    if (ids.size)
      set(
        key,
        list(key).filter((x) => !ids.has(x.id)),
      )
  }
  for (const id of plan.created.subjects ?? []) next = reducer(next, { type: 'subject/remove', id })

  // 2. Devolver lo borrado, tal cual estaba (mismo id).
  for (const key of ENTITIES) {
    for (const item of plan.deleted[key] ?? []) {
      if (list(key).some((x) => x.id === item.id)) continue
      const subjectId = item.subjectId as string | undefined
      const subjectGone = subjectId && !next.subjects.some((s) => s.id === subjectId)
      if (subjectGone && (key === 'exams' || key === 'grades')) continue
      set(key, [...list(key), subjectGone ? { ...item, subjectId: undefined } : item])
    }
  }

  // 3. Deshacer los cambios de campos que siguen como los dejó la IA.
  for (const key of ENTITIES) {
    for (const change of plan.changed[key] ?? []) {
      set(
        key,
        list(key).map((item) => {
          if (item.id !== change.id) return item
          const restored: Entity = { ...item }
          for (const f of change.fields) {
            if (!same(item[f], change.after[f])) continue
            if (change.before[f] === undefined) delete restored[f]
            else restored[f] = change.before[f]
          }
          return restored
        }),
      )
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// Contexto para el modelo
// ---------------------------------------------------------------------------

const WEEKDAY = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long' })

/**
 * Lo que la IA necesita saber para resolver «biología», «el jueves», «el
 * examen de mates» o «¿qué nota necesito?»: el curso, ya resumido y con las
 * cuentas hechas por la app (medias, porcentaje evaluado, nota necesaria),
 * para que el modelo no tenga que calcularlas y equivocarse.
 */
export function buildContext(data: AppData, today: string, now: Date = new Date()) {
  const scale = data.settings.gradeScale
  const active = data.settings.activeTerm
  const r2 = (n: number | null | undefined) => (n === null || n === undefined ? null : round(n, 2))
  const weekAgo = addDays(today, -7)
  const monthAgo = addDays(today, -30)

  const subjects = data.subjects
    .filter((s) => !s.archived)
    .map((s) => {
      const byTerm = Object.fromEntries(
        TERMS.map((t) => {
          const res = subjectResult(s, data.grades, scale, t)
          return [
            t,
            res.average === null
              ? null
              : {
                  avg: r2(res.average),
                  evaluated_pct: r2(res.evaluatedPercent),
                },
          ]
        }).filter(([, v]) => v !== null),
      )
      const current = subjectResult(s, data.grades, scale, active)
      const course = subjectResult(s, data.grades, scale, 'todas')
      const need =
        s.targetGrade !== undefined
          ? requiredGrade(
              current.average ?? 0,
              current.average === null ? 0 : current.evaluatedPercent,
              s.targetGrade,
              scale,
            )
          : null
      return {
        id: s.id,
        name: s.name,
        short: s.shortName,
        target: s.targetGrade ?? null,
        categories: s.categories.map((c) => ({
          id: c.id,
          name: c.name,
          weight: c.weight,
        })),
        terms: byTerm,
        course_avg: r2(course.average),
        // Qué media hace falta en lo que queda del trimestre activo para el objetivo.
        needed_for_target: need
          ? {
              needed: r2(need.needed),
              remaining_pct: r2(need.remainingPercent),
              status: need.status,
            }
          : null,
        study_min_7d: data.sessions
          .filter((x) => x.subjectId === s.id && x.startedAt.slice(0, 10) >= weekAgo)
          .reduce((sum, x) => sum + x.minutes, 0),
      }
    })

  const results = new Map(
    data.subjects.map((s) => [s.id, subjectResult(s, data.grades, scale, active)]),
  )
  const scored = data.subjects.filter((s) => !s.archived && results.get(s.id)?.average !== null)
  const termAverage = scored.length
    ? r2(scored.reduce((sum, s) => sum + results.get(s.id)!.average!, 0) / scored.length)
    : null

  const task = (t: Task) => ({
    id: t.id,
    title: t.title,
    subject_id: t.subjectId,
    due: t.dueDate,
    time: t.dueTime,
    priority: t.priority,
    status: t.status,
    minutes: t.estimatedMinutes,
    steps: t.subtasks.length
      ? `${t.subtasks.filter((x) => x.done).length}/${t.subtasks.length}`
      : undefined,
    notes: t.description?.slice(0, 120),
  })

  return {
    today,
    weekday: WEEKDAY(today),
    now: now.toTimeString().slice(0, 5),
    // Calendario de días cercanos: el modelo busca «el jueves» aquí en lugar
    // de calcularlo, que es donde se equivocaba.
    next_days: Array.from({ length: 21 }, (_, i) => {
      const day = addDays(today, i)
      return { date: day, weekday: WEEKDAY(day) }
    }),
    past_days: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, -(i + 1))
      return { date: day, weekday: WEEKDAY(day) }
    }),
    active_term: active,
    grade_max: scale.max,
    pass_grade: scale.pass,
    term_average: termAverage,
    student_name: data.settings.userName || undefined,
    subjects,
    open_tasks: data.tasks
      .filter((t) => t.status !== 'completada')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .slice(0, 80)
      .map(task),
    recently_completed: data.tasks
      .filter((t) => t.status === 'completada')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .slice(0, 12)
      .map((t) => ({
        id: t.id,
        title: t.title,
        subject_id: t.subjectId,
        done_at: t.completedAt?.slice(0, 10),
      })),
    exams: data.exams
      .filter((e) => e.date >= monthAgo || !e.gradeEntryId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 50)
      .map((e) => ({
        id: e.id,
        subject_id: e.subjectId,
        title: e.title,
        date: e.date,
        time: e.time,
        term: e.term,
        weight: e.weight,
        topics: e.topics?.slice(0, 160),
        grade_id: e.gradeEntryId ?? null,
      })),
    recent_grades: [...data.grades]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40)
      .map((g) => ({
        id: g.id,
        subject_id: g.subjectId,
        name: g.name,
        score: g.score,
        max: g.maxScore,
        weight: g.weight,
        term: g.term,
        kind: g.kind,
        date: g.date,
        category_id: g.categoryId ?? undefined,
      })),
    events: data.events
      .filter((e) => e.date >= weekAgo)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 30)
      .map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        time: e.startTime,
      })),
    study_min_today: data.sessions
      .filter((x) => x.startedAt.slice(0, 10) === today)
      .reduce((sum, x) => sum + x.minutes, 0),
  }
}

export type AssistantContext = ReturnType<typeof buildContext>
