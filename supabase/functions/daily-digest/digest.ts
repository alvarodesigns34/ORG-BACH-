/**
 * Texto del resumen diario. Puro: sin red ni base de datos, para poder
 * probarlo (tests/digest.test.ts) con el mismo runner que el resto.
 */

/** Día y hora locales en una zona horaria IANA, con el horario de verano incluido. */
export function localParts(
  date: Date,
  timeZone: string,
): { day: string; hour: number; minute: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdays.indexOf(parts.weekday),
  }
}

function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((d) => {
    const [y, m, dd] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, dd)
  })
  return Math.round((b - a) / 86_400_000)
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function whenText(today: string, day: string): string {
  const diff = daysBetween(today, day)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === 2) return 'pasado mañana'
  const [y, m, d] = day.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return diff < 7 ? `el ${weekday}` : `el ${weekday} ${d}`
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

export interface SyncRow {
  collection: string
  id: string
  data: Record<string, unknown>
  clocks: Record<string, string>
}

/** Misma regla que el cliente: un borrado solo cuenta si nada se editó después. */
function isDeleted(row: SyncRow): boolean {
  if (row.data._deleted !== true) return false
  const del = row.clocks._deleted ?? ''
  return Object.entries(row.clocks).every(([k, v]) => k === '_deleted' || v <= del)
}

export interface Digest {
  title: string
  body: string
  empty: boolean
  /** Vacío porque el alumno apagó «Mostrar avisos», no por falta de cosas. */
  muted?: boolean
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

const hm = (v: unknown): number => {
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v) : null
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN
}

/**
 * Minuto en que se da por hecho un examen de hoy. Es la misma regla que
 * `src/domain/exams.ts` (que la app usa para no sugerirlo), en corto porque la
 * función no puede importar código de fuera de su carpeta: con hora, el fin
 * de su clase o una hora después; sin hora, el fin de la última clase de la
 * asignatura ese día; sin nada, las 20:00.
 */
function examEnd(exam: Record<string, unknown>, subject: Record<string, unknown> | undefined, weekday: number): number {
  const slots = (Array.isArray(subject?.schedule) ? subject.schedule : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && x.day === weekday)
    .map((x) => ({ start: hm(x.start), end: hm(x.end) }))
    .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
    .sort((a, b) => a.start - b.start)
  const blocks: { start: number; end: number }[] = []
  for (const slot of slots) {
    const last = blocks[blocks.length - 1]
    if (last && slot.start <= last.end) last.end = Math.max(last.end, slot.end)
    else blocks.push({ ...slot })
  }
  const start = hm(exam.time)
  if (Number.isFinite(start)) {
    return blocks.find((b) => start >= b.start && start < b.end)?.end ?? start + 60
  }
  return blocks.length ? blocks[blocks.length - 1].end : 20 * 60
}

/**
 * `nowMinutes` (minutos desde medianoche, hora local) permite quitar un
 * examen de hoy que ya ha terminado: a las 17:00 no tiene sentido anunciar
 * el examen de las 9:00.
 */
export function buildDigest(rows: SyncRow[], today: string, nowMinutes?: number): Digest {
  const live = rows.filter((r) => !isDeleted(r))
  const subjectRows = new Map(live.filter((r) => r.collection === 'subjects').map((r) => [r.id, r.data]))
  const subjects = new Map([...subjectRows].map(([id, data]) => [id, String(data.name ?? '')]))
  const settings = live.find((r) => r.collection === 'settings')?.data ?? {}
  const examDays = Math.min(30, Math.max(1, Number(settings.examAlertDays) || 7))

  // «Mostrar avisos» apagado silencia también el resumen: es lo que se espera
  // de un interruptor así. (Ajuste ya sincronizado; no cambia el esquema.)
  if (settings.alertsEnabled === false) {
    return { title: 'Resumen silenciado', body: 'Tienes «Mostrar avisos» apagado en Ajustes.', empty: true, muted: true }
  }
  const [ty, tm, td] = today.split('-').map(Number)
  const weekday = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay()

  const pending = live
    .filter((r) => r.collection === 'tasks')
    .map((r) => r.data)
    .filter((t) => t.status !== 'completada' && typeof t.dueDate === 'string' && t.dueDate <= today)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
  const overdue = pending.filter((t) => (t.dueDate as string) < today).length

  const exams = live
    .filter((r) => r.collection === 'exams')
    .map((r) => r.data)
    .filter((e) => {
      if (typeof e.date !== 'string') return false
      // Ya con nota, o de una asignatura archivada: no se anuncia.
      if (typeof e.gradeEntryId === 'string' && e.gradeEntryId) return false
      const subject = subjectRows.get(String(e.subjectId))
      if (subject?.archived === true) return false
      const diff = daysBetween(today, e.date)
      if (diff === 0 && nowMinutes !== undefined && nowMinutes >= examEnd(e, subject, weekday)) return false
      return diff >= 0 && diff <= examDays
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  if (pending.length === 0 && exams.length === 0) {
    return {
      title: 'Nada pendiente para hoy',
      body: 'Ni tareas ni exámenes cerca. Buen momento para adelantar trabajo.',
      empty: true,
    }
  }

  const title =
    pending.length > 0
      ? `${plural(pending.length, 'tarea pendiente', 'tareas pendientes')}${overdue > 0 ? ` · ${overdue} ${overdue === 1 ? 'atrasada' : 'atrasadas'}` : ''}`
      : exams.length === 1
        ? 'Tienes un examen pronto'
        : `${exams.length} exámenes en los próximos días`

  const lines: string[] = []
  for (const task of pending.slice(0, 3)) {
    const subject = task.subjectId ? subjects.get(String(task.subjectId)) : undefined
    lines.push(`• ${String(task.title)}${subject ? ` (${subject})` : ''}`)
  }
  if (pending.length > 3) lines.push(`y ${plural(pending.length - 3, 'tarea más', 'tareas más')}`)

  for (const exam of exams.slice(0, 2)) {
    const subject = subjects.get(String(exam.subjectId)) ?? String(exam.title ?? 'Examen')
    lines.push(`Examen de ${subject} ${whenText(today, String(exam.date))}`)
  }
  if (exams.length > 2) lines.push(`y ${plural(exams.length - 2, 'examen más', 'exámenes más')}`)

  return { title, body: lines.join('\n'), empty: false }
}
