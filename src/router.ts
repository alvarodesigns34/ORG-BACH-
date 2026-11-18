/**
 * Enrutado por hash.
 *
 * Una aplicación local de una sola persona no necesita react-router: el hash
 * funciona sin servidor, sobrevive a recargar la página y permite enlazar a
 * una vista concreta ('#/tareas?vista=atrasadas') desde una alerta.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

export type RouteId =
  | 'inicio'
  | 'tareas'
  | 'calendario'
  | 'estudio'
  | 'asignaturas'
  | 'notas'
  | 'examenes'
  | 'estadisticas'
  | 'objetivos'
  | 'ajustes'

export const ROUTE_IDS: RouteId[] = [
  'inicio',
  'tareas',
  'calendario',
  'estudio',
  'asignaturas',
  'notas',
  'examenes',
  'estadisticas',
  'objetivos',
  'ajustes',
]

export interface Route {
  id: RouteId
  params: URLSearchParams
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [path, query = ''] = clean.split('?')
  const id = ROUTE_IDS.includes(path as RouteId) ? (path as RouteId) : 'inicio'
  return { id, params: new URLSearchParams(query) }
}

export function hrefFor(id: RouteId, params?: Record<string, string>): string {
  const query = params ? new URLSearchParams(params).toString() : ''
  return `#/${id}${query ? `?${query}` : ''}`
}

export function studyHref({ minutes = 25, subjectId, taskId, examId }: {
  minutes?: number
  subjectId?: string
  taskId?: string
  examId?: string
} = {}): string {
  return hrefFor('estudio', {
    despegar: String(minutes),
    ...(subjectId ? { asignatura: subjectId } : {}),
    ...(taskId ? { tarea: taskId } : {}),
    ...(examId ? { examen: examId } : {}),
  })
}

// ---------------------------------------------------------------------------
// Cambio de pantalla
//
// La ruta vive en un solo sitio (no un estado por componente) para que el
// cambio de pantalla sea UNA confirmación de React. Así se puede:
//  1. Dejar la pantalla actual puesta mientras llega el código de la nueva
//     (como mucho `WAIT_FOR_VIEW_MS`), en vez de cambiarla por «Cargando…».
//  2. Envolver el cambio en una View Transition: el navegador fotografía la
//     pantalla vieja y la funde con la nueva en el compositor (solo opacidad
//     y transform, sin relayout). Ver `::view-transition-*` en index.css.
// ---------------------------------------------------------------------------

/** Lo que espera la pantalla vieja al código de la nueva antes de rendirse. */
const WAIT_FOR_VIEW_MS = 350

let currentHash = typeof window === 'undefined' ? '' : window.location.hash
const listeners = new Set<() => void>()
let preloadFor: (route: Route) => Promise<unknown> | undefined = () => undefined
let pending = 0
let running: { skipTransition(): void } | null = null
/** El sistema ya ha animado esta vuelta atrás (gesto de deslizar en Safari). */
let systemAnimated = false

/** Lo registra la app: devuelve la descarga del código de una ruta. */
export function setRoutePreloader(fn: (route: Route) => Promise<unknown> | undefined): void {
  preloadFor = fn
}

function commit(hash: string): void {
  currentHash = hash
  for (const listener of listeners) listener()
}

function screenOf(route: Route): string {
  return `${route.id}:${route.params.get('id') ?? ''}`
}

type StartViewTransition = (update: () => void) => {
  finished: Promise<void>
  skipTransition(): void
}

function canAnimate(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.visibilityState === 'visible'
  )
}

async function onHashChange(): Promise<void> {
  const next = window.location.hash
  const from = parse(currentHash)
  const to = parse(next)
  const token = ++pending
  const uaAnimated = systemAnimated
  systemAnimated = false

  // Mismo sitio, otros parámetros (un filtro, `?despegar=`): sin transición.
  if (screenOf(from) === screenOf(to)) return commit(next)

  const load = preloadFor(to)
  if (load) {
    await Promise.race([load.catch(() => undefined), new Promise((r) => setTimeout(r, WAIT_FOR_VIEW_MS))])
    if (token !== pending) return
  }

  if (uaAnimated || !canAnimate()) return commit(next)

  running?.skipTransition()
  const root = document.documentElement
  // Fuera de Estudio, barra lateral y barra de pestañas se quedan quietas en
  // su sitio (solo cambia la pestaña marcada); el contenido es lo que se funde.
  // Estudio ocupa toda la pantalla: ahí se funde todo.
  root.dataset.nav = from.id === 'estudio' || to.id === 'estudio' ? 'immersive' : 'section'
  const transition = (document as Document & { startViewTransition: StartViewTransition })
    .startViewTransition(() => flushSync(() => commit(next)))
  running = transition
  void transition.finished.finally(() => {
    if (running !== transition) return
    running = null
    delete root.dataset.nav
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    systemAnimated = Boolean((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition)
  })
  window.addEventListener('hashchange', () => void onHashChange())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getHash = () => currentHash

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, getHash)
  const route = useMemo(() => parse(hash), [hash])

  const navigate = useCallback((id: RouteId, params?: Record<string, string>, replace = false) => {
    const hash = hrefFor(id, params)
    if (hash === window.location.hash) return
    if (replace) {
      window.history.replaceState(window.history.state, '', hash)
      window.dispatchEvent(new Event('hashchange'))
    } else window.location.hash = hash
  }, [])

  return { route, navigate }
}
