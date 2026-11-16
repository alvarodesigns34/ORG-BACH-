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
  alerts.length === 0 ? '' : `${sessionId}|${alerts.map((a) => `${a.kind}@${a.at.slice(0, 19)}`).join(',')}`

let cachedToken: string | null = null

async function post(sessionId: string, alerts: Alert[], keepalive: boolean): Promise<boolean> {
  // Al ocultarse la página no hay tiempo de esperar a refrescar el token:
  // se usa el último conocido y `keepalive` deja terminar la petición.
  let token = keepalive ? cachedToken : null
  if (!token) {
    token = await syncEngine.accessToken().catch(() => null)
    cachedToken = token
  }
  if (!token) return false
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
  /** Lo último que el servidor tiene programado (firma) y de qué vuelo. */
  const sent = useRef<{ sessionId: string; signature: string } | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!SYNC_AVAILABLE) return
    // Sin vuelo y sin nada programado no hay nada que vigilar.
    if (!live.current.active && !sent.current?.signature) return

    const sync = (keepalive = false) => {
      const { active: session, city: destination, enabled: on } = live.current
      if (!syncEngine.getStatus().email) return
      const visible = document.visibilityState === 'visible'
      const alerts = session && on ? composeAlerts(session, Date.now(), destination, visible) : []
      const sessionId = session?.id ?? sent.current?.sessionId
      if (!sessionId) return
      const next = signature(sessionId, alerts)
      // Sin nada programado y nada que programar: ni una petición.
      if (next === (sent.current?.signature ?? '')) return
      const before = sent.current
      sent.current = { sessionId, signature: next }
      void post(sessionId, alerts, keepalive).then((ok) => {
        // Si falló, se olvida lo «enviado» para reintentarlo en la próxima vuelta.
        if (!ok && sent.current?.signature === next) sent.current = before
      })
    }

    const soon = () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => sync(), 700)
    }
    const onVisibility = () => {
      if (timer.current) window.clearTimeout(timer.current)
      sync(document.visibilityState === 'hidden')
    }

    soon()
    // Cada pocos segundos: retira el aviso que está a punto de ocurrir con la
    // app a la vista y reintenta lo que no llegó.
    const interval = window.setInterval(() => sync(), 5000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
    }
    // Se reprograma cuando cambia algo del vuelo que mueva sus horas.
  }, [
    active?.id,
    active?.status,
    active?.pausedAt,
    active?.pausedMs,
    active?.layoversDone,
    active?.plannedMinutes,
    city,
    enabled,
  ])
}
