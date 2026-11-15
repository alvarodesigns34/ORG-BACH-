import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/features/study/study.css'

import {
  HOME_IATA,
  activeSession,
  currentAirport,
  destinationsFor,
  distanceKm,
  inLayover,
  interpolate,
  kmFor,
  layoverDue,
  layoverRemainingMs,
  minutesFor,
  nearestAirport,
  progress as flightProgress,
  remainingMs as flightRemaining,
  type Airport,
  type Destination,
} from '@/domain/flights'
import { newId } from '@/domain/id'
import type { FocusSession } from '@/domain/types'
import { useDispatch, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap, useSubjects } from '@/state/selectors'
import { useRoute } from '@/router'
import { haptic } from '@/ui/motion'
import { useToast } from '@/ui/Toast'
import { AIRPORTS, AIRPORT_BY_IATA } from '@/features/study/airports'
import { FlightMap, type Padding } from '@/features/study/flightMap'
import { mapEdgeColor } from '@/features/study/mapStyle'
import { BookingPanel, HomePanel, PANEL_WIDTH, SidePanel, type HomeTab } from '@/features/study/Panels'
import { SeatPicker, type SeatChoice } from '@/features/study/SeatPicker'
import { BoardingPass, Takeoff } from '@/features/study/BoardingPass'
import { FlightHud, LandedCard, LayoverCard, MapToolbar } from '@/features/study/FlightHud'
import { useNow, useResolvedTheme, useWakeLock } from '@/features/study/hooks'
import { useStudyPrefs } from '@/features/study/prefs'
import {
  chime,
  duck,
  playSound,
  playingSound,
  setVolume,
  stopSound,
  unlockAudio,
  type SoundId,
} from '@/features/study/soundscape'

type Stage = 'inicio' | 'reserva' | 'asiento' | 'tarjeta' | 'despegue' | 'vuelo' | 'aterrizado'

/** Hueco que deja la hoja lateral a la izquierda del mapa. */
function panelPadding(): Padding {
  const wide = window.innerWidth >= 720
  return { top: 80, right: 90, bottom: 80, left: wide ? PANEL_WIDTH + 70 : 32 }
}

const HUD_PADDING: Padding = { top: 110, right: 110, bottom: 200, left: 110 }
const CENTER_PADDING: Padding = { top: 140, right: 140, bottom: 140, left: 140 }

type Route2 = { from: Airport; to: Airport }

/**
 * Modo estudio: cada sesión es un vuelo de verdad entre dos ciudades.
 *
 * Inicio (resumen, diario, pasaporte) → reserva (cuánto y a dónde) → asiento
 * (qué estudias) → tarjeta de embarque → despegue → vuelo (con escala si la
 * pediste) → aterrizaje. El primer vuelo sale de Madrid; cada uno de los
 * siguientes, de donde aterrizó el anterior.
 */
export default function StudyView() {
  const { data } = useStore()
  const dispatch = useDispatch()
  const today = useToday()
  const toast = useToast()
  const { navigate } = useRoute()
  const subjects = useSubjects()
  const subjectMap = useSubjectMap()
  const theme = useResolvedTheme()
  const [prefs, setPrefs] = useStudyPrefs()

  const active = activeSession(data.sessions)
  const origin =
    AIRPORT_BY_IATA.get(currentAirport(data.sessions)) ?? AIRPORT_BY_IATA.get(HOME_IATA)!

  const [stage, setStage] = useState<Stage>(active ? 'vuelo' : 'inicio')
  const [tab, setTab] = useState<HomeTab>('resumen')
  const [minutes, setMinutes] = useState(prefs.minutes)
  const [destIata, setDestIata] = useState<string | null>(null)
  const [seat, setSeat] = useState<SeatChoice | null>(null)
  const [passId, setPassId] = useState(() => newId('pase'))
  const [landedId, setLandedId] = useState<string | null>(null)
  const [following, setFollowing] = useState(true)

  // --- Destinos ---
  const candidates = useMemo(
    () => (stage === 'reserva' ? destinationsFor(origin, AIRPORTS, minutes) : []),
    [stage, origin, minutes],
  )
  const selected: Destination | null = useMemo(() => {
    if (destIata) {
      const airport = AIRPORT_BY_IATA.get(destIata)
      if (airport) {
        const km = distanceKm(origin, airport)
        return { airport, km, minutes: minutesFor(km) }
      }
    }
    return candidates[0] ?? null
  }, [destIata, candidates, origin])

  // --- Mapa ---
  const inCabin = stage === 'vuelo' || stage === 'despegue' || stage === 'aterrizado'
  const look = useMemo(
    () => ({ kind: prefs.map, tone: inCabin ? ('dark' as const) : theme, labels: prefs.labels }),
    [prefs.map, prefs.labels, inCabin, theme],
  )
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<FlightMap | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const map = new FlightMap(container.current, look, origin)
    map.onUserMove = () => setFollowing(false)
    mapRef.current = map
    setMapReady(true)
    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      map.destroy()
      mapRef.current = null
      stopSound()
    }
    // El mapa se crea una vez; estilo y contenido cambian después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mapRef.current?.setLook(look)
  }, [look])

  // La barra de estado del iPad toma el color del mapa (no el gris claro de
  // la app) mientras dure el modo estudio; al salir se deja como estaba.
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    const before = metas.map((m) => m.getAttribute('content'))
    const color = mapEdgeColor(look)
    for (const m of metas) m.setAttribute('content', color)
    const html = document.documentElement
    const bg = html.style.backgroundColor
    html.style.backgroundColor = color
    return () => {
      metas.forEach((m, i) => before[i] !== null && m.setAttribute('content', before[i]!))
      html.style.backgroundColor = bg
    }
  }, [look])

  // --- Sesión en el aire (también si despegó en otro dispositivo) ---
  const sessionShown =
    active ?? (landedId ? data.sessions.find((s) => s.id === landedId) : undefined)
  useEffect(() => {
    if (active && stage !== 'vuelo' && stage !== 'despegue') setStage('vuelo')
    if (!active && stage === 'vuelo' && !landedId) setStage('inicio')
  }, [active, stage, landedId])

  const flightFrom = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.from) : undefined
  const flightTo = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.to) : undefined
  const layoverCity = useMemo(() => {
    if (!flightFrom || !flightTo || !sessionShown?.layoverMinutes) return undefined
    return nearestAirport(interpolate(flightFrom, flightTo, 0.5), AIRPORTS, [
      flightFrom.iata,
      flightTo.iata,
    ])?.city
  }, [flightFrom, flightTo, sessionShown?.layoverMinutes])

  const now = useNow(stage === 'vuelo', 1000)
  const prog = active ? flightProgress(active, now) : stage === 'aterrizado' ? 1 : 0
  const remaining = active ? flightRemaining(active, now) : 0
  const onLayover = !!active && inLayover(active)
  const layoverLeft = active ? layoverRemainingMs(active, now) : 0

  useWakeLock(prefs.keepAwake && stage === 'vuelo' && !!active)

  // --- Sonido ---
  const startAmbient = useCallback(
    (id: SoundId | 'ninguno') => {
      unlockAudio()
      setVolume(prefs.volume)
      if (id === 'ninguno') stopSound()
      else playSound(id)
    },
    [prefs.volume],
  )

  // Al volver a un vuelo ya en marcha no hay gesto con el que arrancar el
  // audio (Safari lo exige): el primer toque en la pantalla lo enciende.
  useEffect(() => {
    if (stage !== 'vuelo' || prefs.sound === 'ninguno' || playingSound()) return
    const kick = () => startAmbient(prefs.sound)
    window.addEventListener('pointerdown', kick, { once: true })
    return () => window.removeEventListener('pointerdown', kick)
  }, [stage, prefs.sound, startAmbient])

  // --- Escala: empieza a mitad de vuelo y termina sola ---
  useEffect(() => {
    if (!active) return
    if (layoverDue(active, now)) {
      dispatch({ type: 'session/layover', id: active.id })
      duck(true)
      chime()
      haptic('success')
    } else if (inLayover(active) && layoverRemainingMs(active, now) <= 0) {
      dispatch({ type: 'session/resume', id: active.id })
      duck(false)
      chime()
    }
  }, [active, now, dispatch])

  // --- Aterrizaje: al acabarse el tiempo, una vez ---
  useEffect(() => {
    if (!active || active.pausedAt || remaining > 0) return
    setLandedId(active.id)
    dispatch({
      type: 'session/land',
      id: active.id,
      route: `${flightFrom?.city ?? active.from} → ${flightTo?.city ?? active.to}`,
    })
    setStage('aterrizado')
    stopSound()
    chime()
    haptic('success')
  }, [active, remaining, dispatch, flightFrom, flightTo])

  // --- Cámara y contenido por etapa ---
  const fitTimer = useRef<number | null>(null)
  const tookOff = useRef(false)

  const history = useMemo(() => {
    const out: Route2[] = []
    for (const s of data.sessions) {
      if (s.status !== 'aterrizado') continue
      const from = AIRPORT_BY_IATA.get(s.from)
      const to = AIRPORT_BY_IATA.get(s.to)
      if (from && to) out.push({ from, to })
    }
    return out
  }, [data.sessions])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (stage === 'inicio') {
      map.setRange(null, 0)
      map.clearPins()
      map.setPlane(null, null, 0)
      map.setRoute(null, null)
      if (tab === 'resumen') {
        map.setHistory([])
        map.showPlace(origin, 5.2, panelPadding())
      } else {
        map.setHistory(history)
        const points = history.flatMap((r) => [r.from, r.to])
        if (points.length) map.fitPoints(points, panelPadding())
        else map.showPlace(origin, 4.4, panelPadding())
      }
    }

    if (stage === 'reserva') {
      map.setHistory([])
      map.setPlane(null, null, 0)
      map.setRange(origin, kmFor(minutes))
      map.setPins(candidates, selected?.airport.iata ?? null, (iata) => {
        const airport = AIRPORT_BY_IATA.get(iata)
        if (!airport) return
        haptic()
        setDestIata(iata)
        setMinutes(minutesFor(distanceKm(origin, airport)))
      })
      map.setRoute(origin, selected?.airport ?? null, 0, false)
      if (fitTimer.current) window.clearTimeout(fitTimer.current)
      fitTimer.current = window.setTimeout(() => {
        map.fitRange(origin, Math.max(kmFor(minutes), selected?.km ?? 0), panelPadding())
      }, 140)
    }

    if ((stage === 'asiento' || stage === 'tarjeta') && selected) {
      map.clearPins()
      map.setRange(null, 0)
      map.setRoute(origin, selected.airport, 0)
      map.fitRoute(origin, selected.airport, CENTER_PADDING)
    }
  }, [stage, tab, mapReady, origin, minutes, candidates, selected, history])

  // Vuelo: el avión avanza cada segundo; la cámara le sigue si se lo pides.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !flightFrom || !flightTo) return
    if (stage !== 'vuelo' && stage !== 'aterrizado') return
    map.clearPins()
    map.setRange(null, 0)
    map.setHistory([])
    map.setRoute(flightFrom, flightTo, prog)
    const here = map.setPlane(flightFrom, flightTo, prog)
    if (!here) return
    const zoom = Math.min(8, Math.max(4.2, map.routeZoom(flightFrom, flightTo, HUD_PADDING) + 1.4))
    if (stage === 'aterrizado') {
      if (!tookOff.current) return
      tookOff.current = false
      map.showPlace(flightTo, 7, { ...HUD_PADDING, bottom: 420 })
      return
    }
    if (!tookOff.current) {
      tookOff.current = true
      if (prog < 0.02) map.takeoff(here, zoom)
      else map.showPlace(here, zoom, HUD_PADDING)
      return
    }
    if (following) map.follow(here)
  }, [stage, mapReady, flightFrom, flightTo, prog, following])

  // --- Acciones ---

  const leave = useCallback(() => navigate('inicio'), [navigate])

  const startBooking = (preset?: number) => {
    setDestIata(null)
    setSeat(null)
    setPassId(newId('pase'))
    if (preset) setMinutes(preset)
    setStage('reserva')
  }

  const random = () => {
    const pool = destinationsFor(origin, AIRPORTS, minutes, 400).filter(
      (d) => Math.abs(d.minutes - minutes) <= 25,
    )
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (!pick) return
    haptic()
    setDestIata(pick.airport.iata)
    setMinutes(pick.minutes)
  }

  const layover = selected && selected.minutes >= 40 ? prefs.layover : 0

  const takeoff = () => {
    if (!selected || !seat) return
    unlockAudio()
    setVolume(prefs.volume)
    chime()
    haptic('success')
    setPrefs({ minutes: selected.minutes })
    if (prefs.sound !== 'ninguno') {
      const id = prefs.sound
      window.setTimeout(() => playSound(id), 1300)
    }
    tookOff.current = false
    setFollowing(true)
    setLandedId(null)
    dispatch({
      type: 'session/start',
      session: {
        from: origin.iata,
        to: selected.airport.iata,
        distanceKm: Math.round(selected.km),
        plannedMinutes: selected.minutes,
        seat: seat.seat,
        subjectId: seat.subjectId,
        taskId: seat.taskId,
        layoverMinutes: layover || undefined,
      },
    })
    setStage('vuelo')
  }

  const abandon = () => {
    if (!active) return
    const end = active.pausedAt ? Date.parse(active.pausedAt) : Date.now()
    const done = Math.floor((end - Date.parse(active.startedAt) - active.pausedMs) / 60_000)
    dispatch({ type: 'session/cancel', id: active.id })
    stopSound()
    tookOff.current = false
    setStage('inicio')
    toast({ text: done > 0 ? `Vuelo abandonado · ${done} min estudiados` : 'Vuelo abandonado' })
  }

  const showFlight = (s: FocusSession) => {
    const from = AIRPORT_BY_IATA.get(s.from)
    const to = AIRPORT_BY_IATA.get(s.to)
    if (!from || !to || !mapRef.current) return
    haptic()
    mapRef.current.setRoute(from, to, 1)
    mapRef.current.fitRoute(from, to, panelPadding(), 900)
  }

  const landedTask = sessionShown?.taskId
    ? data.tasks.find((t) => t.id === sessionShown.taskId)
    : undefined
  const activeTask = active?.taskId ? data.tasks.find((t) => t.id === active.taskId) : undefined
  const passTask = seat?.taskId ? data.tasks.find((t) => t.id === seat.taskId) : undefined
  const isNewCity =
    !!sessionShown &&
    !data.sessions.some(
      (s) => s.id !== sessionShown.id && s.status === 'aterrizado' && s.to === sessionShown.to,
    )

  const showToolbar =
    stage === 'inicio' || stage === 'reserva' || stage === 'vuelo' || stage === 'aterrizado'

  return (
    <div className="study-root fixed inset-0 z-[35] bg-canvas overflow-hidden text-ink">
      {/* El envoltorio fija el tamaño: MapLibre pone `position: relative` a
          su contenedor y, sin él, el mapa se quedaba con altura cero. */}
      <div className={`study-map absolute inset-0 ${active?.pausedAt ? 'is-paused' : ''}`}>
        <div ref={container} className="size-full" aria-label="Mapa" role="region" />
      </div>

      <AnimatePresence mode="wait">
        {stage === 'inicio' && (
          <SidePanel key="inicio">
            <HomePanel
              origin={origin}
              sessions={data.sessions}
              subjects={subjectMap}
              today={today}
              tab={tab}
              onTab={setTab}
              onExit={leave}
              onStart={startBooking}
              onShowFlight={showFlight}
            />
          </SidePanel>
        )}
        {stage === 'reserva' && (
          <SidePanel key="reserva">
            <BookingPanel
              origin={origin}
              minutes={minutes}
              onMinutes={(m) => {
                setMinutes(m)
                setDestIata(null)
              }}
              candidates={candidates}
              selected={selected}
              onSelect={(iata, m) => {
                haptic()
                setDestIata(iata)
                setMinutes(m)
              }}
              onRandom={random}
              layover={prefs.layover}
              onLayover={(m) => setPrefs({ layover: m })}
              onBack={() => setStage('inicio')}
              onBook={() => {
                if (selected) {
                  setDestIata(selected.airport.iata)
                  setMinutes(selected.minutes)
                }
                setStage('asiento')
              }}
            />
          </SidePanel>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stage === 'asiento' && selected && (
          <SeatPicker
            key="asiento"
            flightKey={`${origin.iata}${selected.airport.iata}${passId}`}
            from={origin}
            to={selected.airport}
            minutes={selected.minutes}
            subjects={subjects}
            tasks={data.tasks}
            onBack={() => setStage('reserva')}
            onDone={(choice) => {
              setSeat(choice)
              setStage('tarjeta')
            }}
          />
        )}
        {stage === 'tarjeta' && selected && seat && (
          <BoardingPass
            key="tarjeta"
            pass={{
              id: passId,
              from: origin,
              to: selected.airport,
              km: selected.km,
              minutes: selected.minutes,
              seat: seat.seat,
              cabin: seat.cabin,
              layover,
              subject: seat.subjectId ? subjectMap.get(seat.subjectId) : undefined,
              task: passTask,
            }}
            onBack={() => setStage('asiento')}
            onBoard={() => setStage('despegue')}
          />
        )}
        {stage === 'despegue' && selected && (
          <Takeoff
            key="despegue"
            from={origin}
            to={selected.airport}
            onGo={takeoff}
            onCancel={() => setStage('tarjeta')}
          />
        )}
      </AnimatePresence>

      {/* En cabina el mapa es nocturno: los controles, también. */}
      <div data-theme={inCabin ? 'dark' : undefined} className="contents text-ink">
        {showToolbar && (
          <MapToolbar
            map={prefs.map}
            labels={prefs.labels}
            sound={prefs.sound}
            volume={prefs.volume}
            keepAwake={prefs.keepAwake}
            onMap={(m) => setPrefs({ map: m })}
            onLabels={(on) => setPrefs({ labels: on })}
            onSound={(id) => {
              setPrefs({ sound: id })
              if (stage === 'vuelo') startAmbient(id)
            }}
            onVolume={(v) => {
              setPrefs({ volume: v })
              setVolume(v)
            }}
            onKeepAwake={(on) => setPrefs({ keepAwake: on })}
            flight={
              stage === 'vuelo' && flightFrom && flightTo
                ? {
                    following,
                    onFollow: () => {
                      setFollowing(true)
                      const map = mapRef.current
                      const here = map?.setPlane(flightFrom, flightTo, prog)
                      if (map && here) {
                        const zoom = Math.min(
                          8,
                          Math.max(4.2, map.routeZoom(flightFrom, flightTo, HUD_PADDING) + 1.4),
                        )
                        map.showPlace(here, zoom, HUD_PADDING)
                      }
                    },
                    onOverview: () => {
                      setFollowing(false)
                      mapRef.current?.fitRoute(flightFrom, flightTo, HUD_PADDING, 900)
                    },
                  }
                : undefined
            }
          />
        )}

        {stage === 'vuelo' && active && flightFrom && flightTo && (
          <FlightHud
            session={active}
            from={flightFrom}
            to={flightTo}
            subject={active.subjectId ? subjectMap.get(active.subjectId) : undefined}
            task={activeTask}
            layoverCity={layoverCity}
            remainingMs={remaining}
            remainingKm={active.distanceKm * (1 - prog)}
            progress={prog}
            onExit={leave}
            onPause={() => {
              haptic()
              if (onLayover) return
              dispatch({ type: active.pausedAt ? 'session/resume' : 'session/pause', id: active.id })
              duck(!active.pausedAt)
            }}
            onAbandon={abandon}
          />
        )}

        <AnimatePresence>
          {stage === 'vuelo' && active && onLayover && (
            <LayoverCard
              key="escala"
              city={layoverCity}
              remainingMs={layoverLeft}
              onResume={() => {
                haptic()
                dispatch({ type: 'session/resume', id: active.id })
                duck(false)
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {stage === 'aterrizado' && sessionShown && flightTo && (
            <LandedCard
              key="aterrizado"
              session={sessionShown}
              to={flightTo}
              subject={sessionShown.subjectId ? subjectMap.get(sessionShown.subjectId) : undefined}
              task={landedTask}
              isNewCity={isNewCity}
              onCompleteTask={() => {
                if (landedTask && landedTask.status !== 'completada') {
                  haptic('success')
                  dispatch({ type: 'task/toggle', id: landedTask.id })
                }
              }}
              onAgain={() => {
                setLandedId(null)
                startBooking()
              }}
              onDone={() => {
                setLandedId(null)
                setStage('inicio')
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Velo de la pausa: el mapa se apaga un poco. */}
      <AnimatePresence>
        {stage === 'vuelo' && active?.pausedAt && (
          <motion.div
            key="pausa"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[5] pointer-events-none bg-black/12"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
