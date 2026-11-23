/**
 * Copias de seguridad: el recordatorio de exportar y la propia exportación.
 *
 * Sin cuenta, el curso vive solo en este dispositivo. Si el iPad se pierde,
 * se restablece o se borran los datos de la web, se pierde con él. La app no
 * puede evitarlo, pero sí recordarlo de vez en cuando sin ser pesada:
 *
 * - nunca el primer día (aún no hay nada que perder);
 * - cuando la última copia tiene más de dos semanas y hay cosas nuevas desde
 *   entonces, o cuando desde la última copia se han apuntado muchas cosas;
 * - «Más tarde» lo calla una semana; con sesión iniciada no aparece.
 *
 * La lógica de cuándo avisar es pura (`backupNudge`) y tiene pruebas.
 */

import { today as todayISO } from '../domain/dates.ts'
import type { AppData } from '../domain/types.ts'
import { exportJSON } from './persistence.ts'

const KEY = 'orbita:copias'
const DAY = 86_400_000

export interface BackupState {
  /** Última exportación (ms). */
  lastExportAt: number | null
  /** No avisar hasta (ms). */
  snoozedUntil: number | null
}

export function loadBackupState(): BackupState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BackupState>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return { lastExportAt: num(raw.lastExportAt), snoozedUntil: num(raw.snoozedUntil) }
  } catch {
    return { lastExportAt: null, snoozedUntil: null }
  }
}

function saveBackupState(patch: Partial<BackupState>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadBackupState(), ...patch }))
  } catch {
    // Sin almacenamiento: el aviso volverá a salir, que es lo prudente.
  }
  listeners.forEach((fn) => fn())
}

const listeners = new Set<() => void>()
export function subscribeBackup(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function snoozeBackup(days = 7, now = Date.now()): void {
  saveBackupState({ snoozedUntil: now + days * DAY })
}

// ---------------------------------------------------------------------------
// Cuándo avisar
// ---------------------------------------------------------------------------

/** Cosas apuntadas a mano: lo que dolería perder. */
function records(data: AppData) {
  return [
    ...data.subjects,
    ...data.tasks,
    ...data.grades,
    ...data.exams,
    ...data.events,
    ...data.goals,
    ...data.sessions.filter((s) => s.status !== 'en_vuelo'),
  ]
}

export type NudgeReason = 'nunca' | 'antigua' | 'muchos-cambios'

export interface Nudge {
  reason: NudgeReason
  /** Cosas apuntadas desde la última copia (o en total, si nunca). */
  since: number
  /** Días desde la última copia. */
  days: number | null
}

export const NUDGE_RULES = {
  /** Con menos que esto no hay nada que perder todavía. */
  minRecords: 8,
  /** El primer aviso, no antes de llevar estos días usando la app. */
  firstAfterDays: 3,
  /** Copia «antigua». */
  staleDays: 14,
  /** Tantas cosas nuevas desde la última copia ya justifican otra. */
  manyChanges: 25,
}

export function backupNudge(
  data: AppData,
  state: BackupState,
  { signedIn, now = Date.now() }: { signedIn: boolean; now?: number },
): Nudge | null {
  if (signedIn) return null
  if (state.snoozedUntil && now < state.snoozedUntil) return null
  const all = records(data)
  if (all.length < NUDGE_RULES.minRecords) return null

  if (state.lastExportAt === null) {
    const first = Math.min(...all.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite))
    if (!Number.isFinite(first) || now - first < NUDGE_RULES.firstAfterDays * DAY) return null
    return { reason: 'nunca', since: all.length, days: null }
  }

  const since = all.filter((r) => Date.parse(r.createdAt) > state.lastExportAt!).length
  const days = Math.floor((now - state.lastExportAt) / DAY)
  if (since >= NUDGE_RULES.manyChanges) return { reason: 'muchos-cambios', since, days }
  if (days >= NUDGE_RULES.staleDays && since > 0) return { reason: 'antigua', since, days }
  return null
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

/**
 * Descarga la copia como archivo JSON.
 *
 * En iPad y iPhone, sobre todo con la app instalada, un enlace de descarga
 * abre una vista previa sin forma clara de guardar. Allí se usa la hoja de
 * compartir del sistema, que ofrece «Guardar en Archivos», AirDrop o Mail.
 * Devuelve false si el alumno la cerró sin guardar.
 */
export async function exportBackup(data: AppData, filename?: string): Promise<boolean> {
  const name = filename ?? `orbita-${todayISO()}.json`
  const text = exportJSON(data)
  const file = new File([text], name, { type: 'application/json' })

  if (isIos() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia de Órbita' })
      markExported()
      return true
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return false
      // Si compartir falla por otra cosa, se intenta la descarga normal.
    }
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  markExported()
  return true
}

export function markExported(now = Date.now()): void {
  saveBackupState({ lastExportAt: now, snoozedUntil: null })
}
