/**
 * Estadísticas derivadas.
 *
 * Todo se calcula a partir de los datos que el alumno ya ha introducido: no
 * hay nada estimado ni rellenado. Si no hay datos, las funciones devuelven
 * listas vacías y la interfaz enseña un estado vacío en lugar de un gráfico
 * plano que finge tener información.
 */

import { addDays, toDay } from './dates.ts'
import { globalAverage, subjectResult, type SubjectResult } from './grades.ts'
import { isDone, isOverdue } from './tasks.ts'
import type {
  AverageMode,
  DateISO,
  GradeEntry,
  GradeScale,
  ID,
  StudySession,
  Subject,
  Task,
  TermId,
} from './types.ts'

// ---------------------------------------------------------------------------
// Evolución de la media
// ---------------------------------------------------------------------------

export interface TimelinePoint {
  date: DateISO
  average: number
  /** Notas registradas hasta esa fecha, incluida. */
  count: number
}

/**
 * Media global tal como estaba en cada fecha en la que entró una nota nueva.
 *
 * Se recalcula desde cero en cada fecha en lugar de ir promediando sobre la
 * marcha: es la única forma de que la curva respete los pesos de cada
 * categoría y coincida con la media que se ve en el resto de la aplicación.
 */
export function gradeTimeline(
  subjects: Subject[],
  grades: GradeEntry[],
  scale: GradeScale,
  mode: AverageMode,
  term: TermId | 'todas' = 'todas',
): TimelinePoint[] {
  const relevant = grades.filter((g) => term === 'todas' || g.term === term)
  if (relevant.length === 0) return []

  const dates = [...new Set(relevant.map((g) => g.date))].sort()

  return dates
    .map((date) => {
      const upTo = relevant.filter((g) => g.date <= date)
      const results = new Map<ID, SubjectResult>()
      for (const subject of subjects) {
        results.set(subject.id, subjectResult(subject, upTo, scale, term))
      }
      const average = globalAverage(subjects, results, mode)
      return average === null ? null : { date, average, count: upTo.length }
    })
    .filter((point): point is TimelinePoint => point !== null)
}

// ---------------------------------------------------------------------------
// Comparativa entre asignaturas
// ---------------------------------------------------------------------------

export interface SubjectStat {
  subject: Subject
  average: number
  /** Diferencia respecto al objetivo, si la asignatura tiene uno. */
  gap: number | null
}

/** Asignaturas con nota, de la más alta a la más baja. */
export function subjectRanking(
  subjects: Subject[],
  results: Map<ID, SubjectResult>,
): SubjectStat[] {
  return subjects
    .filter((s) => !s.archived)
    .map((subject) => {
      const average = results.get(subject.id)?.average
      if (average === null || average === undefined) return null
      return {
        subject,
        average,
        gap: subject.targetGrade !== undefined ? average - subject.targetGrade : null,
      }
    })
    .filter((stat): stat is SubjectStat => stat !== null)
    .sort((a, b) => b.average - a.average)
}

// ---------------------------------------------------------------------------
// Mejores y peores notas
// ---------------------------------------------------------------------------

export interface RankedGrade {
  grade: GradeEntry
  subject: Subject | undefined
  /** La nota llevada a la escala de la aplicación. */
  normalized: number
}

export function rankGrades(
  grades: GradeEntry[],
  subjects: Subject[],
  scale: GradeScale,
  term: TermId | 'todas' = 'todas',
): RankedGrade[] {
  const byId = new Map(subjects.map((s) => [s.id, s]))
  return grades
    .filter((g) => (term === 'todas' || g.term === term) && g.maxScore > 0)
    .map((grade) => ({
      grade,
      subject: byId.get(grade.subjectId),
      normalized: (grade.score / grade.maxScore) * scale.max,
    }))
    .sort((a, b) => b.normalized - a.normalized)
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export interface TaskStats {
  total: number
  completed: number
  pending: number
  overdue: number
  /** Porcentaje de tareas con fecha completadas antes de vencer (0-100). */
  onTimeRate: number | null
  withDueDate: number
}

export function taskStats(tasks: Task[], today: DateISO): TaskStats {
  const completed = tasks.filter(isDone)
  const overdue = tasks.filter((t) => isOverdue(t, today))

  // Solo se puede juzgar la puntualidad de lo que tenía fecha y ya está hecho.
  const judged = completed.filter((t) => t.dueDate && t.completedAt)
  const onTime = judged.filter((t) => (t.completedAt as string).slice(0, 10) <= (t.dueDate as string))

  return {
    total: tasks.length,
    completed: completed.length,
    pending: tasks.length - completed.length,
    overdue: overdue.length,
    onTimeRate: judged.length === 0 ? null : Math.round((onTime.length / judged.length) * 100),
    withDueDate: tasks.filter((t) => t.dueDate).length,
  }
}

// ---------------------------------------------------------------------------
// Estudio
// ---------------------------------------------------------------------------

export interface DayStudy {
  day: DateISO
  minutes: number
}

/** Minutos estudiados cada uno de los últimos `days` días, del más antiguo al más reciente. */
export function studyByDay(sessions: StudySession[], today: DateISO, days: number): DayStudy[] {
  const perDay = new Map<DateISO, number>()
  for (const session of sessions) {
    const day = toDay(new Date(session.startedAt))
    perDay.set(day, (perDay.get(day) ?? 0) + session.minutes)
  }
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - (days - 1))
    return { day, minutes: perDay.get(day) ?? 0 }
  })
}

export interface SubjectStudy {
  subject: Subject | undefined
  minutes: number
  /** Porcentaje sobre el total estudiado (0-100). */
  share: number
}

export function studyBySubject(
  sessions: StudySession[],
  subjects: Subject[],
  from?: DateISO,
): SubjectStudy[] {
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const perSubject = new Map<ID | undefined, number>()

  let total = 0
  for (const session of sessions) {
    if (from && toDay(new Date(session.startedAt)) < from) continue
    perSubject.set(session.subjectId, (perSubject.get(session.subjectId) ?? 0) + session.minutes)
    total += session.minutes
  }

  return [...perSubject.entries()]
    .map(([id, minutes]) => ({
      subject: id ? byId.get(id) : undefined,
      minutes,
      share: total === 0 ? 0 : (minutes / total) * 100,
    }))
    .sort((a, b) => b.minutes - a.minutes)
}
