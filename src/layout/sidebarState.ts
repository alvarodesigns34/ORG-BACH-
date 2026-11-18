import { useSyncExternalStore } from 'react'

/**
 * Preferencias de la barra lateral (iPad en horizontal y ordenador): si está
 * oculta y qué grupos están plegados. Son de este dispositivo, no datos de
 * la cuenta: no se sincronizan.
 */
interface SidebarPrefs {
  hidden: boolean
  folded: string[]
}

const KEY = 'orbita:sidebar'
const listeners = new Set<() => void>()

function read(): SidebarPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SidebarPrefs> | null
    return {
      hidden: raw?.hidden === true,
      folded: Array.isArray(raw?.folded) ? raw.folded.filter((g) => typeof g === 'string') : [],
    }
  } catch {
    return { hidden: false, folded: [] }
  }
}

let state = read()

function set(next: SidebarPrefs) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Sin almacenamiento (modo privado): vale para esta sesión.
  }
  document.documentElement.dataset.sidebar = next.hidden ? 'hidden' : 'shown'
  listeners.forEach((listener) => listener())
}

document.documentElement.dataset.sidebar = state.hidden ? 'hidden' : 'shown'

export function useSidebarPrefs(): SidebarPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

export function toggleSidebar(hidden = !state.hidden) {
  if (hidden !== state.hidden) set({ ...state, hidden })
}

export function toggleGroup(group: string) {
  const folded = state.folded.includes(group)
    ? state.folded.filter((g) => g !== group)
    : [...state.folded, group]
  set({ ...state, folded })
}
