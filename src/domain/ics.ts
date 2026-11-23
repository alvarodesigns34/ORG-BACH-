/**
 * Exportar tareas y exámenes a un calendario iCalendar (.ics, RFC 5545).
 *
 * Puro: devuelve el texto y quien lo llama decide cómo entregarlo. Con hora,
 * los eventos llevan la zona Europe/Madrid (con su VTIMEZONE, para que el
 * cambio de hora caiga bien en cualquier calendario); sin hora, son de día
 * completo. Cada elemento lleva un UID estable (`id@orbita`), así que un
 * calendario que lo respete actualiza en vez de duplicar al volver a importar.
 */

import { addDays } from './dates.ts'
import { examEndMinute } from './exams.ts'
import { toMinutes } from './schedule.ts'
import type { DateISO, Exam, Subject, Task } from './types.ts'

export const ICS_TIMEZONE = 'Europe/Madrid'

/** Exámenes de hace más de estos días no se exportan: ya no sirven de nada. */
const PAST_EXAM_DAYS = 30

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${ICS_TIMEZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/** Escapa un texto según RFC 5545 (barra, punto y coma, coma, saltos). */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Parte una línea en trozos de 75 octetos como pide el formato. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder()
  if (bytes.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const n = bytes.encode(char).length
    // La primera línea admite 75 octetos; las siguientes, 74 más el espacio.
    if (size + n > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compactDay = (day: DateISO) => day.replace(/-/g, '')
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

interface Item {
  uid: string
  summary: string
  description?: string
  day: DateISO
  /** Minutos desde medianoche; sin ellos, de día completo. */
  start?: number
  end?: number
  categories: string
}

function itemLines(item: Item, dtstamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${item.uid}`, `DTSTAMP:${dtstamp}`]
  if (item.start !== undefined && item.end !== undefined) {
    const end = Math.min(Math.max(item.end, item.start), 23 * 60 + 59)
    lines.push(
      `DTSTART;TZID=${ICS_TIMEZONE}:${compactDay(item.day)}T${hhmm(item.start)}`,
      `DTEND;TZID=${ICS_TIMEZONE}:${compactDay(item.day)}T${hhmm(end)}`,
    )
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${compactDay(item.day)}`,
      `DTEND;VALUE=DATE:${compactDay(addDays(item.day, 1))}`,
      // De día completo y sin ocupar: no bloquea el día en el calendario.
      'TRANSP:TRANSPARENT',
    )
  }
  lines.push(`SUMMARY:${escapeText(item.summary)}`)
  if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`)
  lines.push(`CATEGORIES:${escapeText(item.categories)}`, 'END:VEVENT')
  return lines
}

export interface IcsInput {
  tasks: Task[]
  exams: Exam[]
  events?: import('./types.ts').CalendarEvent[]
  subjects: Subject[]
  today: DateISO
  now?: Date
}

/** Lo que entraría en el calendario: para decir «12 tareas y 3 exámenes». */
export function icsSelection({ tasks, exams, events = [], subjects, today }: IcsInput): {
  tasks: Task[]
  exams: Exam[]
  events: import('./types.ts').CalendarEvent[]
} {
  const archived = new Set(subjects.filter((s) => s.archived).map((s) => s.id))
  const oldest = addDays(today, -PAST_EXAM_DAYS)
  return {
    // Tareas sin hacer con fecha (también las atrasadas: siguen pendientes).
    tasks: tasks.filter(
      (t) => t.dueDate && t.status !== 'completada' && !(t.subjectId && archived.has(t.subjectId)),
    ),
    exams: exams.filter((e) => e.date >= oldest && !archived.has(e.subjectId)),
    events: events.filter((ev) => ev.date >= oldest && !(ev.subjectId && archived.has(ev.subjectId))),
  }
}

export function buildIcs(input: IcsInput): string {
  const { subjects } = input
  const map = new Map(subjects.map((s) => [s.id, s]))
  const dtstamp = stamp(input.now ?? new Date())
  const { tasks, exams, events } = icsSelection(input)

  const items: Item[] = []
  for (const exam of exams) {
    const subject = map.get(exam.subjectId)
    const start = exam.time ? toMinutes(exam.time) : Number.NaN
    const name = subject?.name ?? 'Examen'
    items.push({
      uid: `${exam.id}@orbita`,
      summary: exam.title && exam.title !== name ? `Examen de ${name}: ${exam.title}` : `Examen de ${name}`,
      description: exam.topics ? `Temario: ${exam.topics}` : undefined,
      day: exam.date,
      ...(Number.isFinite(start) ? { start, end: examEndMinute(exam, map) } : {}),
      categories: 'Examen',
    })
  }
  for (const task of tasks) {
    const subject = task.subjectId ? map.get(task.subjectId) : undefined
    const start = task.dueTime ? toMinutes(task.dueTime) : Number.NaN
    items.push({
      uid: `${task.id}@orbita`,
      summary: subject ? `${task.title} (${subject.name})` : task.title,
      description: task.description,
      day: task.dueDate!,
      // Una tarea con hora es una entrega: un hueco corto a esa hora.
      ...(Number.isFinite(start) ? { start, end: start + 30 } : {}),
      categories: 'Tarea',
    })
  }
  for (const ev of events) {
    const subject = ev.subjectId ? map.get(ev.subjectId) : undefined
    const start = ev.startTime ? toMinutes(ev.startTime) : Number.NaN
    const endRaw = ev.endTime ? toMinutes(ev.endTime) : Number.NaN
    const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 60
    items.push({
      uid: `${ev.id}@orbita`,
      summary: subject ? `${ev.title} (${subject.name})` : ev.title,
      description: ev.notes,
      day: ev.date,
      ...(Number.isFinite(start) ? { start, end } : {}),
      categories: 'Evento',
    })
  }
  items.sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? -1) - (b.start ?? -1))

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Órbita//Calendario de estudio//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Órbita',
    `X-WR-TIMEZONE:${ICS_TIMEZONE}`,
    ...VTIMEZONE,
    ...items.flatMap((item) => itemLines(item, dtstamp)),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
