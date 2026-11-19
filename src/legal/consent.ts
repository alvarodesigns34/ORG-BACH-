/**
 * Aceptación de las condiciones y la privacidad en el alta.
 *
 * Se guarda en este dispositivo, aparte del curso (no viaja con la
 * sincronización ni con las copias), con la versión de los textos y la fecha.
 * Debe coincidir con VERSION de scripts/legal.mjs (lo comprueba un test).
 */
export const LEGAL_VERSION = '2026-11-19'

const KEY = 'orbita.legal.consent'

export interface Consent {
  version: string
  /** Fecha y hora ISO de la aceptación. */
  at: string
  /** Declaró tener al menos 14 años. */
  minAge: 14
}

export function recordConsent(now = new Date()): Consent {
  const consent: Consent = { version: LEGAL_VERSION, at: now.toISOString(), minAge: 14 }
  try {
    localStorage.setItem(KEY, JSON.stringify(consent))
  } catch {
    /* sin almacenamiento: el alta sigue igualmente */
  }
  return consent
}

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Consent>
    return typeof v.version === 'string' && typeof v.at === 'string' ? (v as Consent) : null
  } catch {
    return null
  }
}
