/**
 * Relojes y cola de pendientes de la sincronización, en `localStorage`.
 *
 * El curso guarda sus relojes al cambiar. Las confirmaciones del servidor
 * se guardan aparte, vinculadas a la revisión exacta que se confirmó.
 */

import type { AppData } from '../domain/types.ts'
import { STORAGE_KEY } from '../data/defaults.ts'
import { courseRevision, decodeSyncMeta } from '../storage/syncEnvelope.ts'
import { newNodeId } from './hlc.ts'
import { stampLocalChanges, type SyncMeta } from './merge.ts'

const META_KEY = 'bachillerato-os:sync'
const NODE_KEY = 'bachillerato-os:node'

/** Evento en la propia pestaña: hay cambios locales esperando a subir. */
export const LOCAL_CHANGE_EVENT = 'bachillerato-os:local-change'

export function loadMeta(): SyncMeta | null {
  try {
    return decodeSyncMeta(localStorage.getItem(STORAGE_KEY), localStorage.getItem(META_KEY))
  } catch {
    return null
  }
}

export function saveMeta(meta: SyncMeta | null): boolean {
  try {
    const revision = courseRevision(localStorage.getItem(STORAGE_KEY))
    if (revision) localStorage.setItem(META_KEY, JSON.stringify({ revision, meta }))
    else if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta))
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
export function metaForLocalChange(prev: AppData, next: AppData): SyncMeta | null {
  const meta = loadMeta()
  return meta ? stampLocalChanges(meta, prev, next) : null
}

export function notifyLocalChange(meta: SyncMeta | null): void {
  if (meta?.dirty.length && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT))
  }
}
