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
  StudySession,
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
  | { type: 'task/toggle'; id: ID }
  | { type: 'grade/add'; grade: New<GradeEntry>; linkExamId?: ID }
  | { type: 'grade/update'; id: ID; patch: Partial<GradeEntry> }
  | { type: 'grade/remove'; id: ID }
  | { type: 'exam/add'; exam: New<Exam> }
  | { type: 'exam/update'; id: ID; patch: Partial<Exam> }
  | { type: 'exam/remove'; id: ID }
  | { type: 'event/add'; event: New<CalendarEvent> }
  | { type: 'event/update'; id: ID; patch: Partial<CalendarEvent> }
  | { type: 'event/remove'; id: ID }
  | { type: 'session/add'; session: Omit<StudySession, 'id'> }
  | { type: 'session/remove'; id: ID }
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
        activity: logActivity(state, 'asignatura_creada', `Asignatura añadida: ${subject.name}`, subject.id),
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
        tasks: state.tasks.map((t) => (t.subjectId === action.id ? { ...t, subjectId: undefined } : t)),
        events: state.events.map((e) =>
          e.subjectId === action.id ? { ...e, subjectId: undefined } : e,
        ),
        sessions: state.sessions.map((s) =>
          s.subjectId === action.id ? { ...s, subjectId: undefined } : s,
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
        completedAt: completing ? action.task.completedAt ?? nowISO() : undefined,
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

    // --- Sesiones de estudio ---

    case 'session/add': {
      const minutes = Math.min(Math.max(0, Math.round(action.session.minutes)), 24 * 60)
      if (minutes <= 0) return state
      const session: StudySession = { ...action.session, id: newId('ses'), minutes }
      return {
        ...state,
        sessions: [...state.sessions, session],
        activity: logActivity(
          state,
          'estudio_registrado',
          withSubject(state, session.subjectId, `Sesión de estudio: ${session.minutes} min`),
          session.subjectId,
        ),
      }
    }

    case 'session/remove':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) }

    // --- Objetivos ---

    case 'goal/add': {
      const goal: Goal = { ...action.goal, id: newId('goal'), createdAt: nowISO() }
      return {
        ...state,
        goals: [...state.goals, goal],
        activity: logActivity(state, 'objetivo_creado', `Objetivo creado: ${goal.title}`, goal.subjectId),
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
