/**
 * Cuándo se muestra la web de presentación en vez de la app.
 *
 * Igual que en plisé: quien llega desde el navegador, sin la app instalada y
 * sin curso en este dispositivo, ve primero la presentación; desde ella se
 * entra a la app sin recargar. Con la app instalada, con curso ya creado o
 * con `?app` en la dirección, se va directo a la app.
 *
 * MIENTRAS `LANDING_IS_ENTRY` sea false, la entrada de siempre no cambia: la
 * presentación solo aparece con `?presentacion` (vista previa). Para
 * estrenarla, poner `LANDING_IS_ENTRY = true` (pendiente del visto bueno).
 */
import { STORAGE_KEY } from '@/data/defaults'

export const LANDING_IS_ENTRY = false

const INTENT_KEY = 'orbita.landing.intent'

function params(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search)
  } catch {
    return new URLSearchParams()
  }
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/** ¿Hay ya un curso en este dispositivo? (sin cargar el almacén entero). */
function hasCourse(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    // El alta deja `"onboarded":true` en los ajustes; basta con buscarlo.
    return /"onboarded"\s*:\s*true/.test(raw)
  } catch {
    return false
  }
}

/** `?presentacion` fuerza la vista previa (también con la app instalada). */
export function isLandingPreview(): boolean {
  return params().has('presentacion')
}

export function shouldShowLanding(): boolean {
  const p = params()
  if (p.has('presentacion')) return true
  if (!LANDING_IS_ENTRY) return false
  if (p.has('app')) return false
  // Un enlace directo a una sección de la app (#/tareas, accesos directos).
  if (/^#\/[a-z]/.test(window.location.hash)) return false
  return !isStandalone() && !hasCourse()
}

export type LandingIntent = 'start' | 'signin'

/** Se guarda al salir de la presentación para que la app sepa qué se pidió. */
export function setLandingIntent(intent: LandingIntent) {
  try {
    sessionStorage.setItem(INTENT_KEY, intent)
  } catch {
    /* sin almacenamiento: se empieza por el alta normal */
  }
}

/** Lee y borra la intención (una sola vez). */
export function takeLandingIntent(): LandingIntent | null {
  try {
    const v = sessionStorage.getItem(INTENT_KEY)
    sessionStorage.removeItem(INTENT_KEY)
    return v === 'start' || v === 'signin' ? v : null
  } catch {
    return null
  }
}

/** Quita `?presentacion` / `?app` de la dirección sin recargar. */
export function cleanLandingParams() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('presentacion')
    url.searchParams.delete('app')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {
    /* nada que limpiar */
  }
}
