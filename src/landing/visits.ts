/**
 * Contador propio de visitas por `?ref=<fuente>` (enlaces de TikTok, etc.).
 *
 * Sin terceros ni cookies: no se guarda la IP ni nada del visitante, solo
 * «día + fuente + 1» en una tabla de Supabase. Se cuenta una vez por sesión
 * del navegador y la fuente se recuerda en este dispositivo (primer origen)
 * para poder saber más tarde cuántas visitas acabaron creando un curso.
 *
 * APAGADO hasta aplicar supabase/pendientes/landing_visits.sql (pendiente del
 * visto bueno de Álvaro): con `VISITS_ENABLED = false` solo se recuerda la
 * fuente en local y no sale nada del dispositivo.
 */
import { SUPABASE_KEY, SUPABASE_URL, SYNC_AVAILABLE } from '@/sync/config'
import { cleanRef } from './ref'

export const VISITS_ENABLED = false

const FIRST_KEY = 'orbita.ref'
const SESSION_KEY = 'orbita.ref.counted'

/** Fuente con la que llegó este dispositivo por primera vez, si la hay. */
export function firstRef(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(FIRST_KEY) ?? 'null') as { ref?: string } | null
    return cleanRef(v?.ref ?? null)
  } catch {
    return null
  }
}

/** Se llama al abrir la web. Devuelve la fuente leída de la dirección. */
export function trackVisit(): string | null {
  let ref: string | null = null
  try {
    const url = new URL(window.location.href)
    ref = cleanRef(url.searchParams.get('ref'))
    if (url.searchParams.has('ref')) {
      url.searchParams.delete('ref')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
  } catch {
    return null
  }
  const source = ref ?? 'directo'
  try {
    if (ref && !localStorage.getItem(FIRST_KEY)) {
      localStorage.setItem(FIRST_KEY, JSON.stringify({ ref, at: new Date().toISOString() }))
    }
    if (sessionStorage.getItem(SESSION_KEY)) return ref
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    /* sin almacenamiento: se cuenta igualmente una vez */
  }
  if (VISITS_ENABLED && SYNC_AVAILABLE && navigator.onLine !== false) {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/count_visit`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ref: source }),
    }).catch(() => {})
  }
  return ref
}
