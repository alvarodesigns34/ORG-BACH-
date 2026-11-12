/**
 * Horario semanal.
 *
 * Cada asignatura guarda sus franjas (`schedule`). Aquí se juntan las de un
 * día y se responde a la pregunta de Inicio: ¿qué toca ahora y qué viene
 * después? Todo en minutos desde medianoche, sin objetos Date: una franja es
 * la misma todos los lunes, no un instante concreto.
 */

import type { ScheduleSlot, Subject, TimeHM } from './types.ts'

export interface ClassSlot {
  subject: Subject
  slot: ScheduleSlot
  /** Minutos desde medianoche. */
  start: number
  end: number
}

/** 'HH:MM' a minutos desde medianoche. NaN si no es una hora. */
export function toMinutes(time: TimeHM): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return Number.NaN
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return Number.NaN
  return hours * 60 + minutes
}

/** Clases de un día de la semana (0 = domingo), por orden de inicio. */
export function classesOn(subjects: Subject[], weekday: number): ClassSlot[] {
  const list: ClassSlot[] = []
  for (const subject of subjects) {
    if (subject.archived) continue
    for (const slot of subject.schedule) {
      if (slot.day !== weekday) continue
      const start = toMinutes(slot.start)
      const end = toMinutes(slot.end)
      // Una franja sin horas legibles o que acaba antes de empezar no se
      // puede colocar en el día: se ignora en vez de pintarla mal.
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
      list.push({ subject, slot, start, end })
    }
  }
  return list.sort((a, b) => a.start - b.start || a.end - b.end)
}

export interface DayStatus {
  classes: ClassSlot[]
  /** La clase en curso, con cuánto lleva (0–1) y cuánto le queda. */
  current: (ClassSlot & { progress: number; minutesLeft: number }) | null
  /** La siguiente clase de hoy y cuánto falta para que empiece. */
  next: (ClassSlot & { startsIn: number }) | null
  /** Clases ya terminadas. */
  done: number
}

/** Estado del día a una hora dada (minutos desde medianoche). */
export function dayStatus(classes: ClassSlot[], now: number): DayStatus {
  let current: DayStatus['current'] = null
  let next: DayStatus['next'] = null
  let done = 0
  for (const item of classes) {
    if (now >= item.end) {
      done += 1
    } else if (now >= item.start) {
      // Si dos franjas se solapan, manda la que empezó antes.
      current ??= {
        ...item,
        progress: (now - item.start) / (item.end - item.start),
        minutesLeft: item.end - now,
      }
    } else {
      next ??= { ...item, startsIn: item.start - now }
    }
  }
  return { classes, current, next, done }
}

/** «25 min», «1 h 10 min». */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
