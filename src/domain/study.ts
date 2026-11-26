/**
 * Lo que cuentan los vuelos del modo estudio cruzados con el resto del curso:
 * la constancia (días seguidos estudiando) y cuánto se estudió antes de cada
 * examen frente a la nota que salió.
 *
 * Todo sale de datos reales: minutos de vuelos cerrados (aterrizados o
 * abandonados, que también son tiempo estudiado) y notas registradas. No se
 * estima ni se rellena nada.
 */

import { toDay } from './dates.ts'
import type { Exam, FocusSession, GradeEntry, GradeScale, ID } from './types.ts'

const DAY_MS = 86_400_000

/** Día local (YYYY-MM-DD) en que terminó un vuelo. */
function sessionDay(session: FocusSession): string | null {
  return session.endedAt ? toDay(new Date(session.endedAt)) : null
}

/** Minutos estudiados en cada día local. Solo cuentan los vuelos cerrados. */
export function minutesByDay(sessions: FocusSession[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of sessions) {
    if (s.status === 'en_vuelo') continue
    const day = sessionDay(s)
    const minutes = s.focusedMinutes ?? 0
    if (!day || minutes <= 0) continue
    out.set(day, (out.get(day) ?? 0) + minutes)
  }
  return out
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + delta))
}

export interface Streak {
  /** Días seguidos estudiando hasta hoy (o hasta ayer, si hoy aún no). */
  current: number
  /** Hoy ya cuenta. Si es falso y `current` > 0, la racha sigue viva hasta medianoche. */
  today: boolean
  /** La racha más larga hasta ahora. */
  best: number
  /** Días con estudio en los últimos `window` días (incluido hoy), del más antiguo al más reciente. */
  recent: { day: string; minutes: number }[]
}

/**
 * Racha de días estudiando. Un día cuenta si hay al menos `minMinutes` de
 * estudio terminado ese día. Hoy sin estudiar todavía no rompe la racha: el
 * día no ha acabado.
 */
export function studyStreak(
  sessions: FocusSession[],
  today: string,
  { minMinutes = 1, window = 14 } = {},
): Streak {
  const byDay = minutesByDay(sessions)
  const studied = (day: string) => (byDay.get(day) ?? 0) >= minMinutes

  const studiedToday = studied(today)
  let current = 0
  let cursor = studiedToday ? today : shiftDay(today, -1)
  while (studied(cursor)) {
    current++
    cursor = shiftDay(cursor, -1)
  }

  let best = 0
  let run = 0
  let previous: string | null = null
  for (const day of [...byDay.keys()].filter(studied).sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }

  const recent = Array.from({ length: window }, (_, i) => {
    const day = shiftDay(today, i - window + 1)
    return { day, minutes: byDay.get(day) ?? 0 }
  })

  return { current, today: studiedToday, best: Math.max(best, current), recent }
}

// ---------------------------------------------------------------------------
// Estudio antes de cada examen
// ---------------------------------------------------------------------------

/** Si no hubo examen anterior de la asignatura, se mira como mucho tanto atrás. */
export const PREP_WINDOW_DAYS = 21

export interface ExamPrep {
  exam: Exam
  grade: GradeEntry
  /** Nota llevada a la escala de la app. */
  score: number
  /** Minutos de vuelos de la asignatura en la ventana de preparación. */
  minutes: number
  /** Días de la ventana (desde el examen anterior de la asignatura o 21). */
  windowDays: number
}

/**
 * Instante del examen. Con hora, esa hora; sin hora, el principio del día:
 * lo estudiado ese mismo día sin saber si fue antes o después no cuenta.
 */
function examMoment(exam: Exam): number {
  const [y, m, d] = exam.date.split('-').map(Number)
  const [hh, mm] = (exam.time ?? '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime()
}

/**
 * Cada examen con nota y el tiempo de estudio de su asignatura en los días
 * previos: desde el examen anterior de la misma asignatura (lo de antes era
 * para aquel) o, si no lo hubo, en las tres semanas anteriores.
 */
export function studyBeforeExams(
  sessions: FocusSession[],
  exams: Exam[],
  grades: GradeEntry[],
  scale: GradeScale,
): ExamPrep[] {
  const gradeById = new Map(grades.map((g) => [g.id, g]))
  const bySubject = new Map<ID, Exam[]>()
  for (const exam of exams) {
    const list = bySubject.get(exam.subjectId) ?? []
    list.push(exam)
    bySubject.set(exam.subjectId, list)
  }

  const rows: ExamPrep[] = []
  for (const [subjectId, list] of bySubject) {
    list.sort((a, b) => examMoment(a) - examMoment(b))
    list.forEach((exam, i) => {
      const grade = exam.gradeEntryId ? gradeById.get(exam.gradeEntryId) : undefined
      if (!grade || grade.maxScore <= 0) return
      const end = examMoment(exam)
      const floor = end - PREP_WINDOW_DAYS * DAY_MS
      const start = i > 0 ? Math.max(examMoment(list[i - 1]), floor) : floor
      let minutes = 0
      for (const s of sessions) {
        if (s.subjectId !== subjectId || s.status === 'en_vuelo' || !s.endedAt) continue
        const ended = Date.parse(s.endedAt)
        if (ended > start && ended <= end) minutes += s.focusedMinutes ?? 0
      }
      rows.push({
        exam,
        grade,
        score: (grade.score / grade.maxScore) * scale.max,
        minutes,
        windowDays: Math.max(1, Math.round((end - start) / DAY_MS)),
      })
    })
  }
  return rows.sort((a, b) => examMoment(b.exam) - examMoment(a.exam))
}

export interface PrepComparison {
  /** Umbral (mediana de minutos) que separa los dos grupos. */
  threshold: number
  more: { count: number; average: number }
  less: { count: number; average: number }
}

/**
 * Nota media de los exámenes en los que se estudió más que la mediana frente
 * a los de menos. Solo con 4 exámenes o más y alguna diferencia de tiempo:
 * con menos, cualquier conclusión sería ruido.
 */
export function comparePrep(rows: ExamPrep[]): PrepComparison | null {
  if (rows.length < 4) return null
  const sorted = [...rows].sort((a, b) => a.minutes - b.minutes)
  if (sorted[0].minutes === sorted[sorted.length - 1].minutes) return null

  const mid = Math.floor(sorted.length / 2)
  let less: ExamPrep[]
  let more: ExamPrep[]
  let threshold: number

  if (sorted[mid].minutes === 0) {
    // Si la mitad o más de los exámenes no tienen estudio registrado, partir
    // por la mediana metería ceros en el grupo de «más estudio». Comparamos
    // los preparados (> 0 min) frente a los que no tienen vuelos (0 min).
    less = sorted.filter((r) => r.minutes === 0)
    more = sorted.filter((r) => r.minutes > 0)
    if (less.length === 0 || more.length === 0) return null
    threshold = 0
  } else {
    less = sorted.slice(0, mid)
    more = sorted.slice(mid)
    threshold = more[0].minutes
  }

  const avg = (list: ExamPrep[]) => list.reduce((sum, r) => sum + r.score, 0) / list.length
  return {
    threshold,
    more: { count: more.length, average: avg(more) },
    less: { count: less.length, average: avg(less) },
  }
}

/** Minutos estudiados de cada asignatura en un tramo de días (incluidos). */
export function minutesBetween(
  sessions: FocusSession[],
  fromDay: string,
  toDayIncl: string,
): Map<ID | undefined, number> {
  const out = new Map<ID | undefined, number>()
  for (const s of sessions) {
    if (s.status === 'en_vuelo') continue
    const day = sessionDay(s)
    const m = s.focusedMinutes ?? 0
    if (!day || m <= 0 || day < fromDay || day > toDayIncl) continue
    out.set(s.subjectId, (out.get(s.subjectId) ?? 0) + m)
  }
  return out
}

// ---------------------------------------------------------------------------
// Plan de repaso de un examen
// ---------------------------------------------------------------------------

/** Tiempo de repaso que se propone para cada examen, en minutos. */
export const PREP_TARGET_MINUTES = 240

export interface ExamPlan {
  /** Minutos ya estudiados para este examen (su asignatura en la ventana, o vuelos ligados a él). */
  studied: number
  /** Objetivo de repaso. */
  target: number
  /** Lo que tocaba hoy al empezar el día (reparto del resto entre los días que quedan). */
  todayTarget: number
  /** Lo que queda de hoy. 0 = hoy ya está. */
  todayLeft: number
  /** Minutos estudiados hoy para este examen. */
  studiedToday: number
  /** Días que faltan (0 = hoy). */
  daysLeft: number
}

function round5(n: number): number {
  return Math.round(n / 5) * 5
}

/**
 * Reparto del repaso de un examen próximo: cuánto llevas, cuánto te queda y
 * cuánto toca HOY para llegar al objetivo repartiendo lo que falta entre los
 * días que quedan (el día del examen no cuenta salvo que sea hoy).
 *
 * Cuenta lo estudiado de la asignatura desde el examen anterior de esa misma
 * asignatura (o en las tres semanas previas) y cualquier vuelo ligado a este
 * examen. No guarda nada: se recalcula con cada vuelo.
 */
export function examPlan(
  exam: Exam,
  sessions: FocusSession[],
  exams: Exam[],
  today: string,
  target = PREP_TARGET_MINUTES,
): ExamPlan {
  const end = examMoment(exam)
  const [ty, tm, td] = today.split('-').map(Number)
  const todayStart = new Date(ty, tm - 1, td).getTime()
  const [ey, em, ed] = exam.date.split('-').map(Number)
  const daysLeft = Math.max(0, Math.round((new Date(ey, em - 1, ed).getTime() - todayStart) / DAY_MS))

  const previous = exams
    .filter((e) => e.id !== exam.id && e.subjectId === exam.subjectId && examMoment(e) < end)
    .reduce((max, e) => Math.max(max, examMoment(e)), 0)
  const start = Math.max(previous, end - PREP_WINDOW_DAYS * DAY_MS)

  let studied = 0
  let studiedToday = 0
  for (const s of sessions) {
    if (s.status === 'en_vuelo' || !s.endedAt) continue
    const ended = Date.parse(s.endedAt)
    const linked = s.examId === exam.id
    const inWindow = s.subjectId === exam.subjectId && ended > start && ended <= end
    if (!linked && !inWindow) continue
    const minutes = s.focusedMinutes ?? 0
    studied += minutes
    if (ended >= todayStart) studiedToday += minutes
  }

  const remainingAtDawn = Math.max(0, target - (studied - studiedToday))
  const daysToSplit = Math.max(1, daysLeft)
  const todayTarget =
    remainingAtDawn === 0 ? 0 : Math.min(remainingAtDawn, Math.max(15, Math.min(120, round5(remainingAtDawn / daysToSplit))))
  return {
    studied,
    target,
    todayTarget,
    todayLeft: Math.max(0, todayTarget - studiedToday),
    studiedToday,
    daysLeft,
  }
}
