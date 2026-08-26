/**
 * Persistencia local.
 *
 * Toda la aplicación habla con este módulo, nunca con `localStorage`
 * directamente. Cuando llegue una base de datos con cuenta de usuario, basta
 * con reimplementar `load` y `save` aquí: el resto del código no se entera.
 *
 * `localStorage` es suficiente para un curso entero (los datos de un año
 * ocupan unas decenas de kilobytes, muy por debajo del límite de ~5 MB) y es
 * síncrono, lo que evita estados de carga en el arranque. IndexedDB solo
 * haría falta si se guardaran adjuntos.
 */

import { createEmptyData, SCHEMA_VERSION, STORAGE_KEY } from '@/data/defaults'
import { DEFAULT_SETTINGS } from '@/data/defaults'
import type { TimerState } from '@/domain/study'
import type { AppData } from '@/domain/types'

export type LoadOutcome =
  | { status: 'nuevo'; data: AppData }
  | { status: 'cargado'; data: AppData }
  | { status: 'recuperado'; data: AppData; error: string }

const COLLECTIONS = [
  'subjects',
  'tasks',
  'grades',
  'exams',
  'events',
  'sessions',
  'goals',
  'activity',
] as const

/**
 * Rellena lo que falte en unos datos guardados.
 *
 * Es el punto donde una versión antigua se pone al día: los campos nuevos
 * aparecen con su valor por defecto en lugar de llegar como `undefined` y
 * romper la interfaz a mitad de render.
 */
function migrate(raw: unknown): AppData {
  const base = createEmptyData()
  if (!raw || typeof raw !== 'object') return base

  const input = raw as Partial<AppData>
  const data: AppData = {
    ...base,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(input.settings ?? {}),
      gradeScale: { ...DEFAULT_SETTINGS.gradeScale, ...(input.settings?.gradeScale ?? {}) },
    },
    version: SCHEMA_VERSION,
  }

  for (const key of COLLECTIONS) {
    const value = input[key]
    // Un array corrupto se descarta entero antes que dejar pasar registros
    // a medias que reventarían más adelante.
    if (Array.isArray(value)) {
      ;(data[key] as unknown[]) = value.filter(
        (item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string',
      )
    }
  }

  return data
}

export function load(): LoadOutcome {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    // Modo privado o almacenamiento bloqueado: la app sigue funcionando en
    // memoria durante la sesión, pero hay que decirlo.
    return {
      status: 'recuperado',
      data: createEmptyData(),
      error: `No se puede acceder al almacenamiento del navegador (${describe(error)}). Los datos no se guardarán.`,
    }
  }

  if (!raw) return { status: 'nuevo', data: createEmptyData() }

  try {
    return { status: 'cargado', data: migrate(JSON.parse(raw)) }
  } catch (error) {
    return {
      status: 'recuperado',
      data: createEmptyData(),
      error: `Los datos guardados no se pudieron leer (${describe(error)}).`,
    }
  }
}

export function save(data: AppData): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return { ok: true }
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      error: quota
        ? 'No queda espacio en el almacenamiento del navegador. Exporta tus datos y borra lo que ya no necesites.'
        : `No se pudieron guardar los cambios (${describe(error)}).`,
    }
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Si no se puede borrar, el siguiente guardado sobrescribirá igualmente.
  }
}

// ---------------------------------------------------------------------------
// Temporizador en marcha
// ---------------------------------------------------------------------------

/**
 * El temporizador vive aparte de los datos académicos.
 *
 * Es estado efímero de una sesión concreta, no algo que tenga sentido exportar
 * ni migrar. Guardarlo, en cambio, sí importa: recargar la página sin querer a
 * los cuarenta minutos no debería perder la sesión.
 */
const TIMER_KEY = 'bachillerato-os:timer'

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TimerState
    // Comprobación mínima: sin `mode` no es un temporizador utilizable.
    return parsed && typeof parsed === 'object' && 'mode' in parsed ? parsed : null
  } catch {
    return null
  }
}

export function saveTimer(state: TimerState | null): void {
  try {
    if (state) localStorage.setItem(TIMER_KEY, JSON.stringify(state))
    else localStorage.removeItem(TIMER_KEY)
  } catch {
    // Sin almacenamiento el temporizador sigue funcionando en memoria.
  }
}

// ---------------------------------------------------------------------------
// Exportación e importación
// ---------------------------------------------------------------------------

/** Copia completa en JSON, legible y con fecha, para no quedar encerrado. */
export function exportJSON(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
}

export type ImportResult = { ok: true; data: AppData } | { ok: false; error: string }

export function importJSON(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El archivo no contiene JSON válido.' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'El archivo no tiene el formato esperado.' }
  }

  // Un JSON cualquiera pasaría la comprobación anterior: exigimos al menos una
  // colección conocida para no vaciar los datos del alumno por un archivo suelto.
  const hasKnownShape = COLLECTIONS.some((key) => Array.isArray((parsed as Record<string, unknown>)[key]))
  if (!hasKnownShape) {
    return { ok: false, error: 'El archivo no parece una copia de Bachillerato OS.' }
  }

  return { ok: true, data: migrate(parsed) }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
