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
import { registerStore } from '@/sync/bridge'
import { trackLocalChange } from '@/sync/metaStore'
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
  /** Hay una copia ilegible apartada: no se debe abrir el alta encima. */
  hasIllegibleBackup: boolean
  downloadIllegibleBackup: () => void
  /** Descarta la copia ilegible y deja seguir con el alta. */
  acknowledgeCorruptStorage: () => void
  /** Sustituye el curso y lo escribe YA, sin el debounce de 350 ms. */
  replaceAndSave: (data: AppData) => void
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
  const [hasIllegibleBackup, setHasIllegibleBackup] = useState(
    () => initial.status === 'recuperado' && storage.readBackup() !== null,
  )
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
  /**
   * Esta pestaña rehusó adoptar un cambio ajeno. Hasta recargar (o
   * `replaceAndSave`) no se vuelve a escribir: si se guardara el debounce
   * pendiente, pisaría las notas de la otra pestaña después de haber avisado
   * de lo contrario.
   */
  const writesFrozen = useRef(false)
  const latest = useRef(data)
  latest.current = data

  const persist = useCallback((snapshot: AppData): boolean => {
    const result = storage.save(snapshot)
    if (result.ok) {
      // Con cuenta vinculada, lo que ha cambiado desde el último guardado se
      // anota para subirlo. Va DESPUÉS de escribir el curso: si el guardado
      // falla, el siguiente intento vuelve a comparar desde el mismo punto.
      trackLocalChange(lastPersisted.current, snapshot)
      lastPersisted.current = snapshot
      pendingWrite.current = false
      setStorageNotice(null)
      return true
    }
    // El fallo no borra el pendiente: hay que reintentar al ocultar la
    // pestaña y en el siguiente cambio. Si se marcara como limpio, un
    // `storage` ajeno haría `data/replace` y se perdería el curso en memoria.
    pendingWrite.current = true
    setStorageNotice({ level: 'error', text: result.error })
    return false
  }, [])

  useEffect(() => {
    if (data === lastPersisted.current) return
    if (writesFrozen.current) return
    pendingWrite.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      persist(data)
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [data, persist])

  // Cerrar la pestaña justo después de escribir no debe perder el último
  // cambio: se fuerza el guardado pendiente antes de que la página se oculte.
  useEffect(() => {
    const flush = () => {
      if (writesFrozen.current) return
      if (!pendingWrite.current) return
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      persist(latest.current)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [persist])

  // --- Otras pestañas ---------------------------------------------------
  // Si aquí no hay nada sin guardar, se adopta lo que ha escrito la otra
  // pestaña. Si SÍ hay algo a medias, se congela esta pestaña: no se adopta
  // y TAMPOCO se escribe el debounce pendiente, que es lo que pisaba el
  // cambio ajeno después de haber avisado.
  useEffect(() => {
    const adopt = (next: AppData) => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      pendingWrite.current = false
      lastPersisted.current = next
      dispatch({ type: 'data/replace', data: next })
    }

    const onExternalWrite = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return

      if (pendingWrite.current || writesFrozen.current) {
        writesFrozen.current = true
        pendingWrite.current = true
        if (timer.current) {
          clearTimeout(timer.current)
          timer.current = null
        }
        setStorageNotice({
          level: 'aviso',
          text: 'Has cambiado algo en otra pestaña. Esta no va a guardar ni a cargar esos cambios, para no pisarlos. Recarga la página cuando termines aquí, o quédate con lo de la otra pestaña recargando ya.',
        })
        return
      }

      if (event.newValue === null) {
        const empty = storage.load()
        adopt(empty.data)
        return
      }

      const outcome = storage.load()
      if (outcome.status === 'recuperado') return
      adopt(outcome.data)
    }
    window.addEventListener('storage', onExternalWrite)
    return () => window.removeEventListener('storage', onExternalWrite)
  }, [])

  const replaceAndSave = useCallback(
    (next: AppData) => {
      writesFrozen.current = false
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      dispatch({ type: 'data/replace', data: next })
      persist(next)
    },
    [persist],
  )

  // --- Sincronización ---------------------------------------------------
  // El motor pide el estado y entrega lo que llega del servidor. Lo remoto se
  // escribe sin pasar por `trackLocalChange`: no es un cambio de este
  // dispositivo y no hay que volver a subirlo.
  useEffect(() => {
    registerStore({
      getData: () => latest.current,
      applyRemote: (merge) => {
        if (writesFrozen.current) return false
        // Primero se guarda (y se anota) lo tecleado aquí: así la fusión
        // trabaja sobre el estado completo y con todos los relojes al día.
        if (pendingWrite.current) {
          if (timer.current) {
            clearTimeout(timer.current)
            timer.current = null
          }
          if (!persist(latest.current)) return false
        }
        const next = merge(latest.current)
        if (!next || next === latest.current) return true
        const result = storage.save(next)
        if (!result.ok) setStorageNotice({ level: 'error', text: result.error })
        lastPersisted.current = next
        latest.current = next
        dispatch({ type: 'data/replace', data: next })
        return true
      },
    })
    return () => registerStore(null)
  }, [persist])

  const downloadIllegibleBackup = useCallback(() => {
    const raw = storage.readBackup()
    if (!raw) return
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bachillerato-os-ilegible.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  const acknowledgeCorruptStorage = useCallback(() => {
    storage.clearBackup()
    setHasIllegibleBackup(false)
    writesFrozen.current = false
    persist(latest.current)
  }, [persist])

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
    () => ({
      data,
      dispatch,
      today,
      storageNotice,
      dismissStorageNotice,
      hasIllegibleBackup,
      downloadIllegibleBackup,
      acknowledgeCorruptStorage,
      replaceAndSave,
    }),
    [
      data,
      today,
      storageNotice,
      dismissStorageNotice,
      hasIllegibleBackup,
      downloadIllegibleBackup,
      acknowledgeCorruptStorage,
      replaceAndSave,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function applyTheme(preference: ThemePreference) {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  const color = dark ? '#000000' : '#F2F2F7'
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', color)
    meta.removeAttribute('media')
  }
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return value
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
