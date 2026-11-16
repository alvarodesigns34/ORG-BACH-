import { useEffect, useRef, useState } from 'react'

import {
  activeSession,
  elapsedMs,
  formatFlightTime,
  inLayover,
  interpolate,
  layoverEndMs,
  nearestAirport,
  nextEvent,
  remainingMs,
  type Airport,
} from '@/domain/flights'
import type { FocusSession, Subject } from '@/domain/types'
import { useRoute } from '@/router'
import { useDispatch, useStore } from '@/state/StoreProvider'
import { useSubjectMap } from '@/state/selectors'
import { haptic } from '@/ui/motion'
import { useToast } from '@/ui/Toast'
import { beginFlightAudio, endFlightAudio, wantsLockCard } from './flightAudio'
import { useFlightAlerts } from './flightAlerts'
import { endNativeFlight, isNativeApp, useNativeFlight } from '@/native/liveActivity'
import { useNow } from './hooks'
import { clearFlightCard, flightArtwork, setFlightActions, showFlightCard } from './mediaSession'
import { useStudyPrefs } from './prefs'
import {
  audioRunning,
  carrierPlaying,
  chime,
  duck,
  onCarrierPlaying,
  playingSound,
} from './soundscape'

type Airports = { byIata: Map<string, Airport>; all: Airport[] }

/** Los aeropuertos pesan: se piden solo cuando hay un vuelo del que hablar. */
function useAirports(needed: boolean): Airports | null {
  const [airports, setAirports] = useState<Airports | null>(null)
  useEffect(() => {
    if (!needed || airports) return
    let alive = true
    void import('./airports').then((m) => {
      if (alive) setAirports({ byIata: m.AIRPORT_BY_IATA, all: m.AIRPORTS })
    })
    return () => {
      alive = false
    }
  }, [needed, airports])
  return airports
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

/**
 * El vuelo, fuera de la vista de estudio.
 *
 * Un vuelo sigue en el aire aunque salgas a Tareas, bloquees el iPad o
 * cierres la app. Este componente (sin interfaz propia) vive en el armazón
 * mientras la app está abierta y se ocupa de todo lo que no es dibujar:
 *
 * - poner el vuelo al día cada segundo y al volver a la app (escalas que
 *   empiezan y terminan solas, aterrizaje a su hora);
 * - el sonido que acompaña a cada cambio: megafonía, atenuar en pausa;
 * - la tarjeta de la pantalla de bloqueo (ver `mediaSession.ts`);
 * - programar en el servidor los avisos de aterrizaje y de fin de escala.
 */
export function FlightController() {
  const { data } = useStore()
  const dispatch = useDispatch()
  const toast = useToast()
  const { route, navigate } = useRoute()
  const [prefs] = useStudyPrefs()
  const subjects = useSubjectMap()

  const active = activeSession(data.sessions)
  const airports = useAirports(!!active)
  const from = active ? airports?.byIata.get(active.from) : undefined
  const to = active ? airports?.byIata.get(active.to) : undefined
  const routeName = active ? `${from?.city ?? active.from} → ${to?.city ?? active.to}` : ''

  const live = useRef({ active, routeName, to, onStudy: route.id === 'estudio' })
  live.current = { active, routeName, to, onStudy: route.id === 'estudio' }

  // --- Poner el vuelo al día ---------------------------------------------
  const activeId = active?.id
  useEffect(() => {
    if (!activeId) return
    const check = () => {
      const session = live.current.active
      if (!session) return
      const event = nextEvent(session)
      if (event && event.at <= Date.now()) {
        dispatch({ type: 'session/tick', id: session.id, now: Date.now(), route: live.current.routeName })
      }
    }
    check()
    const id = window.setInterval(check, 1000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', check)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pageshow', check)
      window.removeEventListener('focus', check)
    }
  }, [activeId, dispatch])

  // --- Lo que suena (y se nota) en cada cambio ---------------------------
  const seen = useRef<{ id: string; layover: boolean; paused: boolean } | null>(null)
  const landedCard = useRef<number | null>(null)
  useEffect(() => {
    const before = seen.current
    const now = active
      ? { id: active.id, layover: inLayover(active), paused: !!active.pausedAt }
      : null
    seen.current = now

    if (before && (!now || now.id !== before.id)) {
      // El vuelo que había ha terminado: aterrizó o se abandonó.
      const ended = data.sessions.find((s) => s.id === before.id)
      const landed = ended?.status === 'aterrizado' && ended.endedAt
      const fresh = landed && Date.now() - Date.parse(ended.endedAt!) < 15_000
      endNativeFlight(!!landed)
      if (fresh && audioRunning()) chime('megafonia')
      if (fresh) haptic('success')
      if (landed && !live.current.onStudy) {
        const city = live.current.to?.city ?? ended.to
        toast({
          text: fresh
            ? `Has aterrizado en ${city} · ${formatFlightTime(ended.focusedMinutes ?? ended.plannedMinutes)}`
            : `Aterrizaste en ${city} a las ${clock(Date.parse(ended.endedAt!))}`,
          action: { label: 'Ver', run: () => navigate('estudio') },
          duration: 7000,
        })
      }
      // La megafonía necesita unos segundos: el portador se apaga después,
      // para que el sistema no duerma la página a mitad del aviso.
      duck(true)
      if (landedCard.current) window.clearTimeout(landedCard.current)
      if (fresh && ended) {
        showFlightCard({
          title: `Has aterrizado en ${live.current.to?.city ?? ended.to}`,
          subtitle: `${formatFlightTime(ended.focusedMinutes ?? ended.plannedMinutes)} estudiados`,
          artwork: null,
          duration: ended.plannedMinutes * 60,
          position: ended.plannedMinutes * 60,
          moving: false,
          paused: true,
        })
      }
      landedCard.current = window.setTimeout(
        () => {
          landedCard.current = null
          // Si entretanto despegó otro vuelo, el audio es suyo.
          if (seen.current) return
          endFlightAudio()
          clearFlightCard()
        },
        fresh ? 5000 : 0,
      )
      if (!now) return
    }
    if (!now) return
    if (!before || before.id !== now.id) {
      duck(now.paused)
      return
    }
    if (!before.layover && now.layover) {
      duck(true)
      if (audioRunning()) chime('aviso')
      haptic('success')
    } else if (before.layover && !now.layover) {
      duck(now.paused)
      if (audioRunning()) chime('aviso')
    } else if (before.paused !== now.paused) {
      duck(now.paused)
    }
  }, [active, data.sessions, toast, navigate])

  // --- Audio: el primer toque lo enciende si hace falta ------------------
  // Al volver a un vuelo ya en marcha (recarga, otro dispositivo) no hay
  // gesto con el que arrancar el audio, y Safari lo exige.
  useEffect(() => {
    if (!activeId) return
    const ambientReady = prefs.sound === 'ninguno' || playingSound() === prefs.sound
    const carrierReady = !wantsLockCard(prefs) || carrierPlaying()
    if (ambientReady && carrierReady) return
    const kick = () => beginFlightAudio(prefs)
    window.addEventListener('pointerdown', kick, { once: true })
    window.addEventListener('keydown', kick, { once: true })
    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [activeId, prefs])

  // --- Tarjeta en la pantalla de bloqueo ---------------------------------
  const now = useNow(!!active, 10_000)
  const showCard = !!active && wantsLockCard(prefs)
  const subject = active?.subjectId ? subjects.get(active.subjectId) : undefined

  useEffect(() => {
    if (!showCard) return
    const toggle = (wanted: 'play' | 'pause') => {
      const session = live.current.active
      if (!session) return
      // Si la tarjeta se quedó desfasada (enseña «pausa» con el vuelo ya
      // parado), el botón hace lo único que tiene sentido: reanudar.
      if (session.pausedAt) dispatch({ type: 'session/resume', id: session.id })
      else if (wanted === 'pause') dispatch({ type: 'session/pause', id: session.id })
    }
    setFlightActions(toggle)
    return onCarrierPlaying(() => setFlightActions(toggle))
  }, [showCard, dispatch])

  useEffect(() => {
    if (!active) return
    if (!showCard) {
      clearFlightCard()
      return
    }
    showFlightCard(cardFor(active, { from, to, subject, airports, now: Date.now() }))
    // `now` entra para refrescar los minutos y corregir la barra cada 10 s.
  }, [active, showCard, from, to, subject, airports, now])

  // --- Avisos ------------------------------------------------------------
  // En la web, programados en el servidor (Web Push); dentro de la app
  // nativa, como notificaciones locales, junto con la Live Activity.
  const native = isNativeApp()
  useFlightAlerts(native ? undefined : active, { city: to?.city, enabled: prefs.alerts && !native })
  useNativeFlight(active, {
    city: to?.city,
    subject: subject?.name,
    alerts: prefs.alerts,
  })

  return null
}

function cardFor(
  session: FocusSession,
  ctx: { from?: Airport; to?: Airport; subject?: Subject; airports: Airports | null; now: number },
) {
  const { from, to, subject, now } = ctx
  const title = `${session.from} → ${session.to}${to ? ` · ${to.city}` : ''}`
  const what = subject?.name ?? 'Estudio libre'
  const artwork = from && to ? flightArtwork(from, to) : null
  const planned = session.plannedMinutes * 60

  const layoverEnd = layoverEndMs(session)
  if (layoverEnd !== null) {
    // En escala, la barra cuenta el descanso.
    const started = Date.parse(session.layoverAt!)
    const total = Math.max(1, (layoverEnd - started) / 1000)
    const left = Math.max(0, Math.ceil((layoverEnd - now) / 60_000))
    const here =
      from && to && ctx.airports
        ? nearestAirport(interpolate(from, to, elapsedMs(session, now) / (planned * 1000)), ctx.airports.all, [
            from.iata,
            to.iata,
          ])?.city
        : undefined
    return {
      title,
      subtitle: `Escala${here ? ` en ${here}` : ''} · sigue en ${left} min`,
      artwork,
      duration: total,
      position: Math.min(total, (now - started) / 1000),
      moving: true,
      paused: false,
    }
  }

  const paused = !!session.pausedAt
  const left = Math.ceil(remainingMs(session, now) / 60_000)
  return {
    title,
    subtitle: paused ? `En pausa · ${what}` : `${what} · quedan ${formatFlightTime(left)}`,
    artwork,
    duration: planned,
    position: elapsedMs(session, now) / 1000,
    moving: !paused,
    paused,
  }
}
