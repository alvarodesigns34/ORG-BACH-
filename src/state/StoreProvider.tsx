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

import { STORAGE_KEY } from '@/data/defaults'
import { today as todayISO } from '@/domain/dates'
import type { AppData, DateISO, ThemePreference } from '@/domain/types'
import * as storage from '@/storage/persistence'
import { reducer, type Action } from './reducer'

/**
 * Aviso sobre el almacenamiento.
 *
 * El nivel importa: «no se puede guardar» y «se han descartado dos notas al
 * abrir» no son lo mismo. Pintar el segundo en rojo de error enseña al alumno
 * a ignorar el banner, que es justo lo que no queremos el día que salga el
 * primero.
 */
export interface StorageNotice {
  level: 'error' | 'aviso'
  text: string
}

interface StoreValue {
  data: AppData
  dispatch: (action: Action) => void
  /** Día actual. Se refresca solo: la app puede quedarse abierta toda la noche. */
  today: DateISO
  /** Aviso del almacenamiento; null si no hay nada que contar. */
  storageNotice: StorageNotice | null
  dismissStorageNotice: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** Espera antes de escribir en disco: agrupa ráfagas de tecleo en un guardado. */
const SAVE_DEBOUNCE_MS = 350

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => storage.load(), [])
  const [data, dispatch] = useReducer(reducer, initial.data)
  const [storageNotice, setStorageNotice] = useState<StorageNotice | null>(() => {
    if (initial.status === 'recuperado') return { level: 'error', text: initial.error }
    if (initial.status === 'cargado' && initial.warning) {
      return { level: 'aviso', text: initial.warning }
    }
    return null
  })
  const [today, setToday] = useState<DateISO>(() => todayISO())

  // --- Guardado ---------------------------------------------------------
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Último estado que se sabe escrito en disco.
   *
   * Se compara POR REFERENCIA, no con un booleano de «primer render». El
   * reductor solo devuelve un objeto nuevo cuando de verdad cambia algo, así
   * que esta igualdad responde exactamente a la pregunta «¿hay algo que
   * guardar?» —y, a diferencia del booleano, no se gasta: en desarrollo
   * StrictMode vuelve a montar los efectos, consumía el «primer render» y el
   * segundo montaje escribía datos que nadie había tocado.
   *
   * Que no escriba de más importa sobre todo cuando la carga ha fallado: si el
   * JSON guardado era ilegible, arrancamos en vacío, y volcar ese vacío
   * destruiría lo único que quedaba del curso —justo después de decirle al
   * alumno que quizá se pueda recuperar—.
   */
  const lastPersisted = useRef(data)
  /** Hay un cambio del alumno todavía sin escribir. */
  const pendingWrite = useRef(false)

  useEffect(() => {
    if (data === lastPersisted.current) return
    pendingWrite.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const result = storage.save(data)
      pendingWrite.current = false
      if (result.ok) lastPersisted.current = data
      // Un guardado correcto retira el aviso de arranque: si había registros
      // descartados, ya se ha escrito el estado bueno y contarlo otra vez
      // sobra.
      setStorageNotice(result.ok ? null : { level: 'error', text: result.error })
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [data])

  // Cerrar la pestaña justo después de escribir no debe perder el último
  // cambio: se fuerza el guardado pendiente antes de que la página se oculte.
  // Solo el pendiente: sin cambios que salvar no se escribe nada.
  const latest = useRef(data)
  latest.current = data
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden' || !pendingWrite.current) return
      if (storage.save(latest.current).ok) lastPersisted.current = latest.current
      pendingWrite.current = false
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  // --- Otras pestañas ---------------------------------------------------
  // La aplicación vive en el navegador todo el día y es normal acabar con dos
  // pestañas abiertas. Sin esto, la última en guardar pisaba a la otra sin que
  // nadie se enterara.
  //
  // Si aquí no hay nada sin guardar, se adopta lo que ha escrito la otra
  // pestaña: es más reciente y no se pierde nada. Si SÍ hay algo a medias, no
  // se toca —perder lo que se está escribiendo sería peor— y se avisa, que es
  // lo único honesto cuando dos versiones han divergido de verdad.
  useEffect(() => {
    const onExternalWrite = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return
      if (pendingWrite.current) {
        setStorageNotice({
          level: 'aviso',
          text: 'Has cambiado algo en otra pestaña. Para no perder lo que estás escribiendo aquí, esos cambios no se han cargado: recarga la página cuando termines.',
        })
        return
      }
      const outcome = storage.load()
      if (outcome.status === 'recuperado') return
      lastPersisted.current = outcome.data
      dispatch({ type: 'data/replace', data: outcome.data })
    }
    window.addEventListener('storage', onExternalWrite)
    return () => window.removeEventListener('storage', onExternalWrite)
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

  const dismissStorageNotice = useCallback(() => setStorageNotice(null), [])

  const value = useMemo<StoreValue>(
    () => ({ data, dispatch, today, storageNotice, dismissStorageNotice }),
    [data, today, storageNotice, dismissStorageNotice],
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
