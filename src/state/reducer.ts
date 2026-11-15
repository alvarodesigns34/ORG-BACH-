/**
 * Reductor de la aplicación: función pura `(estado, acción) → estado`.
 *
 * Ninguna vista modifica datos por su cuenta; todas despachan acciones. Eso
 * mantiene un único sitio donde ocurren los cambios, hace que el registro de
 * actividad se escriba solo y deja el estado reproducible para depurar.
 */

import { newId } from '../domain/id.ts'
import { nowISO } from '../domain/dates.ts'
import { deriveShortName } from '../domain/palette.ts'
import { applyManualOrder } from '../domain/tasks.ts'
import type {
  ActivityEntry,
  ActivityKind,
  AppData,
  CalendarEvent,
  Exam,
  GradeEntry,
  Goal,
  ID,
  Settings,
  FocusSession,
  Subject,
  Task,
} from '../domain/types.ts'

/** Entradas de actividad que se conservan. Más allá, deja de ser "reciente". */
const ACTIVITY_LIMIT = 60

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Datos de una entidad sin los campos que genera el propio reductor. */
type New<T extends { id: ID; createdAt: string }> = Omit<T, 'id' | 'createdAt'>

export type Action =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'data/replace'; data: AppData }
  | { type: 'subject/add'; subject: New<Subject> }
  | { type: 'subject/addMany'; subjects: New<Subject>[] }
  | { type: 'subject/update'; id: ID; patch: Partial<Subject> }
  | { type: 'subject/remove'; id: ID }
  | { type: 'task/add'; task: New<Task> }
  | { type: 'task/update'; id: ID; patch: Partial<Task> }
  | { type: 'task/remove'; id: ID }
  /** Devuelve una tarea borrada tal cual estaba (mismo id): el «Deshacer». */
  | { type: 'task/restore'; task: Task }
  | { type: 'task/toggle'; id: ID }
  /** «Mi orden»: `ids` en su nuevo orden (puede ser solo la parte visible). */
  | { type: 'task/reorder'; ids: ID[] }
  | {
      type: 'session/start'
      session: Pick<
        FocusSession,
        | 'from'
        | 'to'
        | 'distanceKm'
        | 'plannedMinutes'
        | 'seat'
        | 'subjectId'
        | 'taskId'
        | 'layoverMinutes'
      >
      /** El texto de la actividad: «Madrid → Barcelona». */
      route?: string
    }
  | { type: 'session/pause'; id: ID }
  | { type: 'session/resume'; id: ID }
  /** Empieza la escala: una pausa marcada, que la vista reanuda sola. */
  | { type: 'session/layover'; id: ID }
  | { type: 'session/land'; id: ID; route?: string }
  | { type: 'session/cancel'; id: ID }
  | { type: 'grade/add'; grade: New<GradeEntry>; linkExamId?: ID }
  | { type: 'grade/update'; id: ID; patch: Partial<GradeEntry> }
  | { type: 'grade/remove'; id: ID }
  | { type: 'exam/add'; exam: New<Exam> }
  | { type: 'exam/update'; id: ID; patch: Partial<Exam> }
  | { type: 'exam/remove'; id: ID }
  | { type: 'event/add'; event: New<CalendarEvent> }
  | { type: 'event/update'; id: ID; patch: Partial<CalendarEvent> }
  | { type: 'event/remove'; id: ID }
  | { type: 'goal/add'; goal: New<Goal> }
  | { type: 'goal/update'; id: ID; patch: Partial<Goal> }
  | { type: 'goal/remove'; id: ID }

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function logActivity(
  state: AppData,
  kind: ActivityKind,
  text: string,
  subjectId?: ID,
): ActivityEntry[] {
  const entry: ActivityEntry = { id: newId('act'), kind, at: nowISO(), text, subjectId }
  return [entry, ...state.activity].slice(0, ACTIVITY_LIMIT)
}

function patchById<T extends { id: ID }>(items: T[], id: ID, patch: Partial<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

function subjectName(state: AppData, id?: ID): string | undefined {
  if (!id) return undefined
  return state.subjects.find((s) => s.id === id)?.name
}

/** Prefijo 'Matemáticas · ' para el registro, cuando hay asignatura. */
function withSubject(state: AppData, id: ID | undefined, text: string): string {
  const name = subjectName(state, id)
  return name ? `${name} · ${text}` : text
}

// ---------------------------------------------------------------------------
// Reductor
// ---------------------------------------------------------------------------

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    // --- Ajustes y datos globales ---

    case 'settings/update': {
      const next = { ...state.settings, ...action.patch }
      if (action.patch.gradeScale) {
        next.gradeScale = { ...state.settings.gradeScale, ...action.patch.gradeScale }
      }
      return { ...state, settings: next }
    }

    case 'data/replace':
      return action.data

    // --- Asignaturas ---

    case 'subject/add': {
      const subject: Subject = {
        ...action.subject,
        shortName: action.subject.shortName || deriveShortName(action.subject.name),
        id: newId('sub'),
        createdAt: nowISO(),
      }
      return {
        ...state,
        subjects: [...state.subjects, subject],
        activity: logActivity(
          state,
          'asignatura_creada',
          `Asignatura añadida: ${subject.name}`,
          subject.id,
        ),
      }
    }

    case 'subject/addMany': {
      const subjects: Subject[] = action.subjects.map((s) => ({
        ...s,
        shortName: s.shortName || deriveShortName(s.name),
        id: newId('sub'),
        createdAt: nowISO(),
      }))
      return { ...state, subjects: [...state.subjects, ...subjects] }
    }

    case 'subject/update': {
      const patched = patchById(state.subjects, action.id, action.patch)
      const updated = patched.find((s) => s.id === action.id)
      if (!updated) return { ...state, subjects: patched }

      // La abreviatura se deriva aquí igual que al crear. El editor manda ''
      // cuando se deja el campo en blanco, y sin esto la insignia de la ficha
      // se quedaba vacía: solo el alta la rellenaba.
      const subjects = updated.shortName
        ? patched
        : patched.map((s) =>
            s.id === action.id ? { ...s, shortName: deriveShortName(s.name) } : s,
          )

      // Si la edición se ha llevado categorías por delante, sus notas
      // apuntaban a un id que ya no existe. Se sueltan a «sin categoría», que
      // es un estado que el cálculo sabe tratar; un id fantasma, no.
      const liveIds = new Set(updated.categories.map((c) => c.id))
      const grades = state.grades.map((g) =>
        g.subjectId === action.id && g.categoryId && !liveIds.has(g.categoryId)
          ? { ...g, categoryId: null }
          : g,
      )

      return { ...state, subjects, grades }
    }

    case 'subject/remove':
      // Al borrar una asignatura se borra su rastro académico (notas y
      // exámenes carecen de sentido sin ella), pero las tareas y los eventos
      // sobreviven sueltos: son trabajo real que el alumno puede reasignar.
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== action.id),
        grades: state.grades.filter((g) => g.subjectId !== action.id),
        exams: state.exams.filter((e) => e.subjectId !== action.id),
        // Los vuelos son tiempo estudiado de verdad: se quedan, sin asignatura.
        sessions: state.sessions.map((s) =>
          s.subjectId === action.id ? { ...s, subjectId: undefined } : s,
        ),
        tasks: state.tasks.map((t) =>
          t.subjectId === action.id ? { ...t, subjectId: undefined } : t,
        ),
        events: state.events.map((e) =>
          e.subjectId === action.id ? { ...e, subjectId: undefined } : e,
        ),
        // Un objetivo sobre la media de una asignatura que ya no existe no se
        // puede volver a medir. Se archiva en lugar de borrarlo (no se pierde
        // lo que el alumno escribió) y en lugar de dejarlo suelto (apuntando a
        // una asignatura fantasma, mostraría «sin notas» para siempre).
        goals: state.goals.map((g) =>
          g.subjectId === action.id ? { ...g, subjectId: undefined, archived: true } : g,
        ),
        activity: state.activity.map((a) =>
          a.subjectId === action.id ? { ...a, subjectId: undefined } : a,
        ),
      }

    // --- Tareas ---

    case 'task/add': {
      const completing = action.task.status === 'completada'
      const task: Task = {
        ...action.task,
        id: newId('task'),
        createdAt: nowISO(),
        completedAt: completing ? (action.task.completedAt ?? nowISO()) : undefined,
      }
      return {
        ...state,
        tasks: [...state.tasks, task],
        activity: logActivity(
          state,
          'tarea_creada',
          withSubject(state, task.subjectId, `Tarea creada: ${task.title}`),
          task.subjectId,
        ),
      }
    }

    case 'task/update': {
      const before = state.tasks.find((t) => t.id === action.id)
      const patch = { ...action.patch }

      // `completedAt` es consecuencia del estado, no un campo que rellene la
      // interfaz: se deriva aquí para que no puedan desincronizarse.
      if (patch.status && before && patch.status !== before.status) {
        patch.completedAt = patch.status === 'completada' ? nowISO() : undefined
      }

      const tasks = patchById(state.tasks, action.id, patch)
      const justCompleted =
        before && before.status !== 'completada' && patch.status === 'completada'

      return {
        ...state,
        tasks,
        activity: justCompleted
          ? logActivity(
              state,
              'tarea_completada',
              withSubject(state, before.subjectId, `Tarea completada: ${before.title}`),
              before.subjectId,
            )
          : state.activity,
      }
    }

    case 'task/remove':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) }

    case 'task/restore': {
      if (state.tasks.some((t) => t.id === action.task.id)) return state
      // La asignatura pudo borrarse mientras tanto: la tarea vuelve suelta.
      const subjectId =
        action.task.subjectId && state.subjects.some((s) => s.id === action.task.subjectId)
          ? action.task.subjectId
          : undefined
      return { ...state, tasks: [...state.tasks, { ...action.task, subjectId }] }
    }

    case 'task/toggle': {
      const task = state.tasks.find((t) => t.id === action.id)
      if (!task) return state
      const completing = task.status !== 'completada'
      const tasks = patchById(state.tasks, action.id, {
        status: completing ? 'completada' : 'pendiente',
        completedAt: completing ? nowISO() : undefined,
      })
      return {
        ...state,
        tasks,
        activity: completing
          ? logActivity(
              state,
              'tarea_completada',
              withSubject(state, task.subjectId, `Tarea completada: ${task.title}`),
              task.subjectId,
            )
          : state.activity,
      }
    }

    case 'task/reorder': {
      // Se numera todo de nuevo (0, 1, 2…) para que no queden empates ni
      // tareas sin posición, pero solo se tocan las que cambian: la
      // sincronización viaja campo a campo y no conviene mandar lo que no
      // se ha movido.
      const position = new Map(
        applyManualOrder(state.tasks, action.ids).map((task, index) => [task.id, index]),
      )
      let changed = false
      const tasks = state.tasks.map((task) => {
        const order = position.get(task.id)
        if (order === undefined || task.order === order) return task
        changed = true
        return { ...task, order }
      })
      return changed ? { ...state, tasks } : state
    }

    // --- Modo estudio ---

    case 'session/start': {
      // Un solo vuelo en el aire: el otro dispositivo pudo despegar antes.
      if (state.sessions.some((s) => s.status === 'en_vuelo')) return state
      const now = nowISO()
      const session: FocusSession = {
        ...action.session,
        id: newId('vuelo'),
        kind: 'vuelo',
        status: 'en_vuelo',
        startedAt: now,
        pausedMs: 0,
        createdAt: now,
      }
      return { ...state, sessions: [...state.sessions, session] }
    }

    case 'session/pause': {
      const s = state.sessions.find((x) => x.id === action.id)
      if (!s || s.status !== 'en_vuelo' || s.pausedAt) return state
      return { ...state, sessions: patchById(state.sessions, s.id, { pausedAt: nowISO() }) }
    }

    case 'session/layover': {
      const s = state.sessions.find((x) => x.id === action.id)
      if (!s || s.status !== 'en_vuelo' || s.pausedAt || s.layoverAt || !s.layoverMinutes) return state
      const now = nowISO()
      return { ...state, sessions: patchById(state.sessions, s.id, { pausedAt: now, layoverAt: now }) }
    }

    case 'session/resume': {
      const s = state.sessions.find((x) => x.id === action.id)
      if (!s || s.status !== 'en_vuelo' || !s.pausedAt) return state
      const paused = Math.max(0, Date.now() - Date.parse(s.pausedAt))
      return {
        ...state,
        sessions: patchById(state.sessions, s.id, {
          pausedAt: undefined,
          pausedMs: s.pausedMs + paused,
        }),
      }
    }

    case 'session/land': {
      const s = state.sessions.find((x) => x.id === action.id)
      if (!s || s.status !== 'en_vuelo') return state
      // La hora real de aterrizaje, no la de ahora: si el iPad estuvo
      // bloqueado, el vuelo terminó cuando tocaba y así cuenta en su día.
      const pausedOpen = s.pausedAt ? Date.now() - Date.parse(s.pausedAt) : 0
      const landed = Math.min(
        Date.now(),
        Date.parse(s.startedAt) + s.pausedMs + pausedOpen + s.plannedMinutes * 60_000,
      )
      const subject = subjectName(state, s.subjectId)
      return {
        ...state,
        sessions: patchById(state.sessions, s.id, {
          status: 'aterrizado',
          pausedAt: undefined,
          endedAt: new Date(landed).toISOString(),
          focusedMinutes: s.plannedMinutes,
        }),
        activity: logActivity(
          state,
          'vuelo_aterrizado',
          `Vuelo ${action.route ?? `${s.from} → ${s.to}`}${subject ? ` · ${subject}` : ''}`,
          s.subjectId,
        ),
      }
    }

    case 'session/cancel': {
      const s = state.sessions.find((x) => x.id === action.id)
      if (!s || s.status !== 'en_vuelo') return state
      const end = s.pausedAt ? Date.parse(s.pausedAt) : Date.now()
      const minutes = Math.floor(Math.max(0, end - Date.parse(s.startedAt) - s.pausedMs) / 60_000)
      return {
        ...state,
        sessions: patchById(state.sessions, s.id, {
          status: 'cancelado',
          pausedAt: undefined,
          endedAt: new Date(end).toISOString(),
          focusedMinutes: Math.min(minutes, s.plannedMinutes),
        }),
      }
    }

    // --- Subtareas ---

    // --- Notas ---

    case 'grade/add': {
      const grade: GradeEntry = { ...action.grade, id: newId('grade'), createdAt: nowISO() }
      const exam = action.linkExamId
        ? state.exams.find((e) => e.id === action.linkExamId)
        : undefined
      const canLink = exam && exam.subjectId === grade.subjectId
      return {
        ...state,
        grades: [...state.grades, grade],
        // El enlace con el examen se resuelve aquí porque es aquí donde se
        // genera el identificador: la vista no puede conocerlo de antemano.
        // Solo se enlaza si el examen es de la misma asignatura.
        exams: canLink
          ? patchById(state.exams, action.linkExamId!, { gradeEntryId: grade.id })
          : state.exams,
        activity: logActivity(
          state,
          'nota_anadida',
          withSubject(state, grade.subjectId, `Nota añadida: ${grade.name}`),
          grade.subjectId,
        ),
      }
    }

    case 'grade/update':
      return { ...state, grades: patchById(state.grades, action.id, action.patch) }

    case 'grade/remove':
      return {
        ...state,
        grades: state.grades.filter((g) => g.id !== action.id),
        // Un examen que apuntaba a esa nota vuelve a estar pendiente de nota.
        exams: state.exams.map((e) =>
          e.gradeEntryId === action.id ? { ...e, gradeEntryId: undefined } : e,
        ),
      }

    // --- Exámenes ---

    case 'exam/add': {
      const exam: Exam = { ...action.exam, id: newId('exam'), createdAt: nowISO() }
      return {
        ...state,
        exams: [...state.exams, exam],
        activity: logActivity(
          state,
          'examen_creado',
          withSubject(state, exam.subjectId, `Examen programado: ${exam.title}`),
          exam.subjectId,
        ),
      }
    }

    case 'exam/update': {
      const exams = patchById(state.exams, action.id, action.patch)
      const updated = exams.find((e) => e.id === action.id)
      if (!updated) return { ...state, exams }
      if (updated.gradeEntryId) {
        const grade = state.grades.find((g) => g.id === updated.gradeEntryId)
        if (!grade || grade.subjectId !== updated.subjectId) {
          return {
            ...state,
            exams: patchById(exams, action.id, { gradeEntryId: undefined }),
          }
        }
      }
      return { ...state, exams }
    }

    case 'exam/remove':
      return { ...state, exams: state.exams.filter((e) => e.id !== action.id) }

    // --- Eventos ---

    case 'event/add': {
      const event: CalendarEvent = { ...action.event, id: newId('ev'), createdAt: nowISO() }
      return { ...state, events: [...state.events, event] }
    }

    case 'event/update':
      return { ...state, events: patchById(state.events, action.id, action.patch) }

    case 'event/remove':
      return { ...state, events: state.events.filter((e) => e.id !== action.id) }

    // --- Objetivos ---

    case 'goal/add': {
      const goal: Goal = { ...action.goal, id: newId('goal'), createdAt: nowISO() }
      return {
        ...state,
        goals: [...state.goals, goal],
        activity: logActivity(
          state,
          'objetivo_creado',
          `Objetivo creado: ${goal.title}`,
          goal.subjectId,
        ),
      }
    }

    case 'goal/update':
      return { ...state, goals: patchById(state.goals, action.id, action.patch) }

    case 'goal/remove':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) }
  }

  const _exhaustive: never = action
  void _exhaustive
  return state
}
