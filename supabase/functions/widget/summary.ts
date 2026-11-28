/**
 * Resumen de las tareas de hoy para el widget de la pantalla de inicio.
 *
 * Puro (sin Deno ni red) para poder probarlo con el resto. Sigue las mismas
 * reglas que la app: «hoy» reúne lo que vence hoy y lo atrasado, ordenado por
 * fecha, hora y prioridad, y un borrado solo cuenta si nada se editó después.
 */

export interface SyncRow {
  collection: string
  id: string
  data: Record<string, unknown>
  clocks: Record<string, string>
}

export interface WidgetTask {
  title: string
  /** Abreviatura de la asignatura (o null). */
  subject: string | null
  /** Clave de color de la asignatura (sky, indigo…) o null. */
  color: string | null
  time: string | null
  late: boolean
}

export interface WidgetSummary {
  /** Pendientes para hoy (incluidas las atrasadas). */
  pending: number
  /** Completadas hoy. */
  done: number
  tasks: WidgetTask[]
}

const RANK: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

function isDeleted(row: SyncRow): boolean {
  if (row.data._deleted !== true) return false
  const del = row.clocks._deleted ?? ''
  return Object.entries(row.clocks).every(([k, v]) => k === '_deleted' || v <= del)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Abreviatura como la de la app: la propia o las 3 primeras letras. */
function shortOf(subject: Record<string, unknown>): string | null {
  const short = str(subject.shortName)
  if (short) return short.slice(0, 6)
  const name = str(subject.name)
  return name ? name.slice(0, 3).toUpperCase() : null
}

/**
 * @param today   día local del dispositivo (AAAA-MM-DD)
 * @param now     hora local (HH:MM): con ella, lo de hoy con hora pasada es atrasado
 * @param offset  Date#getTimezoneOffset() del dispositivo, en minutos
 */
export function buildSummary(
  rows: SyncRow[],
  today: string,
  now: string,
  offset: number,
  limit = 4,
): WidgetSummary {
  if (!DAY.test(today)) throw new Error('Día inválido')
  const subjects = new Map<string, Record<string, unknown>>()
  const live = rows.filter((r) => !isDeleted(r))
  for (const r of live) if (r.collection === 'subjects') subjects.set(r.id, r.data)

  const localDay = (iso: string) => {
    const ms = Date.parse(iso)
    return Number.isFinite(ms) ? new Date(ms - offset * 60_000).toISOString().slice(0, 10) : ''
  }

  let done = 0
  const pending: { t: Record<string, unknown>; late: boolean }[] = []
  for (const r of live) {
    if (r.collection !== 'tasks') continue
    const t = r.data
    if (t.status === 'completada') {
      const at = str(t.completedAt)
      if (at && localDay(at) === today) done++
      continue
    }
    const due = str(t.dueDate)
    if (!due || !DAY.test(due) || due > today) continue
    const time = str(t.dueTime)
    const late = due < today || (!!time && TIME.test(time) && TIME.test(now) && time < now)
    pending.push({ t, late })
  }

  pending.sort((a, b) => {
    const da = String(a.t.dueDate)
    const db = String(b.t.dueDate)
    if (da !== db) return da < db ? -1 : 1
    const ta = str(a.t.dueTime) ?? '99:99'
    const tb = str(b.t.dueTime) ?? '99:99'
    if (ta !== tb) return ta < tb ? -1 : 1
    return (RANK[String(a.t.priority)] ?? 2) - (RANK[String(b.t.priority)] ?? 2)
  })

  return {
    pending: pending.length,
    done,
    tasks: pending.slice(0, limit).map(({ t, late }) => {
      const subject = typeof t.subjectId === 'string' ? subjects.get(t.subjectId) : undefined
      return {
        title: (str(t.title) ?? 'Sin título').slice(0, 80),
        subject: subject ? shortOf(subject) : null,
        color: subject ? str(subject.color) : null,
        time: str(t.dueTime),
        late,
      }
    }),
  }
}
