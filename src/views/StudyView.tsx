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
  layoverPoints,
  layoverRemainingMs,
  layoversTaken,
  minutesFor,
  nearestAirport,
  progress as flightProgress,
  remainingMs as flightRemaining,
  MAX_MINUTES,
  MIN_MINUTES,
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
import { beginFlightAudio } from '@/features/study/flightAudio'
import { useNow, useResolvedTheme, useWakeLock } from '@/features/study/hooks'
import { layoverPlan, useStudyPrefs } from '@/features/study/prefs'
import {
  SOUNDS,
  chime,
  playSound,
  preloadSound,
  setVolume,
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
  const { route, navigate } = useRoute()
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
  /** La cámara ya hizo el despegue de este vuelo. */
  const tookOff = useRef(false)

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
      // El ambiente no se para aquí: el vuelo sigue (y suena) fuera de esta
      // vista. Lo apaga el controlador del vuelo al aterrizar o abandonar.
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
  // Las escalas y el aterrizaje los aplica el controlador del vuelo, que vive
  // fuera de esta vista; aquí solo se sigue lo que le pasa a la sesión.
  const sessionShown =
    active ?? (landedId ? data.sessions.find((s) => s.id === landedId) : undefined)
  const lastActive = useRef<string | null>(active?.id ?? null)
  useEffect(() => {
    if (active) {
      lastActive.current = active.id
      if (stage !== 'vuelo' && stage !== 'despegue') setStage('vuelo')
      return
    }
    const id = lastActive.current
    lastActive.current = null
    const ended = id ? data.sessions.find((s) => s.id === id) : undefined
    if (ended?.status === 'aterrizado') {
      // Acaba de aterrizar con la vista delante: la bienvenida.
      setLandedId(ended.id)
      setStage('aterrizado')
    } else if (stage === 'vuelo' && !landedId) {
      tookOff.current = false
      setStage('inicio')
    }
  }, [active, stage, landedId, data.sessions])

  const flightFrom = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.from) : undefined
  const flightTo = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.to) : undefined
  const now = useNow(stage === 'vuelo', 1000)
  const prog = active ? flightProgress(active, now) : stage === 'aterrizado' ? 1 : 0
  const remaining = active ? flightRemaining(active, now) : 0
  const onLayover = !!active && inLayover(active)
  const layoverLeft = active ? layoverRemainingMs(active, now) : 0

  /** Escalas programadas que quedan, como fracción del vuelo (0…1). */
  const layoverMarks = useMemo(
    () =>
      active
        ? layoverPoints(active)
            .slice(layoversTaken(active))
            .map((point) => point / active.plannedMinutes)
        : [],
    [active],
  )
  // La ciudad de la escala: la más cercana a donde está (o estará) el avión.
  const layoverAt = onLayover ? Math.round(prog * 200) / 200 : layoverMarks[0]
  const layoverCity = useMemo(() => {
    if (!flightFrom || !flightTo || layoverAt === undefined) return undefined
    return nearestAirport(interpolate(flightFrom, flightTo, layoverAt), AIRPORTS, [
      flightFrom.iata,
      flightTo.iata,
    ])?.city
  }, [flightFrom, flightTo, layoverAt])

  useWakeLock(prefs.keepAwake && stage === 'vuelo' && !!active)

  // El ambiente elegido se descarga mientras se elige asiento: así suena
  // justo al despegar, sin esperar a la red.
  useEffect(() => {
    if (stage === 'asiento' || stage === 'tarjeta' || stage === 'vuelo') preloadSound(prefs.sound)
  }, [stage, prefs.sound])

  // --- Cámara y contenido por etapa ---
  const fitTimer = useRef<number | null>(null)

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

  const plan = selected ? layoverPlan(prefs, selected.minutes) : {}
  const layoverCount = selected
    ? layoverPoints({ plannedMinutes: selected.minutes, ...plan }).length
    : 0
  const layoverLabel =
    layoverCount === 0
      ? 'Directo'
      : layoverCount === 1
        ? `${plan.layoverMinutes} min`
        : `${layoverCount} × ${plan.layoverMinutes} min`

  const takeoff = () => {
    if (!selected || !seat) return
    // Dentro del toque: Safari no deja arrancar audio de otra forma.
    beginFlightAudio(prefs, { ambient: false })
    chime('megafonia')
    haptic('success')
    setPrefs({ minutes: selected.minutes })
    if (prefs.sound !== 'ninguno') {
      const id = prefs.sound
      // El ambiente entra cuando la megafonía ya ha dicho lo suyo.
      window.setTimeout(() => playSound(id), 1600)
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
        ...plan,
      },
    })
    setStage('vuelo')
  }

  const abandon = () => {
    if (!active) return
    const end = active.pausedAt ? Date.parse(active.pausedAt) : Date.now()
    const done = Math.floor((end - Date.parse(active.startedAt) - active.pausedMs) / 60_000)
    dispatch({ type: 'session/cancel', id: active.id })
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

  // --- Despegue rápido: `#/estudio?despegar=25` -----------------------------
  // Llega del atajo de teclado, de los accesos directos de la app instalada o
  // del asistente («ponme 45 min de Mates con lluvia»). Deja el vuelo listo en
  // la pantalla de cabina: falta un toque, que además es el que Safari exige
  // para poder encender el sonido.
  const [quick, setQuick] = useState(false)
  const quickParam = route.params.get('despegar')
  useEffect(() => {
    if (!quickParam) return
    const wantedSubject = route.params.get('asignatura')
    const wantedTask = route.params.get('tarea')
    const wantedSound = route.params.get('sonido')
    // El parámetro se consume: recargar no debe volver a preparar el vuelo.
    navigate('estudio')
    if (active) return
    const wanted = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(Number(quickParam))))
    if (!Number.isFinite(wanted)) return
    const pick = destinationsFor(origin, AIRPORTS, wanted)[0]
    if (!pick) return
    const subject = subjects.find((s) => s.id === wantedSubject)
    const task = data.tasks.find((t) => t.id === wantedTask && t.status !== 'completada')
    if (wantedSound === 'ninguno' || SOUNDS.some((x) => x.id === wantedSound)) {
      setPrefs({ sound: wantedSound as SoundId | 'ninguno' })
    }
    setDestIata(pick.airport.iata)
    setMinutes(pick.minutes)
    setPassId(newId('pase'))
    setLandedId(null)
    setSeat({
      // Ventanilla en la fila 7: el asiento de quien no quiere elegir.
      seat: '07A',
      cabin: 'Turista',
      subjectId: subject?.id ?? task?.subjectId,
      taskId: task?.id,
    })
    setQuick(true)
    setStage('despegue')
    // Solo reacciona al parámetro: el resto se lee en ese instante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickParam])

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
              layover={{ mode: prefs.layoverMode, minutes: prefs.layover, focus: prefs.focus }}
              onLayover={(patch) => setPrefs(patch)}
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
              layover: layoverLabel,
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
            minutes={selected.minutes}
            onGo={() => {
              setQuick(false)
              takeoff()
            }}
            onCancel={() => {
              // Un despegue rápido no pasó por la tarjeta: se vuelve al inicio.
              setStage(quick ? 'inicio' : 'tarjeta')
              setQuick(false)
            }}
            quick={
              quick && seat
                ? {
                    subjects,
                    subjectId: seat.subjectId,
                    onSubject: (id) => setSeat({ ...seat, subjectId: id, taskId: undefined }),
                  }
                : undefined
            }
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
              // En vuelo, el cambio suena ya (y ajusta la tarjeta de bloqueo).
              if (stage === 'vuelo') beginFlightAudio({ ...prefs, sound: id })
            }}
            onVolume={(v) => {
              setPrefs({ volume: v })
              setVolume(v)
            }}
            onKeepAwake={(on) => setPrefs({ keepAwake: on })}
            lockCard={prefs.lockCard}
            onLockCard={(on) => {
              setPrefs({ lockCard: on })
              if (stage === 'vuelo') beginFlightAudio({ ...prefs, lockCard: on })
            }}
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
            layoverMarks={layoverMarks}
            breakMinutes={prefs.layover}
            remainingMs={remaining}
            remainingKm={active.distanceKm * (1 - prog)}
            progress={prog}
            onExit={leave}
            onPause={() => {
              haptic()
              if (onLayover) return
              dispatch({ type: active.pausedAt ? 'session/resume' : 'session/pause', id: active.id })
            }}
            onBreak={() => {
              haptic()
              dispatch({ type: 'session/layover', id: active.id, minutes: prefs.layover })
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
