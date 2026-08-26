import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { today as todayISO } from '@/domain/dates'
import type { AppData, DateISO, ThemePreference } from '@/domain/types'
import * as storage from '@/storage/persistence'
import { reducer, type Action } from './reducer'

interface StoreValue {
  data: AppData
  dispatch: (action: Action) => void
  /** Día actual. Se refresca solo: la app puede quedarse abierta toda la noche. */
  today: DateISO
  /** Mensaje si el almacenamiento falla; null si todo va bien. */
  storageError: string | null
  dismissStorageError: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** Espera antes de escribir en disco: agrupa ráfagas de tecleo en un guardado. */
const SAVE_DEBOUNCE_MS = 350

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => storage.load(), [])
  const [data, dispatch] = useReducer(reducer, initial.data)
  const [storageError, setStorageError] = useState<string | null>(
    initial.status === 'recuperado' ? initial.error : null,
  )
  const [today, setToday] = useState<DateISO>(() => todayISO())

  // --- Guardado ---------------------------------------------------------
  // El primer render no debe escribir: acabamos de leer justo estos datos.
  const isFirstRender = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const result = storage.save(data)
      setStorageError(result.ok ? null : result.error)
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [data])

  // Cerrar la pestaña justo después de escribir no debe perder el último
  // cambio: se fuerza el guardado pendiente antes de que la página se oculte.
  const latest = useRef(data)
  latest.current = data
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') storage.save(latest.current)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  // --- Tema -------------------------------------------------------------
  const theme = data.settings.theme
  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  // --- Día actual -------------------------------------------------------
  // Se comprueba al volver a la pestaña y cada minuto: en cuanto cambia el
  // día, "hoy" deja de mentir sin necesidad de recargar.
  useEffect(() => {
    const check = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()))
    const id = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const dismissStorageError = useCallback(() => setStorageError(null), [])

  const value = useMemo<StoreValue>(
    () => ({ data, dispatch, today, storageError, dismissStorageError }),
    [data, today, storageError, dismissStorageError],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function applyTheme(preference: ThemePreference) {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return value
}

export function useData(): AppData {
  return useStore().data
}

export function useDispatch(): (action: Action) => void {
  return useStore().dispatch
}

export function useSettings() {
  return useStore().data.settings
}

export function useToday(): DateISO {
  return useStore().today
}
