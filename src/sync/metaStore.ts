/**
 * Relojes y cola de pendientes de la sincronización, en `localStorage`.
 *
 * Viven aparte del curso (`bachillerato-os:v1`) para no tocar su formato: la
 * copia exportable sigue siendo exactamente la de siempre.
 *
 * Toda lectura/escritura es síncrona y se hace en el mismo turno que el
 * guardado del curso, así que no hay ventana en la que uno quede escrito y
 * el otro no.
 */

import type { AppData } from '../domain/types.ts'
import { newNodeId } from './hlc.ts'
import { stampLocalChanges, type SyncMeta } from './merge.ts'

const META_KEY = 'bachillerato-os:sync'
const NODE_KEY = 'bachillerato-os:node'

/** Evento en la propia pestaña: hay cambios locales esperando a subir. */
export const LOCAL_CHANGE_EVENT = 'bachillerato-os:local-change'

export function loadMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return null
    const meta = JSON.parse(raw) as SyncMeta
    if (meta?.v !== 1 || typeof meta.userId !== 'string' || !meta.records) return null
    return meta
  } catch {
    return null
  }
}

export function saveMeta(meta: SyncMeta | null): boolean {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta))
    else localStorage.removeItem(META_KEY)
    return true
  } catch {
    return false
  }
}

/** Identificador estable de este dispositivo para los relojes. */
export function nodeId(): string {
  try {
    const existing = localStorage.getItem(NODE_KEY)
    if (existing && /^[0-9a-z]{1,16}$/.test(existing)) return existing
    const fresh = newNodeId()
    localStorage.setItem(NODE_KEY, fresh)
    return fresh
  } catch {
    return newNodeId()
  }
}

/**
 * Registra un cambio local ya guardado. Sin cuenta vinculada no hace nada:
 * quien no usa la sincronización no paga ningún coste.
 */
export function trackLocalChange(prev: AppData, next: AppData): void {
  const meta = loadMeta()
  if (!meta) return
  const stamped = stampLocalChanges(meta, prev, next)
  if (stamped === meta) return
  saveMeta(stamped)
  if (stamped.dirty.length > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT))
  }
}
