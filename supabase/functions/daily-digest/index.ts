/**
 * Resumen diario por notificación push.
 *
 * Tres usos:
 *  - GET  ?action=vapid          → clave pública VAPID (la genera la primera vez).
 *  - POST {action: 'test'}       → envía ya el resumen a los dispositivos del
 *                                  usuario autenticado (botón «Probar» de Ajustes).
 *  - POST {action: 'cron'}       → lo llama pg_cron cada hora con un secreto
 *                                  compartido. Envía a cada suscripción cuya hora
 *                                  local (por defecto 17:00 Europe/Madrid) ha
 *                                  llegado y que aún no ha recibido el de hoy.
 *
 * El horario de verano no necesita tratamiento especial: la hora local se
 * calcula con la base de datos de zonas horarias en cada ejecución, así que el
 * aviso sale a las 17:00 de Madrid tanto en CET (16:00 UTC) como en CEST
 * (15:00 UTC).
 *
 * Las claves VAPID y el secreto del cron se generan y guardan en
 * `private.config`, un esquema que la API no expone: no pasan por el
 * repositorio ni por el navegador (salvo la pública, que es pública).
 */

import postgres from 'npm:postgres@3.4.5'
import webpush from 'npm:web-push@3.6.7'

import { buildDigest, localParts, type Digest, type SyncRow } from './digest.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const VAPID_SUBJECT = 'https://alvarodesigns34.github.io/ORG-BACH-/'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface Vapid {
  publicKey: string
  privateKey: string
}

let vapidCache: Vapid | null = null

async function vapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache
  const result = await sql.begin(async (tx) => {
    // Un solo generador a la vez: dos llamadas simultáneas no deben guardar
    // mitades de pares distintos.
    await tx`select pg_advisory_xact_lock(hashtext('vapid-keys'))`
    const rows = await tx<{ key: string; value: string }[]>`
      select key, value from private.config where key in ('vapid_public', 'vapid_private')`
    const found = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    if (found.vapid_public && found.vapid_private) {
      return { publicKey: found.vapid_public, privateKey: found.vapid_private }
    }
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const keys = { publicKey: b64url(raw), privateKey: jwk.d! }
    await tx`
      insert into private.config (key, value)
      values ('vapid_public', ${keys.publicKey}), ('vapid_private', ${keys.privateKey})
      on conflict (key) do update set value = excluded.value`
    return keys
  })
  vapidCache = result
  return result
}

async function cronSecret(): Promise<string | null> {
  const rows = await sql<
    { value: string }[]
  >`select value from private.config where key = 'cron_secret'`
  return rows[0]?.value ?? null
}

/** Comparación en tiempo constante para el secreto del cron. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------------------
// Resumen (el texto se compone en digest.ts)
// ---------------------------------------------------------------------------

async function digestFor(userId: string, today: string): Promise<Digest> {
  const rows = await sql<SyncRow[]>`
    select collection, id, data, clocks
    from public.sync_records
    where user_id = ${userId} and collection in ('tasks', 'exams', 'subjects', 'settings')`
  return buildDigest(rows, today)
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  timezone: string
  hour: number
  last_sent_on: string | null
}

async function send(
  sub: Subscription,
  digest: Digest,
  keys: Vapid,
): Promise<'ok' | 'gone' | 'error'> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: digest.title,
        body: digest.body,
        tag: 'resumen-diario',
        url: '#/inicio',
      }),
      {
        TTL: 6 * 3600,
        urgency: 'normal',
        vapidDetails: {
          subject: VAPID_SUBJECT,
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
        },
      },
    )
    return 'ok'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      // El navegador revocó la suscripción: se borra para no insistir.
      await sql`delete from public.push_subscriptions where id = ${sub.id}`
      return 'gone'
    }
    console.error('push fallido', status, (error as Error).message)
    return 'error'
  }
}

/** Margen para recuperar una ejecución del cron perdida o retrasada. */
const CATCH_UP_HOURS = 2

async function runCron(): Promise<Response> {
  const keys = await vapid()
  const now = new Date()
  const subs = await sql<Subscription[]>`
    select id, user_id, endpoint, p256dh, auth, timezone, hour, last_sent_on::text
    from public.push_subscriptions where enabled`

  const digests = new Map<string, Digest>()
  let sent = 0
  for (const sub of subs) {
    let local
    try {
      local = localParts(now, sub.timezone)
    } catch {
      local = localParts(now, 'Europe/Madrid')
    }
    if (local.hour < sub.hour || local.hour > sub.hour + CATCH_UP_HOURS) continue
    if (sub.last_sent_on === local.day) continue

    // Se reclama el envío antes de hacerlo: dos ejecuciones solapadas no
    // pueden mandar el mismo resumen dos veces.
    const claimed = await sql`
      update public.push_subscriptions set last_sent_on = ${local.day}
      where id = ${sub.id} and last_sent_on is distinct from ${local.day}::date
      returning id`
    if (claimed.length === 0) continue

    const cacheKey = `${sub.user_id}|${local.day}`
    let digest = digests.get(cacheKey)
    if (!digest) {
      digest = await digestFor(sub.user_id, local.day)
      digests.set(cacheKey, digest)
    }
    // Sin nada que contar no se molesta: una notificación vacía diaria acaba
    // enseñando a ignorarlas todas.
    if (digest.empty) continue
    if ((await send(sub, digest, keys)) === 'ok') sent++
  }
  return json({ ok: true, checked: subs.length, sent })
}

async function userFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string }
  return user.id ?? null
}

async function runTest(req: Request, body: Record<string, unknown>): Promise<Response> {
  const userId = await userFromRequest(req)
  if (!userId) return json({ error: 'No autenticado' }, 401)
  const keys = await vapid()

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null
  const subs = await sql<Subscription[]>`
    select id, user_id, endpoint, p256dh, auth, timezone, hour, last_sent_on::text
    from public.push_subscriptions
    where user_id = ${userId} ${endpoint ? sql`and endpoint = ${endpoint}` : sql``}`
  if (subs.length === 0) return json({ error: 'Este dispositivo no tiene avisos activados' }, 404)

  const today = localParts(new Date(), subs[0].timezone).day
  const digest = await digestFor(userId, today)
  const results = await Promise.all(subs.map((s) => send(s, digest, keys)))
  return json({ ok: results.includes('ok'), results })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const url = new URL(req.url)
    if (req.method === 'GET' && url.searchParams.get('action') === 'vapid') {
      return json({ publicKey: (await vapid()).publicKey })
    }
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (body.action === 'cron') {
      const expected = await cronSecret()
      const given = req.headers.get('x-cron-secret') ?? ''
      if (!expected || !safeEqual(given, expected)) return json({ error: 'No autorizado' }, 401)
      return await runCron()
    }
    if (body.action === 'test') return await runTest(req, body)
    return json({ error: 'Acción desconocida' }, 400)
  } catch (error) {
    console.error(error)
    return json({ error: 'Error interno' }, 500)
  }
})
