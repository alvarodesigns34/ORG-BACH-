/**
 * ¿Un examen sigue por delante o ya se ha hecho?
 *
 * La fecha sola no basta: un examen de hoy a primera hora ya está hecho por
 * la tarde, y no tiene sentido sugerir estudiarlo a las 23:00. Se decide así:
 *
 * 1. Con nota registrada, o de un día anterior: hecho.
 * 2. De un día posterior: pendiente.
 * 3. De hoy:
 *    - Con hora: termina al acabar la clase de su asignatura en la que cae
 *      esa hora; si no cae en ninguna, una hora después de empezar.
 *    - Sin hora: termina al acabar la última clase de su asignatura ese día
 *      (si tiene clase dos veces, el examen puede ser en cualquiera).
 *    - Sin hora ni clase de esa asignatura ese día: al acabar la jornada
 *      (última clase de cualquier asignatura) o, sin horario, a las 20:00.
 *
 * Todo en hora local del dispositivo, igual que `today` en la tienda: en
 * España es la hora de Europa/Madrid, con su cambio de verano incluido.
 */

import { toDay } from './dates.ts'
import { toMinutes } from './schedule.ts'
import type { DateISO, Exam, Subject } from './types.ts'

/** Duración supuesta de un examen con hora que no cae en ninguna clase. */
export const EXAM_DEFAULT_MINUTES = 60
/** Fin supuesto de un examen sin hora ni horario: las 20:00. */
export const EXAM_FALLBACK_END = 20 * 60

/** Un instante como día local y minutos desde medianoche. */
export interface Clock {
  day: DateISO
  minutes: number
}

export function clockOf(date: Date): Clock {
  return { day: toDay(date), minutes: date.getHours() * 60 + date.getMinutes() }
}

/** Día de la semana (0 = domingo) de una fecha 'YYYY-MM-DD'. */
function weekdayOf(day: DateISO): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay()
}

/** Franjas legibles de un día de la semana, en minutos. */
function slotsOn(subject: Subject | undefined, weekday: number): { start: number; end: number }[] {
  if (!subject) return []
  const out: { start: number; end: number }[] = []
  for (const slot of subject.schedule ?? []) {
    if (slot.day !== weekday) continue
    const start = toMinutes(slot.start)
    const end = toMinutes(slot.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    out.push({ start, end })
  }
  return out
}

/**
 * Minuto del día en que se da por terminado el examen. Se une con la franja
 * contigua: en una clase doble (10:00–11:00 y 11:00–12:00) acaba a las 12:00.
 */
export function examEndMinute(exam: Exam, subjects: Map<string, Subject> | Subject[]): number {
  const map = Array.isArray(subjects) ? new Map(subjects.map((s) => [s.id, s])) : subjects
  const weekday = weekdayOf(exam.date)
  const own = slotsOn(map.get(exam.subjectId), weekday).sort((a, b) => a.start - b.start)

  // Une franjas seguidas (o solapadas) en bloques.
  const blocks: { start: number; end: number }[] = []
  for (const slot of own) {
    const last = blocks[blocks.length - 1]
    if (last && slot.start <= last.end) last.end = Math.max(last.end, slot.end)
    else blocks.push({ ...slot })
  }

  const start = exam.time ? toMinutes(exam.time) : Number.NaN
  if (Number.isFinite(start)) {
    const block = blocks.find((b) => start >= b.start && start < b.end)
    return block ? block.end : Math.min(start + EXAM_DEFAULT_MINUTES, 24 * 60)
  }

  if (blocks.length) return blocks[blocks.length - 1].end

  let dayEnd = Number.NaN
  for (const subject of map.values()) {
    if (subject.archived) continue
    for (const slot of slotsOn(subject, weekday)) {
      if (!(slot.end <= dayEnd)) dayEnd = slot.end
    }
  }
  return Number.isFinite(dayEnd) ? dayEnd : EXAM_FALLBACK_END
}

/** ¿Ya se ha hecho el examen a esta hora? */
export function isExamOver(exam: Exam, subjects: Map<string, Subject> | Subject[], now: Clock): boolean {
  if (exam.gradeEntryId) return true
  if (exam.date < now.day) return true
  if (exam.date > now.day) return false
  return now.minutes >= examEndMinute(exam, subjects)
}

/** Exámenes que aún están por hacer, del más cercano al más lejano. */
export function pendingExams(exams: Exam[], subjects: Map<string, Subject> | Subject[], now: Clock): Exam[] {
  const map = Array.isArray(subjects) ? new Map(subjects.map((s) => [s.id, s])) : subjects
  return exams
    .filter((e) => !isExamOver(e, map, now))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
}
