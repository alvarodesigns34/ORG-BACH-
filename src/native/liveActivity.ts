/**
 * Puente con la app nativa (Capacitor), si la web está corriendo dentro de
 * ella. Ver `native/README.md`.
 *
 * - Live Activity del vuelo en la pantalla de bloqueo (ActivityKit).
 * - Avisos de aterrizaje y escalas como notificaciones locales: en la app
 *   nativa no hace falta el servidor ni tener sesión iniciada.
 *
 * En el navegador o en la PWA, `window.Capacitor` no existe y todo esto no
 * hace nada. No se importa ningún paquete de Capacitor: la app nativa inyecta
 * `window.Capacitor.Plugins` por su cuenta.
 */

import { useEffect } from 'react'

import { inLayover, landingAt, remainingMs, timeline } from '@/domain/flights'
import type { FocusSession } from '@/domain/types'

interface Plugin {
  [method: string]: ((options?: unknown) => Promise<unknown>) | undefined
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: Record<string, Plugin | undefined>
}

function capacitor(): CapacitorGlobal | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() ? cap : null
}

export function isNativeApp(): boolean {
  return capacitor() !== null
}

function call(plugin: string, method: string, options?: unknown): Promise<unknown> {
  const fn = capacitor()?.Plugins?.[plugin]?.[method]
  return fn ? fn(options).catch(() => null) : Promise.resolve(null)
}

interface FlightInfo {
  city?: string
  subject?: string
}

/** Estado de la Live Activity para el vuelo tal como está ahora. */
function stateOf(session: FocusSession, now: number, info: FlightInfo) {
  const subject = info.subject ?? 'Estudio libre'
  if (inLayover(session)) {
    return {
      phase: 'escala',
      phaseStart: Date.parse(session.layoverAt!),
      phaseEnd: session.layoverEndsAt ? Date.parse(session.layoverEndsAt) : now,
      pausedRemainingMinutes: 0,
      subject,
    }
  }
  if (session.pausedAt) {
    return {
      phase: 'pausa',
      phaseStart: now,
      phaseEnd: now,
      pausedRemainingMinutes: Math.ceil(remainingMs(session, now) / 60_000),
      subject,
    }
  }
  return {
    phase: 'vuelo',
    phaseStart: Date.parse(session.startedAt),
    phaseEnd: landingAt(session, now) ?? now,
    pausedRemainingMinutes: 0,
    subject,
  }
}

/** Ids de las notificaciones locales de un vuelo (deterministas: se pueden cancelar). */
const NOTIFICATION_BASE = 4200

async function scheduleLocal(session: FocusSession | undefined, info: FlightInfo, enabled: boolean) {
  const pending = (await call('LocalNotifications', 'getPending')) as { notifications?: { id: number }[] } | null
  const ours = (pending?.notifications ?? []).filter((n) => n.id >= NOTIFICATION_BASE && n.id < NOTIFICATION_BASE + 100)
  if (ours.length) await call('LocalNotifications', 'cancel', { notifications: ours.map((n) => ({ id: n.id })) })
  if (!session || !enabled) return
  const destination = info.city ?? session.to
  const notifications = timeline(session, Date.now())
    .filter((e) => e.at > Date.now() + 5000)
    .slice(0, 60)
    .map((e, i) => ({
      id: NOTIFICATION_BASE + i,
      title:
        e.kind === 'aterrizaje'
          ? `Has aterrizado en ${destination}`
          : e.kind === 'escala'
            ? 'Escala: toca descansar'
            : 'Fin de la escala',
      body:
        e.kind === 'aterrizaje'
          ? 'Sesión de estudio completada.'
          : e.kind === 'escala'
            ? `${session.layoverMinutes ?? 0} min para levantarte y beber agua.`
            : `Vuelves a volar hacia ${destination}.`,
      schedule: { at: new Date(e.at), allowWhileIdle: true },
      extra: { url: '#/estudio' },
    }))
  if (notifications.length) await call('LocalNotifications', 'schedule', { notifications })
}

/** Vuelo con Live Activity abierta (una como mucho). */
let started: string | null = null

/**
 * Cierra la Live Activity del vuelo que acaba de terminar: si aterrizó, se
 * queda un rato en la pantalla de bloqueo; si se abandonó, desaparece.
 */
export function endNativeFlight(landed: boolean): void {
  if (!isNativeApp() || !started) return
  started = null
  void call('LiveActivity', 'end', { landed })
}

/**
 * Mantiene la Live Activity y los avisos locales al día con el vuelo en
 * curso. Lo usa el controlador del vuelo; fuera de la app nativa no hace nada.
 */
export function useNativeFlight(
  active: FocusSession | undefined,
  info: FlightInfo & { from?: string; to?: string; alerts: boolean },
): void {
  const key = active
    ? `${active.id}|${active.pausedAt ?? ''}|${active.pausedMs}|${active.layoversDone ?? 0}|${info.subject ?? ''}|${info.city ?? ''}`
    : ''

  useEffect(() => {
    if (!isNativeApp()) return
    if (!active) {
      endNativeFlight(false)
      void scheduleLocal(undefined, info, false)
      return
    }
    const state = stateOf(active, Date.now(), info)
    if (started !== active.id) {
      started = active.id
      void call('LiveActivity', 'start', {
        from: active.from,
        to: active.to,
        city: info.city ?? active.to,
        plannedMinutes: active.plannedMinutes,
        ...state,
      })
      void call('LocalNotifications', 'requestPermissions')
    } else {
      void call('LiveActivity', 'update', state)
    }
    void scheduleLocal(active, info, info.alerts)
    // Solo cuando cambia algo que mueve las horas del vuelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, info.alerts])
}
