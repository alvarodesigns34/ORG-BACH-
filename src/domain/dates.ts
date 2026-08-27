/**
 * Utilidades de fecha.
 *
 * Todo lo que sea "un dia del calendario" se maneja como cadena 'YYYY-MM-DD'
 * construida en hora local. Usar `new Date('2026-09-18')` interpretaria la
 * cadena como UTC y, al oeste de Greenwich, mostraria el dia anterior: por eso
 * `parseDay` construye la fecha componente a componente.
 */

import type { DateISO } from './types.ts'

export const WEEKDAYS_LONG = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
]

export const WEEKDAYS_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

export const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const pad = (n: number) => String(n).padStart(2, '0')

/** Convierte un Date a 'YYYY-MM-DD' usando sus componentes locales. */
export function toDay(date: Date): DateISO {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Convierte 'YYYY-MM-DD' a un Date a medianoche local. */
export function parseDay(day: DateISO): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function today(): DateISO {
  return toDay(new Date())
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function addDays(day: DateISO, amount: number): DateISO {
  const date = parseDay(day)
  date.setDate(date.getDate() + amount)
  return toDay(date)
}

export function addMonths(day: DateISO, amount: number): DateISO {
  const date = parseDay(day)
  // Fijar el dia 1 antes de sumar evita que el 31 de enero + 1 mes caiga en marzo.
  const targetDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + amount)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(targetDay, lastDay))
  return toDay(date)
}

/** Dias enteros entre hoy y `day`. Negativo si ya pasó. */
export function daysUntil(day: DateISO, from: DateISO = today()): number {
  const ms = parseDay(day).getTime() - parseDay(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function isToday(day: DateISO, from: DateISO = today()): boolean {
  return day === from
}

export function startOfWeek(day: DateISO, weekStartsOn: 0 | 1 = 1): DateISO {
  const date = parseDay(day)
  const diff = (date.getDay() - weekStartsOn + 7) % 7
  return addDays(day, -diff)
}

export function endOfWeek(day: DateISO, weekStartsOn: 0 | 1 = 1): DateISO {
  return addDays(startOfWeek(day, weekStartsOn), 6)
}

export function startOfMonth(day: DateISO): DateISO {
  const date = parseDay(day)
  return toDay(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function endOfMonth(day: DateISO): DateISO {
  const date = parseDay(day)
  return toDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

export function isSameMonth(a: DateISO, b: DateISO): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function isWithin(day: DateISO, from: DateISO, to: DateISO): boolean {
  return day >= from && day <= to
}

/**
 * Rejilla del mes: seis filas de siete dias, empezando en el primer dia de la
 * semana del 1 del mes. Seis filas fijas evitan que el calendario cambie de
 * altura al pasar de mes.
 */
export function monthGrid(month: DateISO, weekStartsOn: 0 | 1 = 1): DateISO[] {
  const first = startOfWeek(startOfMonth(month), weekStartsOn)
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

/** 'martes, 25 de agosto' */
export function formatLongDate(day: DateISO): string {
  const date = parseDay(day)
  return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} de ${MONTHS_LONG[date.getMonth()]}`
}

/** 'Viernes 18 de septiembre' */
export function formatDayMonth(day: DateISO, capitalize = false): string {
  const date = parseDay(day)
  const weekday = WEEKDAYS_LONG[date.getDay()]
  const text = `${weekday} ${date.getDate()} de ${MONTHS_LONG[date.getMonth()]}`
  return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** '18 sept' */
export function formatShort(day: DateISO): string {
  const date = parseDay(day)
  const month = MONTHS_LONG[date.getMonth()].slice(0, 3)
  return `${date.getDate()} ${month}`
}

/** 'septiembre 2026' */
export function formatMonthYear(day: DateISO): string {
  const date = parseDay(day)
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Distancia en lenguaje natural: 'Hoy', 'Mañana', 'En 4 días', 'Hace 2 días'.
 * Es lo que evita que el alumno tenga que restar fechas mentalmente.
 */
export function relativeDay(day: DateISO, from: DateISO = today()): string {
  const diff = daysUntil(day, from)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  if (diff === 2) return 'Pasado mañana'
  if (diff > 0) return `En ${diff} días`
  return `Hace ${Math.abs(diff)} días`
}

/** '1 h 35 min', '45 min', '2 h'. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/** Minutos transcurridos entre dos horas 'HH:MM'. */
/** Saludo segun la hora del sistema. */
export function greeting(date: Date = new Date()): string {
  const h = date.getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 14) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}
