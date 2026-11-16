/**
 * Estadísticas derivadas.
 *
 * Todo se calcula a partir de los datos que el alumno ya ha introducido: no
 * hay nada estimado ni rellenado. Si no hay datos, las funciones devuelven
 * listas vacías y la interfaz enseña un estado vacío en lugar de un gráfico
 * plano que finge tener información.
 */

import { globalAverage, subjectResult, type SubjectResult } from './grades.ts'
import { dueMoment, isDone, isOverdue, wasOnTime } from './tasks.ts'
import type {
  AverageMode,
  DateISO,
  GradeEntry,
  GradeScale,
  ID,
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
  /** Tareas sobre las que se calcula `onTimeRate`. */
  judged: number
  withDueDate: number
}

export function taskStats(
  tasks: Task[],
  today: DateISO,
  now: number = Date.now(),
): TaskStats {
  const completed = tasks.filter(isDone)
  const overdue = tasks.filter((t) => isOverdue(t, today, now))

  // Solo se puede juzgar la puntualidad de lo que tenía fecha y ya está hecho.
  // La comparación es al instante, no al día: una tarea con hora límite a las
  // 10:00 entregada a las 18:00 llegó tarde, aunque fuera la misma fecha.
  //
  // Y solo las que existían antes de su plazo: apuntar los deberes de ayer
  // para marcarlos hechos no es entregar tarde, y contaban como tal (un solo
  // caso así dejaba «A tiempo: 0 %»).
  const judgements = completed
    .filter((t) => {
      const due = dueMoment(t)
      return !due || Date.parse(t.createdAt) <= due.getTime()
    })
    .map(wasOnTime)
    .filter((v): v is boolean => v !== null)
  const onTime = judgements.filter(Boolean)

  return {
    total: tasks.length,
    completed: completed.length,
    pending: tasks.length - completed.length,
    overdue: overdue.length,
    onTimeRate:
      judgements.length === 0 ? null : Math.round((onTime.length / judgements.length) * 100),
    judged: judgements.length,
    withDueDate: tasks.filter((t) => t.dueDate).length,
  }
}
