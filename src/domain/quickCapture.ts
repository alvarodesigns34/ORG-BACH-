/**
 * Captura rápida en lenguaje natural (español), 100 % local y sin latencia.
 *
 * Pensada para apuntar lo que dice un profesor entre clases en dos segundos:
 *   «Ejercicios derivadas pág. 142 #MAT mañana 18:00 !alta 45m»
 *   «Comentario El Lazarillo viernes 30min #LEN #entrega»
 *
 * Lógica pura: no depende de React ni del DOM.
 */

import { addDays, parseDay, today as todayISO } from './dates.ts'
import { normalize } from './tasks.ts'
import type { DateISO, ID, Priority, Subject, TimeHM } from './types.ts'

export interface ParsedQuickTask {
  title: string
  subjectId?: ID
  dueDate?: DateISO
  dueTime?: TimeHM
  priority: Priority
  estimatedMinutes?: number
  tags: string[]
}

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
}

function nextWeekday(targetDow: number, today: DateISO): DateISO {
  const base = parseDay(today)
  const current = base.getDay()
  let delta = (targetDow - current + 7) % 7
  if (delta === 0) delta = 7
  return addDays(today, delta)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function validCalendarDate(year: number, month: number, day: number): DateISO | null {
  if (month < 1 || month > 12 || day < 1) return null
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > maxDay) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function matchSubject(token: string, subjects: Subject[]): Subject | undefined {
  const needle = normalize(token)
  if (!needle) return undefined
  const active = subjects.filter((s) => !s.archived)
  return (
    active.find((s) => normalize(s.shortName ?? '') === needle) ??
    active.find((s) => normalize(s.name) === needle) ??
    active.find((s) => normalize(s.name).startsWith(needle)) ??
    (needle.length >= 3 ? active.find((s) => normalize(s.name).includes(needle)) : undefined)
  )
}

/**
 * Extrae metadatos estructurados de una frase corta en español y devuelve el
 * título limpio junto con asignatura, fecha, hora, prioridad, duración y etiquetas.
 */
export function parseQuickTask(
  raw: string,
  subjects: Subject[],
  today: DateISO = todayISO(),
): ParsedQuickTask {
  let work = raw.trim()
  let subjectId: ID | undefined
  let dueDate: DateISO | undefined
  let dueTime: TimeHM | undefined
  let priority: Priority = 'media'
  let estimatedMinutes: number | undefined
  const tags: string[] = []

  // 1. Prioridad explícita: !urgente, !alta, !media, !baja o !!! / !!
  work = work.replace(/(?:^|\s)!(urgente|alta|media|baja)\b/gi, (_, p: string) => {
    priority = p.toLowerCase() as Priority
    return ' '
  })
  work = work.replace(/(?:^|\s)(!!!|!!)(?=\s|$)/g, (_, bangs: string) => {
    priority = bangs === '!!!' ? 'urgente' : 'alta'
    return ' '
  })

  // 2. Duración estimada: 1h30, 1h 30m, 45m, 45 min, 2h
  work = work.replace(
    /(?:^|\s)(\d{1,2})\s*h(?:oras?)?\s*(\d{1,2})\s*m(?:in(?:utos?)?)?(?=\s|$)/gi,
    (_, h: string, m: string) => {
      const total = Number(h) * 60 + Number(m)
      if (total > 0 && total <= 1440) estimatedMinutes = total
      return ' '
    },
  )
  if (estimatedMinutes === undefined) {
    work = work.replace(/(?:^|\s)(\d{1,3})\s*(?:min(?:utos?)?|m)(?=\s|$)/gi, (_, m: string) => {
      const n = Number(m)
      if (n > 0 && n <= 1440) estimatedMinutes = n
      return ' '
    })
  }
  if (estimatedMinutes === undefined) {
    work = work.replace(/(?:^|\s)(\d{1,2})\s*h(?:oras?)?(?=\s|$)/gi, (_, h: string) => {
      const n = Number(h) * 60
      if (n > 0 && n <= 1440) estimatedMinutes = n
      return ' '
    })
  }

  // 3. Asignatura o etiqueta: #MAT, @Física, #entrega
  work = work.replace(/(?:^|\s)([#@])([\p{L}\p{N}_-]{2,32})/gu, (full, sigil: string, token: string) => {
    const matched = !subjectId ? matchSubject(token, subjects) : undefined
    if (matched) {
      subjectId = matched.id
      return ' '
    }
    if (sigil === '#') {
      const tag = token.toLowerCase()
      if (!tags.includes(tag)) tags.push(tag)
      return ' '
    }
    return full
  })

  // 4. Hora: «a las 18:30», «a las 18», «18:30»
  work = work.replace(
    /(?:^|\s)(?:a\s+las\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/gi,
    (_, h: string, m: string) => {
      dueTime = `${pad2(Number(h))}:${m}`
      return ' '
    },
  )
  if (!dueTime) {
    work = work.replace(/(?:^|\s)a\s+las\s+([01]?\d|2[0-3])(?:\s*h)?(?=\s|$)/gi, (_, h: string) => {
      dueTime = `${pad2(Number(h))}:00`
      return ' '
    })
  }

  // 5. Fechas relativas y absolutas
  const consumeDate = (re: RegExp, resolver: (...args: string[]) => DateISO | null) => {
    if (dueDate) return
    work = work.replace(re, (...args) => {
      const resolved = resolver(...args)
      if (!resolved) return args[0]
      dueDate = resolved
      return ' '
    })
  }

  // «pasado mañana» antes que «mañana»
  consumeDate(/(?:^|\s)(?:para\s+)?pasado\s+ma[ñn]ana(?=\s|$)/i, () => addDays(today, 2))
  consumeDate(/(?:^|\s)(?:para\s+)?ma[ñn]ana(?=\s|$)/i, () => addDays(today, 1))
  consumeDate(/(?:^|\s)(?:para\s+)?hoy(?=\s|$)/i, () => today)
  consumeDate(/(?:^|\s)en\s+(\d{1,2})\s+d[ií]as?(?=\s|$)/i, (_full, d) => {
    const n = Number(d)
    return n > 0 && n <= 90 ? addDays(today, n) : null
  })
  // Fecha explícita DD/MM o DD/MM/YYYY
  consumeDate(/(?:^|\s)(?:para\s+el\s+|el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s|$)/i, (_full, d, m, y) => {
    const baseYear = Number(today.slice(0, 4))
    let year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : baseYear
    let candidate = validCalendarDate(year, Number(m), Number(d))
    if (!candidate) return null
    // Si no puso año y la fecha ya pasó este año, apuntar al año siguiente.
    if (!y && candidate < today) {
      candidate = validCalendarDate(baseYear + 1, Number(m), Number(d))
    }
    return candidate
  })
  // Día de la semana: «el viernes», «próximo lunes», «jueves»
  consumeDate(
    /(?:^|\s)(?:(?:para\s+)?(?:el\s+)?(?:pr[oó]ximo\s+)?)(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)(?=\s|$)/i,
    (_full, dayWord) => {
      const dow = WEEKDAY_MAP[normalize(dayWord)]
      return dow !== undefined ? nextWeekday(dow, today) : null
    },
  )

  // Si puso hora pero no fecha, asumimos hoy.
  if (dueTime && !dueDate) dueDate = today

  // Limpiar espacios múltiples y conectores sobrantes al final («para», «el»).
  const cleaned = work
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(?:para|el|a\s+las)$/i, '')
    .trim()

  return {
    title: cleaned || raw.trim(),
    subjectId,
    dueDate,
    dueTime,
    priority,
    estimatedMinutes,
    tags,
  }
}
