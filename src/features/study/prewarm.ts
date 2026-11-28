/**
 * Adelanta la descarga del globo para que Estudio no espere a la red.
 *
 * El motor del mapa (MapLibre, ~450 KB comprimidos) y su «worker» viven en un
 * bloque aparte para no retrasar el arranque. Sin esto, la cadena empezaba al
 * abrir Estudio: vista → motor → estilo → descriptor de teselas → teselas, y
 * el globo tardaba segundos en aparecer.
 *
 * Aquí se descarga con la app ya pintada y en reposo, o en cuanto se va a
 * Estudio. El Service Worker guarda motor y teselas, así que la segunda vez
 * todo sale del dispositivo.
 */

import { getStudyPrefs } from './prefs'

let started: Promise<void> | null = null

/** Si compensa gastar datos ahora en el mapa. */
function worthIt(): boolean {
  if (typeof window === 'undefined' || !navigator.onLine) return false
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  // Ahorro de datos o red muy lenta: el mapa se baja solo si de verdad se abre.
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return false
  // En el móvil Estudio casi no se usa (es del iPad): medido el 28-11, el
  // precalentado bajaba ~440 KB (motor y worker) en cada versión nueva sin
  // entrar nunca. Si se abre Estudio, se descarga igual al entrar.
  if (window.matchMedia('(max-width: 639px)').matches) return false
  // Con «modo tranquilo» el vuelo no muestra mapa.
  return !getStudyPrefs().quiet
}

function preconnect(origin: string): void {
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = origin
  // MapLibre pide las teselas con fetch en modo CORS: la conexión precalentada
  // solo se reutiliza si también es anónima.
  link.crossOrigin = 'anonymous'
  document.head.append(link)
}

/**
 * Descarga (una sola vez) el motor del mapa, el worker y el descriptor de
 * teselas. `force` ignora las preferencias de red: se usa al entrar en Estudio,
 * donde el mapa se va a necesitar de todos modos.
 */
export function prewarmStudyMap(force = false): Promise<void> {
  if (started) return started
  if (!force && !worthIt()) return Promise.resolve()
  if (typeof window === 'undefined' || !navigator.onLine) return Promise.resolve()
  preconnect('https://tiles.openfreemap.org')
  started = import('./flightMap')
    .then(({ warmUpMapAssets }) => warmUpMapAssets())
    .catch(() => {
      // Sin red a mitad de camino: se reintenta la próxima vez.
      started = null
    })
  return started
}

/**
 * Programa el precalentamiento para cuando la app esté en reposo, lejos del
 * primer pintado. Devuelve la función que lo cancela.
 */
export function scheduleStudyMapPrewarm(delayMs = 3500): () => void {
  if (typeof window === 'undefined') return () => {}
  let idleId: number | undefined
  const timer = window.setTimeout(() => {
    const run = () => void prewarmStudyMap()
    if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(run, { timeout: 4000 })
    else run()
  }, delayMs)
  return () => {
    window.clearTimeout(timer)
    if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
  }
}
