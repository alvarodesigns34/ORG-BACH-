/**
 * Avisos del vuelo con la app cerrada o el iPad bloqueado.
 *
 * Una web en segundo plano no puede programarse una notificación a sí misma:
 * el sistema la suspende. Quien avisa es el servidor (Web Push), igual que
 * con el resumen diario. Al despegar se le manda la línea de tiempo del vuelo
 * —cuándo empieza y termina cada escala, cuándo se aterriza— y cada cambio la
 * sustituye: pausar la borra (nadie sabe cuándo se reanudará), reanudar la
 * vuelve a programar con las horas nuevas, abandonar la cancela.
 *
 * Requiere sesión iniciada (el servidor necesita saber a quién avisar) y, en
 * el dispositivo que deba recibirlos, las notificaciones activadas. En iPhone
 * y iPad eso solo es posible con la app instalada en la pantalla de inicio.
 */

import { useEffect, useRef } from 'react'

import { formatFlightTime, timeline, type FlightEvent } from '@/domain/flights'
import type { FocusSession } from '@/domain/types'
import { SUPABASE_KEY, SUPABASE_URL, SYNC_AVAILABLE } from '@/sync/config'
import { syncEngine } from '@/sync/engine'

interface Alert {
  kind: FlightEvent['kind']
  /** ISO. */
  at: string
  title: string
  body: string
}

/** Lo que ocurra en estos segundos con la app a la vista ya se ve y se oye. */
const FOREGROUND_MS = 20_000

export function composeAlerts(
  session: FocusSession,
  now: number,
  city: string | undefined,
  visible: boolean,
): Alert[] {
  const destination = city ?? session.to
  const alerts: Alert[] = []
  for (const event of timeline(session, now)) {
    if (visible && event.at - now < FOREGROUND_MS) continue
    const at = new Date(event.at).toISOString()
    if (event.kind === 'aterrizaje') {
      alerts.push({
        kind: event.kind,
        at,
        title: `Has aterrizado en ${destination}`,
        body: `${formatFlightTime(session.plannedMinutes)} de estudio completados. Buen vuelo.`,
      })
    } else if (event.kind === 'escala') {
      alerts.push({
        kind: event.kind,
        at,
        title: 'Escala: toca descansar',
        body: `${session.layoverMinutes ?? 0} min para levantarte y beber agua. El vuelo sigue solo.`,
      })
    } else {
      alerts.push({
        kind: event.kind,
        at,
        title: 'Fin de la escala',
        body: `Vuelves a volar hacia ${destination}.`,
      })
    }
  }
  return alerts
}

const signature = (sessionId: string, alerts: Alert[]) =>
  alerts.length === 0 ? '' : JSON.stringify([sessionId, alerts])

let cachedToken: { account: string; token: string } | null = null

async function post(account: string, sessionId: string, alerts: Alert[], keepalive: boolean): Promise<boolean> {
  // Al ocultarse la página no hay tiempo de esperar a refrescar el token:
  // se usa el último conocido y `keepalive` deja terminar la petición.
  let token = keepalive && cachedToken?.account === account ? cachedToken.token : null
  if (!token) {
    token = await syncEngine.accessToken().catch(() => null)
  }
  if (!token || syncEngine.getStatus().email !== account) return false
  cachedToken = { account, token }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/schedule_flight_alerts`, {
      method: 'POST',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ p_session_id: sessionId, p_alerts: alerts }),
    })
    if (res.status === 401) cachedToken = null
    return res.ok
  } catch {
    return false
  }
}

/**
 * Mantiene en el servidor los avisos del vuelo en curso. `enabled` es la
 * preferencia de este dispositivo; sin sesión iniciada no hace nada.
 */
export function useFlightAlerts(
  active: FocusSession | undefined,
  { city, enabled }: { city?: string; enabled: boolean },
): void {
  const live = useRef({ active, city, enabled })
  live.current = { active, city, enabled }
  type Schedule = { account: string; sessionId: string; signature: string; alerts: Alert[]; keepalive: boolean }
  const confirmed = useRef<Schedule | null>(null)
  const requesting = useRef<Schedule | null>(null)
  const desired = useRef<Schedule | null>(null)

  useEffect(() => {
    if (!SYNC_AVAILABLE || (!live.current.active && !confirmed.current?.signature && !requesting.current)) return
    let closed = false

    const flush = () => {
      if (closed || requesting.current || !desired.current) return
      const request = desired.current
      const previous = confirmed.current
      if (request.signature === (previous?.account === request.account ? previous.signature : '')) return
      requesting.current = request
      void post(request.account, request.sessionId, request.alerts, request.keepalive).then((ok) => {
        if (ok) confirmed.current = request
        requesting.current = null
        // Una edición posterior espera a que termine la anterior. Si falló,
        // la siguiente señal de conexión o el temporizador permite reintentar.
        if (desired.current !== request) flush()
      })
    }

    const sync = (keepalive = false) => {
      const { active: session, city: destination, enabled: on } = live.current
      const account = syncEngine.getStatus().email
      if (!account) return
      const previous = requesting.current ?? confirmed.current
      const sessionId = session?.id ?? (previous?.account === account ? previous.sessionId : undefined)
      if (!sessionId) return
      const visible = document.visibilityState === 'visible'
      const alerts = session && on ? composeAlerts(session, Date.now(), destination, visible) : []
      const next = signature(sessionId, alerts)
      if (desired.current?.account !== account || desired.current.signature !== next || (keepalive && !desired.current.keepalive)) {
        desired.current = { account, sessionId, signature: next, alerts, keepalive }
      }
      flush()
    }

    const onVisibility = () => sync(document.visibilityState === 'hidden')
    const onOnline = () => sync()
    const initial = window.setTimeout(() => sync(), 250)
    const interval = window.setInterval(() => sync(), 5000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      closed = true
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [
    active?.id,
    active?.status,
    active?.pausedAt,
    active?.pausedMs,
    active?.layoverEndsAt,
    active?.layoversDone,
    active?.plannedMinutes,
    city,
    enabled,
  ])
}
