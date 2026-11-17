import { newId } from '../domain/id.ts'
import type { AppData } from '../domain/types.ts'
import type { SyncMeta } from '../sync/merge.ts'

/** El curso y los relojes que describen ese curso se confirman en un solo setItem. */
export function encodeCourse(data: AppData, meta?: SyncMeta | null): string {
  return JSON.stringify(meta === undefined ? data : { _syncRevision: newId('sync'), _syncMeta: meta, ...data })
}

// La revisión es el primer campo. Leerla para comparar el cursor evita
// decodificar el curso entero cuando los metadatos posteriores coinciden.
export function courseRevision(raw: string | null): string | null {
  return raw?.slice(0, 160).match(/^\{"_syncRevision":"([^"]+)"/)?.[1] ?? null
}

function isMeta(value: unknown): value is SyncMeta {
  if (!value || typeof value !== 'object') return false
  const meta = value as Partial<SyncMeta>
  return meta.v === 1 && typeof meta.userId === 'string' && Array.isArray(meta.dirty) &&
    typeof meta.cursor === 'number' && !!meta.records && !!meta.hlc
}

/** Un cursor separado solo es válido para la misma revisión local del curso. */
export function decodeSyncMeta(course: string | null, sidecar: string | null): SyncMeta | null {
  const revision = courseRevision(course)
  if (sidecar) {
    try {
      const stored = JSON.parse(sidecar)
      if (!revision && isMeta(stored)) return stored
      if (stored && typeof stored === 'object' && revision && stored.revision === revision) {
        if (stored.meta === null || isMeta(stored.meta)) return stored.meta
      }
    } catch {
      // Una escritura separada inválida se recupera desde el curso.
    }
  }
  if (!revision || !course) return null
  try {
    const embedded = JSON.parse(course)._syncMeta
    return isMeta(embedded) ? embedded : null
  } catch {
    return null
  }
}
