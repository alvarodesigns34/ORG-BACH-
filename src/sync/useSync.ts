import { useSyncExternalStore } from 'react'

import { syncEngine, type SyncStatus } from './engine'

/** Estado de la sincronización, reactivo. */
export function useSync(): SyncStatus {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getStatus, syncEngine.getStatus)
}
