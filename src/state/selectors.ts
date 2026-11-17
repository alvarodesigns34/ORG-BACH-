/**
 * Datos derivados.
 *
 * Nada de lo que hay aquí se guarda: todo se calcula a partir del estado. Es
 * lo que garantiza que la media de la portada y la de la ficha de asignatura
 * no puedan discrepar nunca — salen de la misma función.
 */

import { useMemo } from 'react'

import { detectAlerts, type Alert } from '../domain/alerts.ts'
import { goalProgress, type GoalContext, type GoalProgress } from '../domain/goals.ts'
import { daysUntil, startOfWeek, toDay } from '../domain/dates.ts'
import { globalAverage, subjectResult, type SubjectResult } from '../domain/grades.ts'
import { bucketOf, isOverdue, sortTasks } from '../domain/tasks.ts'
import type { DateISO, Exam, Goal, ID, Subject, Task, TermId } from '../domain/types.ts'
import { useStore } from './StoreProvider'

// ---------------------------------------------------------------------------
// Asignaturas
// ---------------------------------------------------------------------------

export function useSubjects(): Subject[] {
  const { data } = useStore()
  return useMemo(
    () => data.subjects.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [data.subjects],
  )
}

export function useSubjectMap(): Map<ID, Subject> {
  const { data } = useStore()
  return useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects])
}

export function useSubject(id: ID | undefined): Subject | undefined {
  const map = useSubjectMap()
  return id ? map.get(id) : undefined
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

/** Resultado de cada asignatura en la evaluación pedida. */
export function useSubjectResults(term: TermId | 'todas'): Map<ID, SubjectResult> {
  const { data } = useStore()
  const { subjects, grades, settings } = data
  return useMemo(() => {
    const map = new Map<ID, SubjectResult>()
    for (const subject of subjects) {
      map.set(subject.id, subjectResult(subject, grades, settings.gradeScale, term))
    }
    return map
  }, [subjects, grades, settings.gradeScale, term])
}

export function useGlobalAverage(term: TermId | 'todas'): number | null {
  const { data } = useStore()
  const results = useSubjectResults(term)
  return useMemo(
    () => globalAverage(data.subjects, results, data.settings.averageMode),
    [data.subjects, results, data.settings.averageMode],
  )
}

/** Media de cada evaluación más la nota final del curso. */
export function useTermAverages(): { term: TermId | 'final'; average: number | null }[] {
  const { data } = useStore()
  const t1 = useSubjectResults('T1')
  const t2 = useSubjectResults('T2')
  const t3 = useSubjectResults('T3')
  const all = useSubjectResults('todas')

  return useMemo(() => {
    const mode = data.settings.averageMode
    return [
      { term: 'T1' as const, average: globalAverage(data.subjects, t1, mode) },
      { term: 'T2' as const, average: globalAverage(data.subjects, t2, mode) },
      { term: 'T3' as const, average: globalAverage(data.subjects, t3, mode) },
      { term: 'final' as const, average: globalAverage(data.subjects, all, mode) },
    ]
  }, [data.subjects, data.settings.averageMode, t1, t2, t3, all])
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export interface TaskSummary {
  pending: Task[]
  today: Task[]
  overdue: Task[]
  upcoming: Task[]
  completedThisWeek: Task[]
}

export function useTaskSummary(): TaskSummary {
  const { data, today } = useStore()
  return useMemo(() => {
    const weekStart = startOfWeek(today, data.settings.weekStartsOn)
    const pending = data.tasks.filter((t) => t.status !== 'completada')

    return {
      pending: sortTasks(pending),
      // "Hoy" reúne lo que vence hoy y lo atrasado: es la lista real del día.
      today: sortTasks(
        pending.filter((t) => {
          const bucket = bucketOf(t, today)
          return bucket === 'hoy' || bucket === 'atrasada'
        }),
      ),
      overdue: sortTasks(pending.filter((t) => isOverdue(t, today))),
      upcoming: sortTasks(
        pending.filter((t) => {
          if (!t.dueDate) return false
          const d = daysUntil(t.dueDate, today)
          return d > 0 && d <= 7
        }),
      ),
      // El día natural sale de la hora local, no de recortar el ISO: una
      // tarea completada a las 00:30 en España puede llevar fecha del día
      // anterior en UTC, y `slice` la dejaría fuera de la semana equivocada.
      completedThisWeek: data.tasks.filter(
        (t) =>
          t.status === 'completada' &&
          t.completedAt &&
          toDay(new Date(t.completedAt)) >= weekStart,
      ),
    }
  }, [data.tasks, data.settings.weekStartsOn, today])
}

// ---------------------------------------------------------------------------
// Exámenes
// ---------------------------------------------------------------------------

/** Exámenes de hoy en adelante, más los pasados que siguen sin nota. */
export function useUpcomingExams(limit?: number): Exam[] {
  const { data, today } = useStore()
  return useMemo(() => {
    const list = data.exams
      .filter((e) => e.date >= today || !e.gradeEntryId)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    return limit ? list.slice(0, limit) : list
  }, [data.exams, today, limit])
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export function useAlerts(): Alert[] {
  const { data, today } = useStore()
  const results = useSubjectResults(data.settings.activeTerm)

  return useMemo(() => {
    if (!data.settings.alertsEnabled) return []
    return detectAlerts({
      tasks: data.tasks,
      exams: data.exams,
      subjects: data.subjects,
      results,
      scale: data.settings.gradeScale,
      today,
      examAlertDays: data.settings.examAlertDays,
    })
  }, [
    data.tasks,
    data.exams,
    data.subjects,
    data.settings.alertsEnabled,
    data.settings.gradeScale,
    data.settings.examAlertDays,
    results,
    today,
  ])
}

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------

export type DayItemKind = 'tarea' | 'examen' | 'evento'

export interface DayItem {
  id: ID
  kind: DayItemKind
  title: string
  subjectId?: ID
  time?: string
  done?: boolean
}

/** Todo lo que ocurre en cada día, indexado por fecha. */
export function useCalendarIndex(): Map<DateISO, DayItem[]> {
  const { data } = useStore()
  return useMemo(() => {
    const index = new Map<DateISO, DayItem[]>()
    const push = (day: DateISO, item: DayItem) => {
      const list = index.get(day)
      if (list) list.push(item)
      else index.set(day, [item])
    }

    for (const task of data.tasks) {
      if (!task.dueDate) continue
      push(task.dueDate, {
        id: task.id,
        kind: 'tarea',
        title: task.title,
        subjectId: task.subjectId,
        time: task.dueTime,
        done: task.status === 'completada',
      })
    }
    for (const exam of data.exams) {
      push(exam.date, {
        id: exam.id,
        kind: 'examen',
        title: exam.title,
        subjectId: exam.subjectId,
        time: exam.time,
      })
    }
    for (const event of data.events) {
      push(event.date, {
        id: event.id,
        kind: 'evento',
        title: event.title,
        subjectId: event.subjectId,
        time: event.startTime,
      })
    }
    // Dentro de un día manda la hora; lo que no la tiene queda al final.
    for (const list of index.values()) {
      list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    }
    return index
  }, [data.tasks, data.exams, data.events])
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------

/**
 * Objetivos activos con su progreso ya calculado.
 *
 * Las tres evaluaciones se calculan siempre —los hooks no pueden ir tras un
 * `if`— y salen de la misma función que el resto de medias, así que no pueden
 * discrepar de lo que enseña Notas.
 */
export function useGoalsProgress(): { goal: Goal; progress: GoalProgress }[] {
  const { data, today } = useStore()
  const settings = data.settings
  const results = useSubjectResults(settings.activeTerm)
  const average = useGlobalAverage(settings.activeTerm)
  const courseResults = useSubjectResults('todas')
  const courseAverage = useGlobalAverage('todas')
  const t1 = useSubjectResults('T1')
  const t2 = useSubjectResults('T2')
  const t3 = useSubjectResults('T3')
  const avg1 = useGlobalAverage('T1')
  const avg2 = useGlobalAverage('T2')
  const avg3 = useGlobalAverage('T3')

  return useMemo(() => {
    const context: GoalContext = {
      tasks: data.tasks,
      sessions: data.sessions,
      subjects: data.subjects,
      results,
      globalAverage: average,
      courseResults,
      courseAverage,
      termResults: (term: TermId) =>
        term === 'T1'
          ? { results: t1, average: avg1 }
          : term === 'T2'
            ? { results: t2, average: avg2 }
            : { results: t3, average: avg3 },
      scale: settings.gradeScale,
      today,
      weekStartsOn: settings.weekStartsOn,
    }
    return data.goals
      .filter((goal) => !goal.archived)
      .map((goal) => ({ goal, progress: goalProgress(goal, context) }))
  }, [
    data.tasks,
    data.sessions,
    data.subjects,
    data.goals,
    results,
    average,
    courseResults,
    courseAverage,
    t1,
    t2,
    t3,
    avg1,
    avg2,
    avg3,
    settings.gradeScale,
    settings.weekStartsOn,
    today,
  ])
}
