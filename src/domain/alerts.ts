/**
 * Detección de situaciones que merecen aviso.
 *
 * El criterio es deliberadamente restrictivo. Una alerta que salta siempre deja
 * de leerse, así que aquí solo entra lo accionable: algo que el alumno puede
 * arreglar hoy. Nada de "tienes 12 tareas" cuando 12 tareas es lo normal.
 */

import { daysUntil, formatDuration, relativeDay } from './dates'
import { formatGrade } from './grades'
import type { SubjectResult } from './grades'
import { isOverdue } from './tasks'
import type { DateISO, Exam, GradeScale, Subject, Task } from './types'

export type AlertLevel = 'critico' | 'aviso' | 'info'

export interface Alert {
  id: string
  level: AlertLevel
  title: string
  detail: string
  /** Ruta a la que lleva la alerta, si se puede actuar desde algún sitio. */
  href?: string
}

export interface AlertInput {
  tasks: Task[]
  exams: Exam[]
  subjects: Subject[]
  results: Map<string, SubjectResult>
  scale: GradeScale
  today: DateISO
  examAlertDays: number
}

/** Umbral por encima del cual la acumulación de tareas es señal, no ruido. */
const TASK_PILEUP_THRESHOLD = 6

export function detectAlerts(input: AlertInput): Alert[] {
  const { tasks, exams, subjects, results, scale, today, examAlertDays } = input
  const alerts: Alert[] = []

  // --- Tareas atrasadas ---
  const overdue = tasks.filter((t) => isOverdue(t, today))
  if (overdue.length > 0) {
    const oldest = overdue.reduce((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? a : b))
    alerts.push({
      id: 'tareas-atrasadas',
      level: 'critico',
      title: overdue.length === 1 ? '1 tarea atrasada' : `${overdue.length} tareas atrasadas`,
      detail:
        overdue.length === 1
          ? `«${oldest.title}» venció ${relativeDay(oldest.dueDate!, today).toLowerCase()}.`
          : `La más antigua, «${oldest.title}», venció ${relativeDay(oldest.dueDate!, today).toLowerCase()}.`,
      href: '#/tareas?vista=atrasadas',
    })
  }

  // --- Exámenes inminentes ---
  const upcoming = exams
    .filter((e) => {
      const d = daysUntil(e.date, today)
      return d >= 0 && d <= examAlertDays
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const tomorrow = upcoming.filter((e) => daysUntil(e.date, today) <= 1)
  for (const exam of tomorrow) {
    const subject = subjects.find((s) => s.id === exam.subjectId)
    const when = daysUntil(exam.date, today) === 0 ? 'hoy' : 'mañana'
    alerts.push({
      id: `examen-${exam.id}`,
      level: 'critico',
      title: `Examen ${when}: ${subject?.name ?? 'sin asignatura'}`,
      detail: exam.topics ? `${exam.title} — ${exam.topics}` : exam.title,
      href: '#/calendario',
    })
  }

  // Los que no son inminentes se agrupan: un aviso por examen sería ruido.
  const later = upcoming.filter((e) => daysUntil(e.date, today) > 1)
  if (later.length > 0) {
    const next = later[0]
    const subject = subjects.find((s) => s.id === next.subjectId)
    alerts.push({
      id: 'examenes-proximos',
      level: 'aviso',
      title:
        later.length === 1
          ? `Examen ${relativeDay(next.date, today).toLowerCase()}`
          : `${later.length} exámenes en los próximos ${examAlertDays} días`,
      detail: `El siguiente: ${subject?.name ?? 'sin asignatura'} — ${next.title}, ${relativeDay(next.date, today).toLowerCase()}.`,
      href: '#/calendario',
    })
  }

  // --- Asignaturas por debajo de su objetivo ---
  const below = subjects
    .filter((s) => !s.archived && s.targetGrade !== undefined)
    .map((s) => ({ subject: s, result: results.get(s.id) }))
    .filter(
      (x): x is { subject: Subject; result: SubjectResult } =>
        !!x.result && x.result.average !== null && x.result.average < (x.subject.targetGrade ?? 0),
    )

  if (below.length > 0) {
    // Se avisa de la que más lejos está: es donde hay que poner el esfuerzo.
    const worst = below.reduce((a, b) => {
      const gapA = (a.subject.targetGrade ?? 0) - (a.result.average ?? 0)
      const gapB = (b.subject.targetGrade ?? 0) - (b.result.average ?? 0)
      return gapA >= gapB ? a : b
    })
    alerts.push({
      id: 'objetivo-asignatura',
      level: 'aviso',
      title:
        below.length === 1
          ? `${worst.subject.name} está por debajo de tu objetivo`
          : `${below.length} asignaturas por debajo de su objetivo`,
      detail: `${worst.subject.name}: llevas ${formatGrade(worst.result.average, scale)} y aspiras a ${formatGrade(worst.subject.targetGrade ?? null, scale)}.`,
      href: '#/asignaturas',
    })
  }

  // --- Acumulación de trabajo esta semana ---
  const thisWeek = tasks.filter((t) => {
    if (t.status === 'completada' || !t.dueDate) return false
    const d = daysUntil(t.dueDate, today)
    return d >= 0 && d <= 6
  })
  if (thisWeek.length >= TASK_PILEUP_THRESHOLD) {
    const minutes = thisWeek.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0)
    alerts.push({
      id: 'acumulacion',
      level: 'info',
      title: `${thisWeek.length} tareas en los próximos 7 días`,
      detail:
        minutes > 0
          ? `Suman ${formatDuration(minutes)} de trabajo estimado. Reparte antes de que se junten.`
          : 'Conviene repartirlas antes de que se junten al final de la semana.',
      href: '#/tareas?vista=proximas',
    })
  }

  return alerts
}
