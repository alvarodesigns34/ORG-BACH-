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
  kmFor,
  minutesFor,
  progress as flightProgress,
  remainingMs as flightRemaining,
  type Destination,
} from '@/domain/flights'
import { newId } from '@/domain/id'
import { useDispatch, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap, useSubjects } from '@/state/selectors'
import { useRoute } from '@/router'
import { haptic } from '@/ui/motion'
import { useToast } from '@/ui/Toast'
import { AIRPORTS, AIRPORT_BY_IATA } from '@/features/study/airports'
import { FlightMap, type Padding } from '@/features/study/flightMap'
import { BookingPanel, HomePanel, PANEL_WIDTH, SidePanel } from '@/features/study/Panels'
import { SeatPicker, type SeatChoice } from '@/features/study/SeatPicker'
import { BoardingPass, Takeoff } from '@/features/study/BoardingPass'
import { FlightHud, LandedCard } from '@/features/study/FlightHud'
import { useNow, useResolvedTheme, useWakeLock } from '@/features/study/hooks'
import { chime, setCabinVolume, startCabin, stopCabin, unlockAudio } from '@/features/study/cabinSound'

type Stage = 'inicio' | 'reserva' | 'asiento' | 'tarjeta' | 'despegue' | 'vuelo' | 'aterrizado'

const MINUTES_KEY = 'org-bach:estudio-minutos'
const SOUND_KEY = 'org-bach:estudio-sonido'

function readNumber(key: string, fallback: number): number {
  try {
    const n = Number(window.localStorage.getItem(key))
    return Number.isFinite(n) && n > 0 ? n : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento: la preferencia dura lo que la sesión.
  }
}

/** Hueco que deja la hoja lateral a la izquierda del mapa. */
function panelPadding(): Padding {
  const wide = window.innerWidth >= 720
  return {
    top: 72,
    right: 64,
    bottom: 72,
    left: wide ? PANEL_WIDTH + 64 : 32,
  }
}

const HUD_PADDING: Padding = { top: 96, right: 96, bottom: 190, left: 96 }

/**
 * Modo estudio: cada sesión es un vuelo de verdad entre dos ciudades.
 *
 * Inicio → reserva (cuánto tiempo y a dónde) → asiento (qué estudias) →
 * tarjeta de embarque → despegue → vuelo → aterrizaje. El primer vuelo sale
 * de Madrid; cada uno de los siguientes, de donde aterrizó el anterior.
 *
 * Ocupa toda la pantalla: es un modo, no una lista más.
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

  const active = activeSession(data.sessions)
  const origin =
    AIRPORT_BY_IATA.get(currentAirport(data.sessions)) ?? AIRPORT_BY_IATA.get(HOME_IATA)!

  const [stage, setStage] = useState<Stage>(active ? 'vuelo' : 'inicio')
  const [minutes, setMinutes] = useState(() => readNumber(MINUTES_KEY, 45))
  const [destIata, setDestIata] = useState<string | null>(null)
  const [seat, setSeat] = useState<SeatChoice | null>(null)
  const [passId] = useState(() => newId('pase'))
  const [landedId, setLandedId] = useState<string | null>(null)
  const [following, setFollowing] = useState(true)
  const [soundOn, setSoundOn] = useState(false)

  // --- Destinos posibles ---
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
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<FlightMap | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const map = new FlightMap(container.current, theme, origin)
    map.onUserMove = () => setFollowing(false)
    mapRef.current = map
    setMapReady(true)
    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      map.destroy()
      mapRef.current = null
      stopCabin()
    }
    // El mapa se crea una vez; el estilo y el contenido se cambian después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // En vuelo, mapa nocturno: menos ruido visual, la ruta brilla.
  const inCabin = stage === 'vuelo' || stage === 'despegue' || stage === 'aterrizado'
  useEffect(() => {
    mapRef.current?.setLook(inCabin ? 'dark' : theme)
  }, [inCabin, theme])

  // --- Sesión en el aire, también si llega de otro dispositivo ---
  const sessionShown = active ?? (landedId ? data.sessions.find((s) => s.id === landedId) : undefined)
  useEffect(() => {
    if (active && stage !== 'vuelo' && stage !== 'despegue') setStage('vuelo')
    if (!active && stage === 'vuelo' && !landedId) setStage('inicio')
  }, [active, stage, landedId])

  const flightFrom = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.from) : undefined
  const flightTo = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.to) : undefined

  const now = useNow(stage === 'vuelo', 1000)
  const prog = active ? flightProgress(active, now) : stage === 'aterrizado' ? 1 : 0
  const remaining = active ? flightRemaining(active, now) : 0

  useWakeLock(stage === 'vuelo' && !!active && !active.pausedAt)

  // Aterrizaje: al acabarse el tiempo, una sola vez.
  useEffect(() => {
    if (!active || active.pausedAt || remaining > 0) return
    setLandedId(active.id)
    dispatch({
      type: 'session/land',
      id: active.id,
      route: `${flightFrom?.city ?? active.from} → ${flightTo?.city ?? active.to}`,
    })
    setStage('aterrizado')
    stopCabin()
    setSoundOn(false)
    chime()
    haptic('success')
  }, [active, remaining, dispatch, flightFrom, flightTo])

  // --- Cámara y contenido por etapa ---
  const fitTimer = useRef<number | null>(null)
  const tookOff = useRef(false)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (stage === 'inicio') {
      map.setRange(null, 0)
      map.clearPins()
      map.setRoute(null, null)
      map.setPlane(null, null, 0)
      map.setOrigin(origin)
      const pad = panelPadding()
      map.showPlace(origin, 5.2, pad)
    }

    if (stage === 'reserva') {
      map.setPlane(null, null, 0)
      map.setOrigin(origin)
      map.setRange(origin, kmFor(minutes))
      map.setPins(candidates, selected?.airport.iata ?? null, (iata) => {
        const airport = AIRPORT_BY_IATA.get(iata)
        if (!airport) return
        haptic()
        setDestIata(iata)
        setMinutes(minutesFor(distanceKm(origin, airport)))
      })
      map.setRoute(origin, selected?.airport ?? null, 0)
      if (fitTimer.current) window.clearTimeout(fitTimer.current)
      fitTimer.current = window.setTimeout(() => {
        map.fitRange(origin, Math.max(kmFor(minutes), selected?.km ?? 0), panelPadding())
      }, 140)
    }

    if ((stage === 'asiento' || stage === 'tarjeta') && selected) {
      map.clearPins()
      map.setRange(null, 0)
      map.setRoute(origin, selected.airport, 0)
      map.fitRoute(origin, selected.airport, { top: 120, right: 120, bottom: 120, left: 120 })
    }
  }, [stage, mapReady, origin, minutes, candidates, selected])

  // Vuelo: el avión avanza cada segundo; la cámara le sigue si se lo pides.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !flightFrom || !flightTo) return
    if (stage !== 'vuelo' && stage !== 'aterrizado') return
    map.clearPins()
    map.setRange(null, 0)
    map.setOrigin(flightFrom)
    map.setRoute(flightFrom, flightTo, prog)
    const here = map.setPlane(flightFrom, flightTo, prog)
    if (!here) return
    const zoom = Math.min(8, Math.max(4.2, map.routeZoom(flightFrom, flightTo, HUD_PADDING) + 1.4))
    if (stage === 'aterrizado') {
      if (!tookOff.current) return
      tookOff.current = false
      map.showPlace(flightTo, 7, HUD_PADDING)
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

  const startBooking = () => {
    setDestIata(null)
    setSeat(null)
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

  const takeoff = () => {
    if (!selected || !seat) return
    unlockAudio()
    chime()
    haptic('success')
    write(MINUTES_KEY, String(selected.minutes))
    let wantsSound = true
    try {
      wantsSound = window.localStorage.getItem(SOUND_KEY) !== '0'
    } catch {
      // Por defecto, con sonido.
    }
    if (wantsSound) {
      window.setTimeout(() => startCabin(0.5), 1400)
      setSoundOn(true)
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
      },
    })
    setStage('vuelo')
  }

  const toggleSound = () => {
    unlockAudio()
    if (soundOn) {
      stopCabin()
      setSoundOn(false)
      write(SOUND_KEY, '0')
    } else {
      startCabin(0.5)
      setCabinVolume(0.5)
      setSoundOn(true)
      write(SOUND_KEY, '1')
    }
  }

  const abandon = () => {
    if (!active) return
    const minutesDone = Math.floor((Date.now() - Date.parse(active.startedAt) - active.pausedMs) / 60_000)
    dispatch({ type: 'session/cancel', id: active.id })
    stopCabin()
    setSoundOn(false)
    tookOff.current = false
    setStage('inicio')
    toast({
      text:
        minutesDone > 0
          ? `Vuelo abandonado · ${minutesDone} min estudiados`
          : 'Vuelo abandonado',
    })
  }

  const landedTask =
    sessionShown?.taskId ? data.tasks.find((t) => t.id === sessionShown.taskId) : undefined

  const passTask = seat?.taskId ? data.tasks.find((t) => t.id === seat.taskId) : undefined

  return (
    <div className="study-root fixed inset-0 z-[35] bg-canvas overflow-hidden">
      {/* El envoltorio fija el tamaño: MapLibre pone `position: relative` a su
          contenedor y, sin él, el mapa se quedaba con altura cero. */}
      <div className={`study-map absolute inset-0 ${active?.pausedAt ? 'is-paused' : ''}`}>
        <div ref={container} className="size-full" aria-label="Mapa del vuelo" role="region" />
      </div>

      <AnimatePresence mode="wait">
        {stage === 'inicio' && (
          <SidePanel key="inicio">
            <HomePanel
              origin={origin}
              sessions={data.sessions}
              subjects={subjectMap}
              today={today}
              onExit={leave}
              onStart={startBooking}
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
              onBack={() => setStage('inicio')}
              onBook={() => {
                // El destino propuesto se fija: fuera de la reserva ya no hay
                // lista de la que sacarlo.
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
        {stage === 'asiento' && (
          <SeatPicker
            key="asiento"
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
              subject: seat.subjectId ? subjectMap.get(seat.subjectId) : undefined,
              task: passTask,
            }}
            onBack={() => setStage('asiento')}
            onBoard={() => setStage('despegue')}
          />
        )}
        {stage === 'despegue' && (
          <Takeoff key="despegue" onGo={takeoff} onCancel={() => setStage('tarjeta')} />
        )}
      </AnimatePresence>

      {/* En cabina el mapa es nocturno: los controles, también. */}
      <div data-theme="dark" className="contents text-ink">
      {stage === 'vuelo' && active && flightFrom && flightTo && (
        <FlightHud
          session={active}
          from={flightFrom}
          to={flightTo}
          subject={active.subjectId ? subjectMap.get(active.subjectId) : undefined}
          remainingMs={remaining}
          remainingKm={active.distanceKm * (1 - prog)}
          progress={prog}
          following={following}
          soundOn={soundOn}
          onExit={leave}
          onFollow={() => {
            setFollowing(true)
            const map = mapRef.current
            const here = map?.setPlane(flightFrom, flightTo, prog)
            if (map && here) map.showPlace(here, Math.min(8, Math.max(4.2, map.routeZoom(flightFrom, flightTo, HUD_PADDING) + 1.4)), HUD_PADDING)
          }}
          onOverview={() => {
            setFollowing(false)
            mapRef.current?.fitRoute(flightFrom, flightTo, HUD_PADDING, 900)
          }}
          onSound={toggleSound}
          onPause={() => {
            haptic()
            dispatch({ type: active.pausedAt ? 'session/resume' : 'session/pause', id: active.id })
            if (soundOn) setCabinVolume(active.pausedAt ? 0.5 : 0)
          }}
          onAbandon={abandon}
        />
      )}

      <AnimatePresence>
        {stage === 'aterrizado' && sessionShown && flightTo && (
          <LandedCard
            key="aterrizado"
            session={sessionShown}
            to={flightTo}
            subject={sessionShown.subjectId ? subjectMap.get(sessionShown.subjectId) : undefined}
            task={landedTask}
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

      {/* El velo de la pausa: el mapa se apaga un poco. */}
      <AnimatePresence>
        {stage === 'vuelo' && active?.pausedAt && (
          <motion.div
            key="pausa"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[5] pointer-events-none bg-black/25"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
