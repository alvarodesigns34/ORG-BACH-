/**
 * Pestañas con una versión vieja de la app.
 *
 * Cada publicación cambia los nombres de los bloques que se descargan aparte
 * (el mapa, el asistente, las vistas). Una pestaña abierta desde antes —en el
 * ordenador es lo normal— pide los nombres viejos, que ya no existen, y el
 * navegador recuerda ese fallo hasta recargar. Aquí se recarga sola, una vez:
 * si el fallo sigue tras recargar (sin red, servidor caído), no entra en bucle.
 */

const KEY = 'orbita:recarga-version'
/** Si ya se recargó hace menos de esto, no se vuelve a intentar. */
const WINDOW_MS = 60_000

/** Recarga la página si tiene sentido. Devuelve si lo ha hecho. */
export function reloadForNewVersion(): boolean {
  if (typeof window === 'undefined' || !navigator.onLine) return false
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

/** Vite avisa con este evento cuando un bloque diferido no llega. */
export function installStaleVersionReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault()
  })
}
