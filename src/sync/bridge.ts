/**
 * Puente entre el almacén de React y el motor de sincronización.
 *
 * El motor no conoce React: pide el estado actual y entrega cambios remotos
 * a través de estas dos funciones, que registra `StoreProvider`.
 */

import type { AppData } from '../domain/types.ts'
import type { SyncMeta } from './merge.ts'

export interface RemoteWrite {
  data: AppData | null
  meta: SyncMeta | null
}

export interface StoreBridge {
  getData(): AppData
  /**
   * Aplica un cambio que viene de fuera (servidor). `merge` recibe el estado
   * más reciente —con los cambios locales pendientes ya guardados— y devuelve
   * el curso y los metadatos para guardarlos juntos, o null si no hay cambios.
   */
  applyRemote(merge: (current: AppData) => RemoteWrite | null): boolean
}

let current: StoreBridge | null = null
const waiters: ((bridge: StoreBridge) => void)[] = []

export function registerStore(bridge: StoreBridge | null): void {
  current = bridge
  if (bridge) for (const resolve of waiters.splice(0)) resolve(bridge)
}

export function storeBridge(): Promise<StoreBridge> {
  if (current) return Promise.resolve(current)
  return new Promise((resolve) => waiters.push(resolve))
}
