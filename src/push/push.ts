/**
 * Resumen diario por notificación push.
 *
 * El aviso lo manda el servidor (pg_cron + la función `daily-digest`), no un
 * temporizador del navegador: llega con la aplicación cerrada y el móvil
 * bloqueado. El servidor calcula el resumen con los datos sincronizados, por
 * eso requiere haber iniciado sesión.
 *
 * Cada dispositivo tiene su propia suscripción y su propia hora; la zona
 * horaria es la peninsular española, con el cambio de hora resuelto en el
 * servidor.
 */

import { DIGEST_FUNCTION_URL, SUPABASE_KEY } from '../sync/config.ts'
import { getClient, syncEngine } from '../sync/engine.ts'

export const PUSH_TIMEZONE = 'Europe/Madrid'
export const DEFAULT_DIGEST_HOUR = 17

const PREFS_KEY = 'bachillerato-os:push'

export interface PushPrefs {
  enabled: boolean
  hour: number
}

export type PushSupport =
  | { ok: true }
  /** iPhone/iPad en Safari: hay que instalar la app en la pantalla de inicio. */
  | { ok: false; reason: 'needs-install' }
  | { ok: false; reason: 'unsupported' }

function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }
  const capable =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIos() && !isStandalone()) return { ok: false, reason: 'needs-install' }
  return capable ? { ok: true } : { ok: false, reason: 'unsupported' }
}

export function permission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export function loadPrefs(): PushPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<PushPrefs> | null
    const hour = Number(raw?.hour)
    return {
      enabled: raw?.enabled === true,
      hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_DIGEST_HOUR,
    }
  } catch {
    return { enabled: false, hour: DEFAULT_DIGEST_HOUR }
  }
}

function savePrefs(prefs: PushPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Solo es una caché de la interfaz: la verdad está en el servidor.
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function vapidPublicKey(): Promise<string> {
  const res = await fetch(`${DIGEST_FUNCTION_URL}?action=vapid`, {
    headers: { apikey: SUPABASE_KEY },
  })
  if (!res.ok) throw new Error('No se pudo contactar con el servidor de avisos.')
  const body = (await res.json()) as { publicKey?: string }
  if (!body.publicKey) throw new Error('El servidor de avisos no está configurado.')
  return body.publicKey
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador no admite avisos.')
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('La aplicación aún se está instalando. Recarga e inténtalo de nuevo.')),
        8000,
      ),
    ),
  ])
  return reg
}

async function register(subscription: PushSubscription, prefs: PushPrefs) {
  const json = subscription.toJSON()
  const client = await getClient()
  const { error } = await client.rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_timezone: PUSH_TIMEZONE,
    p_hour: prefs.hour,
    p_enabled: prefs.enabled,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

/**
 * Activa el resumen en este dispositivo.
 *
 * Debe llamarse directamente desde el gesto del usuario: Safari solo muestra
 * la petición de permiso si `requestPermission` es lo primero que ocurre.
 */
export async function enableDigest(hour: number): Promise<void> {
  const granted = await Notification.requestPermission()
  if (granted !== 'granted') {
    throw new Error(
      granted === 'denied'
        ? 'Los avisos están bloqueados para esta aplicación. Actívalos en los ajustes del sistema.'
        : 'No se ha dado permiso para enviar avisos.',
    )
  }
  const [reg, key] = await Promise.all([registration(), vapidPublicKey()])
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(key),
    })
  }
  const prefs = { enabled: true, hour }
  await register(subscription, prefs)
  savePrefs(prefs)
}

export async function updateDigestHour(hour: number): Promise<void> {
  const reg = await registration()
  const subscription = await reg.pushManager.getSubscription()
  const prefs = { enabled: true, hour }
  if (subscription) await register(subscription, prefs)
  savePrefs(prefs)
}

export async function disableDigest(): Promise<void> {
  const prefs = { ...loadPrefs(), enabled: false }
  savePrefs(prefs)
  try {
    const reg = await registration()
    const subscription = await reg.pushManager.getSubscription()
    if (!subscription) return
    const client = await getClient()
    await client.rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  } catch {
    // Sin red: la preferencia local ya está apagada; el servidor dejará de
    // enviar cuando el navegador revoque la suscripción o al reintentar.
  }
}

/** Envía ahora el resumen a este dispositivo, para comprobar que llega. */
export async function sendTestDigest(): Promise<void> {
  const token = await syncEngine.accessToken()
  if (!token) throw new Error('Inicia sesión para probar los avisos.')
  const reg = await registration()
  const subscription = await reg.pushManager.getSubscription()
  if (!subscription) throw new Error('Este dispositivo no tiene los avisos activados.')
  const res = await fetch(DIGEST_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ action: 'test', endpoint: subscription.endpoint }),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'El aviso de prueba no se pudo enviar.')
}
