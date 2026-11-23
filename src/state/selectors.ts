/**
 * Datos derivados.
 *
 * Nada de lo que hay aquí se guarda: todo se calcula a partir del estado. Es
 * lo que garantiza que la media de la portada y la de la ficha de asignatura
 * no puedan discrepar nunca — salen de la misma función.
 */

import { useMemo, useSyncExternalStore } from 'react'

import { detectAlerts, type Alert } from '../domain/alerts.ts'
import { clockOf, examsAwaitingGrade, isExamOver, pendingExams } from '../domain/exams.ts'
import { goalProgress, type GoalContext, type GoalProgress } from '../domain/goals.ts'
import { daysUntil, startOfWeek, toDay } from '../domain/dates.ts'
import { globalAverage, subjectResult, type SubjectResult } from '../domain/grades.ts'
import { bucketOf, isOverdue, sortTasks } from '../domain/tasks.ts'
import type { DateISO, Exam, Goal, ID, Subject, Task, TermId } from '../domain/types.ts'
import { useStore } from './StoreProvider'

// ---------------------------------------------------------------------------
// Reloj compartido de minutos (un único temporizador para toda la app)
// ---------------------------------------------------------------------------

let currentMinute = Math.floor(Date.now() / 60_000)
const minuteListeners = new Set<() => void>()
let clockTimer: number | null = null

function tickMinuteClock() {
  const next = Math.floor(Date.now() / 60_000)
  if (next === currentMinute) return
  currentMinute = next
  for (const listener of minuteListeners) listener()
}

function subscribeMinuteClock(listener: () => void): () => void {
  minuteListeners.add(listener)
  if (minuteListeners.size === 1 && typeof window !== 'undefined') {
    clockTimer = window.setInterval(tickMinuteClock, 30_000)
    document.addEventListener('visibilitychange', tickMinuteClock)
  }
  return () => {
    minuteListeners.delete(listener)
    if (minuteListeners.size === 0 && typeof window !== 'undefined') {
      if (clockTimer !== null) {
        window.clearInterval(clockTimer)
        clockTimer = null
      }
      document.removeEventListener('visibilitychange', tickMinuteClock)
    }
  }
}

/** Minuto actual (hora local), compartido por todos los componentes que lo usan. */
export function useMinuteClock(): number {
  return useSyncExternalStore(
    subscribeMinuteClock,
    () => currentMinute,
    () => currentMinute,
  )
}

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

/** Exámenes pendientes de hacer, más los pasados recientes (<= 14 días) sin nota. */
export function useUpcomingExams(limit?: number): Exam[] {
  const { data, today } = useStore()
  const minute = useMinuteClock()
  return useMemo(() => {
    const subjectMap = new Map(data.subjects.map((s) => [s.id, s]))
    const gradeIds = new Set(data.grades.map((g) => g.id))
    const clock = clockOf(new Date(minute * 60_000))
    const list = data.exams
      .filter((e) => !subjectMap.get(e.subjectId)?.archived)
      .filter((e) => {
        const hasGrade = !!(e.gradeEntryId && gradeIds.has(e.gradeEntryId))
        if (hasGrade) return false
        if (!isExamOver(e, subjectMap, clock)) return true
        return daysUntil(e.date, today) >= -14
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    return limit ? list.slice(0, limit) : list
  }, [data.exams, data.subjects, data.grades, today, minute, limit])
}

/**
 * Exámenes que todavía están por hacer: sin nota y sin haber pasado su hora
 * (o la de su clase). Es lo que se puede sugerir estudiar.
 */
export function usePendingExams(limit?: number): Exam[] {
  const { data, today } = useStore()
  const minute = useMinuteClock()
  return useMemo(() => {
    const list = pendingExams(data.exams, data.subjects, clockOf(new Date(minute * 60_000)))
    return limit ? list.slice(0, limit) : list
    // `today` también cuenta: cambia a medianoche aunque el reloj vaya parado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.exams, data.subjects, minute, today, limit])
}

/** Exámenes ya hechos que siguen sin nota (para preguntar «¿qué tal?»). */
export function useExamsAwaitingGrade(): Exam[] {
  const { data, today } = useStore()
  const minute = useMinuteClock()
  return useMemo(
    () =>
      examsAwaitingGrade(
        data.exams,
        data.subjects,
        new Set(data.grades.map((g) => g.id)),
        clockOf(new Date(minute * 60_000)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.exams, data.subjects, data.grades, minute, today],
  )
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
    const archived = new Set(data.subjects.filter((s) => s.archived).map((s) => s.id))
    const gradeIds = new Set(data.grades.map((g) => g.id))
    const index = new Map<DateISO, DayItem[]>()
    const push = (day: DateISO, item: DayItem) => {
      const list = index.get(day)
      if (list) list.push(item)
      else index.set(day, [item])
    }

    for (const task of data.tasks) {
      if (!task.dueDate) continue
      if (task.subjectId && archived.has(task.subjectId)) continue
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
      if (archived.has(exam.subjectId)) continue
      push(exam.date, {
        id: exam.id,
        kind: 'examen',
        title: exam.title,
        subjectId: exam.subjectId,
        time: exam.time,
        done: !!(exam.gradeEntryId && gradeIds.has(exam.gradeEntryId)),
      })
    }
    for (const event of data.events) {
      if (event.subjectId && archived.has(event.subjectId)) continue
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
  }, [data.tasks, data.exams, data.events, data.subjects, data.grades])
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------

/**
 * Objetivos activos con su progreso ya calculado.
 *
 * Calcula cada evaluación una sola vez (T1, T2, T3 y curso completo) y
 * reutiliza el resultado correspondiente para la evaluación activa, evitando
 * duplicar el cálculo de `subjectResult`.
 */
export function useGoalsProgress(): { goal: Goal; progress: GoalProgress }[] {
  const { data, today } = useStore()
  const settings = data.settings
  const t1 = useSubjectResults('T1')
  const t2 = useSubjectResults('T2')
  const t3 = useSubjectResults('T3')
  const courseResults = useSubjectResults('todas')

  return useMemo(() => {
    const mode = settings.averageMode
    const byTerm: Record<TermId, { results: Map<ID, SubjectResult>; average: number | null }> = {
      T1: { results: t1, average: globalAverage(data.subjects, t1, mode) },
      T2: { results: t2, average: globalAverage(data.subjects, t2, mode) },
      T3: { results: t3, average: globalAverage(data.subjects, t3, mode) },
    }
    const active = byTerm[settings.activeTerm]
    const courseAverage = globalAverage(data.subjects, courseResults, mode)

    const context: GoalContext = {
      tasks: data.tasks,
      sessions: data.sessions,
      subjects: data.subjects,
      results: active.results,
      globalAverage: active.average,
      courseResults,
      courseAverage,
      termResults: (term: TermId) => byTerm[term],
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
    t1,
    t2,
    t3,
    courseResults,
    settings.activeTerm,
    settings.averageMode,
    settings.gradeScale,
    settings.weekStartsOn,
    today,
  ])
}
