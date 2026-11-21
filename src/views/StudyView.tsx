import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { Orbit } from 'lucide-react'
import '@/features/study/study.css'

import {
  HOME_IATA,
  activeSession,
  bearing,
  currentAirport,
  destinationsFor,
  distanceKm,
  focusMinutes,
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
  type Airport,
  type Destination,
} from '@/domain/flights'
import { newId } from '@/domain/id'
import type { FocusSession } from '@/domain/types'
import { setThemeOverride, useDispatch, useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap, useSubjects } from '@/state/selectors'
import { useRoute } from '@/router'
import { typing } from '@/layout/shortcuts'
import { haptic, useMediaQuery } from '@/ui/motion'
import { useToast } from '@/ui/Toast'
import { AIRPORTS, AIRPORT_BY_IATA } from '@/features/study/airports'
import type { Padding } from '@/features/study/flightMap'
import { mapEdgeColor } from '@/features/study/mapStyle'
import { BookingPanel, HomePanel, PANEL_WIDTH, SidePanel, type HomeTab } from '@/features/study/Panels'
import { SeatPicker, type SeatChoice } from '@/features/study/SeatPicker'
import { QuickStart, StudyHome } from '@/features/study/StudyHome'
import { BoardingPass, Takeoff } from '@/features/study/BoardingPass'
import { FlightHud, LandedCard, LayoverCard, MapToolbar } from '@/features/study/FlightHud'
import { beginFlightAudio, previewAudio } from '@/features/study/flightAudio'
import { useNow, useWakeLock } from '@/features/study/hooks'
import { useStudyMap } from '@/features/study/useStudyMap'
import { layoverPlan, useStudyPrefs } from '@/features/study/prefs'
import {
  SOUNDS,
  chime,
  preloadSound,
  setVolume,
  setWaveLevel,
  type SoundId,
} from '@/features/study/soundscape'

type Stage = 'inicio' | 'reserva' | 'asiento' | 'tarjeta' | 'despegue' | 'vuelo' | 'aterrizado'

/** Hueco que deja la hoja lateral a la izquierda del mapa. */
function panelPadding(): Padding {
  const wide = window.innerWidth >= 720
  return wide
    ? { top: 80, right: 90, bottom: 80, left: PANEL_WIDTH + 70 }
    : { top: 24, right: 38, bottom: 28, left: 38 }
}

/** Entrada sin hoja: la ciudad algo a la derecha de los controles. */
function homePadding(): Padding {
  const wide = window.innerWidth >= 720
  return wide
    ? { top: 120, right: 120, bottom: 120, left: 300 }
    : { top: 200, right: 38, bottom: 260, left: 38 }
}

/** Sin tocar nada durante este tiempo en vuelo, la interfaz se aparta. */
const IDLE_MS = 8000

const HUD_PADDING: Padding = { top: 110, right: 110, bottom: 200, left: 110 }
const CENTER_PADDING: Padding = { top: 140, right: 140, bottom: 140, left: 140 }

type Route2 = { from: Airport; to: Airport }

function flightHeading(from: Airport, to: Airport, progress: number) {
  const at = Math.min(0.995, Math.max(0, progress))
  return bearing(interpolate(from, to, at), interpolate(from, to, at + 0.005))
}

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
  const settings = useSettings()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [prefs, setPrefs] = useStudyPrefs()

  const active = activeSession(data.sessions)
  const origin =
    AIRPORT_BY_IATA.get(currentAirport(data.sessions)) ?? AIRPORT_BY_IATA.get(HOME_IATA)!

  const [stage, setStage] = useState<Stage>(active ? 'vuelo' : 'inicio')
  const [tab, setTab] = useState<HomeTab>('resumen')
  /** Hoja de actividad (resumen, diario, pasaporte) abierta sobre la entrada. */
  const [activity, setActivity] = useState(false)
  const [minutes, setMinutes] = useState(prefs.minutes)
  const [destIata, setDestIata] = useState<string | null>(null)
  const [seat, setSeat] = useState<SeatChoice | null>(null)
  const [passId, setPassId] = useState(() => newId('pase'))
  const [landedId, setLandedId] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [quick, setQuick] = useState(false)
  const [examId, setExamId] = useState<string | undefined>()
  const quickParam = route.params.get('despegar')
  const landingParam = route.params.get('aterrizaje')
  const cinematicStart = useRef(false)
  /** La cámara ya hizo el despegue de este vuelo. */
  const tookOff = useRef(false)

  // --- Destinos ---
  const candidates = useMemo(
    () => (stage === 'reserva' ? destinationsFor(origin, AIRPORTS, minutes, 40, true) : []),
    [stage, origin, minutes],
  )
  const selected: Destination | null = useMemo(() => {
    if (quick) {
      const destination = destinationsFor(origin, AIRPORTS, minutes, 1)[0]
      return destination ? { ...destination, minutes } : null
    }
    if (destIata) {
      const airport = AIRPORT_BY_IATA.get(destIata)
      if (airport) {
        const km = distanceKm(origin, airport)
        return { airport, km, minutes: minutesFor(km) }
      }
    }
    return candidates[0] ?? null
  }, [destIata, candidates, origin, minutes, quick])

  // --- Mapa ---
  // Apariencia propia de Estudio: clara u oscura de principio a fin (también
  // en cabina), o la de la app. Se impone a toda la página mientras se está
  // aquí, para que hojas y menús que se abran encima vayan a juego.
  const appDark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
  const tone: 'light' | 'dark' =
    prefs.appearance === 'claro' ? 'light' : prefs.appearance === 'oscuro' ? 'dark' : appDark ? 'dark' : 'light'
  useLayoutEffect(() => setThemeOverride(tone), [tone])
  useLayoutEffect(() => () => setThemeOverride(null), [])
  const look = useMemo(
    () => ({
      kind: prefs.map,
      tone,
      labels: prefs.labels,
      globe: prefs.globe,
    }),
    [prefs.map, prefs.labels, prefs.globe, tone],
  )
  const mapEnabled = !prefs.quiet && !quickParam && !(stage === 'despegue' && quick)
  const { container, map, status: mapStatus, retry: retryMap } = useStudyMap(
    mapEnabled, look, origin, prefs.globe ? 2.7 : 5.2, () => setFollowing(false),
  )
  const initialMap = useRef<typeof map>(null)

  // La barra de estado del iPad toma el color del mapa (no el gris claro de
  // la app) mientras dure el modo estudio; al salir se deja como estaba.
  // En vuelo sobre la esfera la cámara va inclinada: arriba está el cielo.
  const edgeColor = mapEdgeColor(
    look,
    stage === 'vuelo' || stage === 'aterrizado'
      ? 'cielo'
      : stage === 'inicio' && (!activity || tab === 'resumen')
        ? 'espacio'
        : 'suelo',
  )
  // Desde iOS/iPadOS 26, Safari ya no lee «theme-color»: el velo difuminado
  // de arriba lo tiñe con el fondo de html/body y con el de los elementos
  // fijos pegados al borde superior. El body seguía en el gris claro de la
  // app y la cabina (fija, a pantalla completa) también, así que salía una
  // franja blanca difuminada sobre el mapa. Se pintan los tres del color del
  // borde del mapa; «theme-color» se mantiene para versiones anteriores.
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    const before = metas.map((m) => m.getAttribute('content'))
    for (const m of metas) m.setAttribute('content', edgeColor)
    const html = document.documentElement
    const body = document.body
    const prev = { html: html.style.backgroundColor, body: body.style.backgroundColor }
    html.style.backgroundColor = edgeColor
    body.style.backgroundColor = edgeColor
    return () => {
      metas.forEach((m, i) => before[i] !== null && m.setAttribute('content', before[i]!))
      html.style.backgroundColor = prev.html
      body.style.backgroundColor = prev.body
    }
  }, [edgeColor])

  // --- Sesión en el aire (también si despegó en otro dispositivo) ---
  // Las escalas y el aterrizaje los aplica el controlador del vuelo, que vive
  // fuera de esta vista; aquí solo se sigue lo que le pasa a la sesión.
  const sessionShown =
    active ?? (landedId ? data.sessions.find((s) => s.id === landedId) : undefined)
  const lastActive = useRef<string | null>(active?.id ?? null)
  useEffect(() => {
    if (active) {
      lastActive.current = active.id
      if (stage !== 'vuelo') setStage('vuelo')
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

  useEffect(() => {
    if (!landingParam || active) return
    const landed = data.sessions.find((s) => s.id === landingParam && s.status === 'aterrizado')
    if (landed) {
      setLandedId(landed.id)
      setStage('aterrizado')
    }
  }, [landingParam, data.sessions, active])

  const flightFrom = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.from) : undefined
  const flightTo = sessionShown ? AIRPORT_BY_IATA.get(sessionShown.to) : undefined
  const now = useNow(stage === 'vuelo' && !!active && (!active.pausedAt || inLayover(active)), 1000)
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
    if (!map) return

    if (stage === 'inicio') {
      map.setRange(null, 0)
      map.clearPins()
      map.setPlane(null, null, 0)
      map.setRoute(null, null)
      if (!activity || tab === 'resumen') {
        map.setHistory([])
        // Sobre la esfera, el planeta entero con tu ciudad: el punto de partida.
        // Ya se creó con este encuadre. Evita pedir otro conjunto de teselas
        // antes de mostrar el primero al abrir Estudio.
        if (initialMap.current === map) map.showPlace(origin, prefs.globe ? 2.7 : 5.2, activity ? panelPadding() : homePadding())
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
      const timer = window.setTimeout(() => {
        map.fitRange(origin, Math.max(kmFor(minutes), selected?.km ?? 0), panelPadding())
      }, 140)
      return () => window.clearTimeout(timer)
    }

    if ((stage === 'asiento' || stage === 'tarjeta') && selected) {
      map.clearPins()
      map.setRange(null, 0)
      map.setRoute(origin, selected.airport, 0)
      map.fitRoute(origin, selected.airport, CENTER_PADDING)
    }
  }, [stage, tab, activity, map, origin, minutes, candidates, selected, history, prefs.globe])

  useEffect(() => {
    initialMap.current = map
    tookOff.current = false
  }, [map])

  // Vuelo: el avión avanza cada segundo; la cámara le sigue si se lo pides.
  useEffect(() => {
    if (!map || !flightFrom || !flightTo) return
    if (stage !== 'vuelo' && stage !== 'aterrizado') return
    map.clearPins()
    map.setRange(null, 0)
    map.setHistory([])
    map.setRoute(flightFrom, flightTo, prog)
    const here = map.setPlane(flightFrom, flightTo, prog)
    if (!here) return
    if (stage === 'aterrizado') {
      if (!tookOff.current) {
        map.fitRoute(flightFrom, flightTo, HUD_PADDING, 0)
        return
      }
      tookOff.current = false
      map.landing(flightTo, flightHeading(flightFrom, flightTo, 0.99), { ...HUD_PADDING, bottom: 420 })
      return
    }
    if (!tookOff.current) {
      tookOff.current = true
      if (cinematicStart.current && prog < 0.02) {
        const zoom = Math.min(8, Math.max(4.2, map.routeZoom(flightFrom, flightTo, HUD_PADDING) + 1.4))
        map.takeoff(here, zoom, flightHeading(flightFrom, flightTo, prog))
      } else map.fitRoute(flightFrom, flightTo, HUD_PADDING, 700)
      cinematicStart.current = false
      return
    }
    if (following && !active?.pausedAt && !document.hidden) {
      map.follow(here, flightHeading(flightFrom, flightTo, prog), undefined, 1000)
    }
  }, [stage, map, flightFrom, flightTo, prog, following, active?.pausedAt])

  // Espacio pausa y reanuda el vuelo (iPad con teclado, ordenador).
  useEffect(() => {
    if (stage !== 'vuelo' || !active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (typing(event.target) || document.querySelector('[aria-modal="true"]')) return
      // Un botón enfocado ya reacciona al espacio por su cuenta.
      if ((event.target as HTMLElement | null)?.closest('button, a, [role="switch"]')) return
      event.preventDefault()
      haptic()
      dispatch({ type: active.pausedAt ? 'session/resume' : 'session/pause', id: active.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, active, dispatch])

  // --- Acciones ---

  const leave = useCallback(() => navigate('inicio'), [navigate])

  const startBooking = () => {
    setQuick(false)
    setExamId(undefined)
    setDestIata(null)
    setSeat(null)
    setPassId(newId('pase'))
    setStage('reserva')
  }

  const random = () => {
    const pool = destinationsFor(origin, AIRPORTS, minutes, 400, true).filter(
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
    if (!selected || !seat || active) return
    // Dentro del toque: Safari no deja arrancar audio de otra forma.
    beginFlightAudio(prefs)
    chime('megafonia')
    haptic('success')
    setPrefs({ minutes: selected.minutes })
    tookOff.current = false
    cinematicStart.current = !quick
    setFollowing(false)
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
        examId,
        ...plan,
      },
    })
    setQuick(false)
    setExamId(undefined)
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
    if (!from || !to || !map) return
    haptic()
    map.setRoute(from, to, 1)
    map.fitRoute(from, to, panelPadding(), 900)
  }

  // --- Despegue rápido: `#/estudio?despegar=25` -----------------------------
  // Llega de «Despegar ahora», de «Con qué estudiar ahora», del atajo de
  // teclado, de los accesos directos de la app instalada o del asistente
  // («ponme 45 min de Mates con lluvia»). Despega directamente, sin pantalla
  // intermedia: destino a la distancia justa, ventanilla en la fila 7 y lo
  // que venga en el enlace (tarea, examen, asignatura) o estudio libre.
  // El sonido se intenta encender ya; si Safari no lo deja por no venir de
  // un toque directo, lo enciende el primer toque (ver FlightController).
  const quickSearch = route.params.toString()
  useEffect(() => {
    const params = new URLSearchParams(quickSearch)
    const duration = params.get('despegar')
    if (!duration) return
    // El parámetro se consume: recargar no debe volver a despegar.
    navigate('estudio', undefined, true)
    const wanted = focusMinutes(Number(duration))
    if (active || wanted === null) return
    const destination = destinationsFor(origin, AIRPORTS, wanted, 1)[0]
    if (!destination) return
    const exam = data.exams.find((e) => e.id === params.get('examen'))
    const task = data.tasks.find((t) => t.id === params.get('tarea') && t.status !== 'completada')
    const subject = subjects.find((s) => s.id === params.get('asignatura'))
    const wantedSound = params.get('sonido')
    const audio = { ...prefs }
    if (wantedSound === 'ninguno' || SOUNDS.some((x) => x.id === wantedSound)) {
      audio.sound = wantedSound as SoundId | 'ninguno'
      setPrefs({ sound: audio.sound })
    }
    beginFlightAudio(audio)
    chime('megafonia')
    haptic('success')
    setPrefs({ minutes: wanted })
    tookOff.current = false
    cinematicStart.current = true
    setFollowing(false)
    setLandedId(null)
    setActivity(false)
    setQuick(false)
    setExamId(undefined)
    dispatch({
      type: 'session/start',
      session: {
        from: origin.iata,
        to: destination.airport.iata,
        distanceKm: Math.round(destination.km),
        plannedMinutes: wanted,
        seat: '07A',
        subjectId: exam?.subjectId ?? task?.subjectId ?? subject?.id,
        taskId: task?.id,
        examId: exam?.id,
        ...layoverPlan(prefs, wanted),
      },
    })
    setStage('vuelo')
    // Solo reacciona al parámetro: el resto se lee en ese instante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSearch])

  const landedTask = sessionShown?.taskId
    ? data.tasks.find((t) => t.id === sessionShown.taskId)
    : undefined
  const activeTask = active?.taskId ? data.tasks.find((t) => t.id === active.taskId) : undefined
  const passTask = seat?.taskId ? data.tasks.find((t) => t.id === seat.taskId) : undefined
  const quickExam = examId ? data.exams.find((e) => e.id === examId) : undefined
  const flightExam = sessionShown?.examId ? data.exams.find((e) => e.id === sessionShown.examId) : undefined
  const isNewCity =
    !!sessionShown &&
    !data.sessions.some(
      (s) => s.id !== sessionShown.id && s.status === 'aterrizado' && s.to === sessionShown.to,
    )

  // El HUD del vuelo entra cuando el globo ya se ve, o a los 1,2 s aunque
  // no haya llegado (sin red, el reloj no puede esperar al mapa).
  const mapSettled = !mapEnabled || mapStatus !== 'cargando'
  const [hudTimedOut, setHudTimedOut] = useState(false)
  useEffect(() => {
    if (stage !== 'vuelo' || mapSettled) return
    setHudTimedOut(false)
    const timer = window.setTimeout(() => setHudTimedOut(true), 1200)
    return () => window.clearTimeout(timer)
  }, [stage, mapSettled])
  const hudReady = mapSettled || hudTimedOut

  const showToolbar =
    stage === 'inicio' || stage === 'reserva' || stage === 'vuelo' || stage === 'aterrizado'

  // En vuelo, sin tocar nada unos segundos, los controles de arriba se
  // apartan y queda el mapa con el avión y la tarjeta del vuelo. Cualquier
  // toque, tecla o foco los devuelve. En pausa no se apartan.
  const [idle, setIdle] = useState(false)
  const flyingNow = stage === 'vuelo' && !!active && !active.pausedAt
  useEffect(() => {
    if (!flyingNow) {
      setIdle(false)
      return
    }
    let timer = 0
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    }
    wake()
    const events = ['pointerdown', 'pointermove', 'keydown', 'focusin', 'wheel'] as const
    for (const e of events) window.addEventListener(e, wake, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, wake)
    }
  }, [flyingNow])

  return (
    <div
      className="study-root fixed inset-0 z-[35] overflow-hidden text-ink"
      style={{ backgroundColor: edgeColor }}
      data-stage={stage}
      data-quiet={prefs.quiet ? 'true' : undefined}
      data-tone={tone}
      data-activity={activity ? 'true' : undefined}
      data-idle={idle ? 'true' : undefined}
    >
      {/* El envoltorio fija el tamaño: MapLibre pone `position: relative` a
          su contenedor y, sin él, el mapa se quedaba con altura cero. */}
      <div className={`study-map absolute inset-0 ${active?.pausedAt ? 'is-paused' : ''}`}>
        <div className="study-map-placeholder" aria-hidden="true">
          <Orbit className="size-12 stroke-[1.25]" />
        </div>
        <div
          ref={container}
          className="study-map-canvas size-full"
          aria-label="Mapa interactivo"
          role="region"
          inert={!mapEnabled || mapStatus !== 'listo' || !showToolbar}
        />
        {mapEnabled && showToolbar && mapStatus !== 'listo' && (
          <div className="study-map-status" role="status">
            {mapStatus === 'cargando'
              ? 'Cargando cartografía…'
              : mapStatus === 'sin_webgl'
                ? 'Este navegador no puede dibujar el mapa: activa la aceleración por hardware (WebGL)'
                : 'Mapa temporalmente no disponible'}
            {mapStatus !== 'cargando' && mapStatus !== 'sin_webgl' && (
              <button type="button" className="font-semibold underline underline-offset-4" onClick={retryMap}>
                Reintentar
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {stage === 'inicio' && (
          <StudyHome
            key="entrada"
            origin={origin}
            hidden={activity}
            onExit={leave}
            onActivity={(next) => {
              setTab(next)
              setActivity(true)
            }}
            onStart={startBooking}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage === 'inicio' && activity && (
          <SidePanel key="inicio">
            <HomePanel
              origin={origin}
              sessions={data.sessions}
              subjects={subjectMap}
              today={today}
              tab={tab}
              onTab={setTab}
              onClose={() => setActivity(false)}
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
              quick={
                <QuickStart
                  subjects={subjectMap}
                  today={today}
                  onQuick={(duration) => navigate('estudio', { despegar: String(duration) })}
                />
              }
              onBook={() => {
                if (!selected) return
                setDestIata(selected.airport.iata)
                setMinutes(selected.minutes)
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
            onGo={takeoff}
            onCancel={() => {
              // Un despegue rápido no pasó por la tarjeta: se vuelve al inicio.
              setStage(quick ? 'inicio' : 'tarjeta')
              setQuick(false)
              setExamId(undefined)
            }}
            quick={
              quick && seat
                ? {
                    subjects,
                    tasks: data.tasks,
                    subjectId: seat.subjectId,
                    taskId: seat.taskId,
                    exam: quickExam,
                    onMinutes: setMinutes,
                    onSubject: (id) => {
                      if (id !== seat.subjectId) setExamId(undefined)
                      setSeat({ ...seat, subjectId: id, taskId: id === seat.subjectId ? seat.taskId : undefined })
                    },
                    onTask: (id) => setSeat({ ...seat, taskId: id }),
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <div className="contents text-ink">
        {showToolbar && (
          <MapToolbar
            mapVisible={!prefs.quiet}
            onToggleMap={() => setPrefs({ quiet: !prefs.quiet })}
            map={prefs.map}
            labels={prefs.labels}
            sound={prefs.sound}
            volume={prefs.volume}
            keepAwake={prefs.keepAwake}
            onMap={(m) => setPrefs({ map: m })}
            onLabels={(on) => setPrefs({ labels: on })}
            globe={prefs.globe}
            onGlobe={(on) => setPrefs({ globe: on })}
            onSound={(id) => {
              setPrefs({ sound: id })
              // En vuelo, el cambio suena ya (y ajusta la tarjeta de bloqueo).
              // Fuera del vuelo, se escucha unos segundos para poder elegir.
              if (stage === 'vuelo') beginFlightAudio({ ...prefs, sound: id })
              else if (!active) previewAudio({ ...prefs, sound: id })
            }}
            onVolume={(v) => {
              setPrefs({ volume: v })
              setVolume(v)
            }}
            wave={{ waves: prefs.waves, waveMode: prefs.waveMode, waveLevel: prefs.waveLevel }}
            onWave={(patch) => {
              setPrefs(patch)
              const next = { ...prefs, ...patch }
              if (stage === 'vuelo') {
                if (patch.waveLevel !== undefined && patch.waves === undefined && patch.waveMode === undefined) {
                  setWaveLevel(next.waveLevel)
                } else beginFlightAudio(next)
              } else if (!active && (patch.waves !== undefined || patch.waveMode !== undefined)) {
                previewAudio(next)
              } else if (!active && patch.waveLevel !== undefined) {
                setWaveLevel(next.waveLevel)
              }
            }}
            onKeepAwake={(on) => setPrefs({ keepAwake: on })}
            appearance={prefs.appearance}
            onAppearance={(value) => setPrefs({ appearance: value })}
            lockCard={prefs.lockCard}
            onLockCard={(on) => {
              setPrefs({ lockCard: on })
              if (stage === 'vuelo') beginFlightAudio({ ...prefs, lockCard: on })
            }}
            flight={
              stage === 'vuelo' && mapStatus === 'listo' && map && flightFrom && flightTo
                ? {
                    following,
                    onFollow: () => {
                      setFollowing(true)
                      const here = map?.setPlane(flightFrom, flightTo, prog)
                      if (map && here) {
                        const zoom = Math.min(
                          8,
                          Math.max(4.2, map.routeZoom(flightFrom, flightTo, HUD_PADDING) + 1.4),
                        )
                        map.rejoin(here, flightHeading(flightFrom, flightTo, prog), zoom, HUD_PADDING)
                      }
                    },
                    onOverview: () => {
                      setFollowing(false)
                      map.fitRoute(flightFrom, flightTo, HUD_PADDING, 900)
                    },
                  }
                : undefined
            }
          />
        )}

        {stage === 'vuelo' && active && (
          <FlightHud
            ready={hudReady}
            session={active}
            subject={active.subjectId ? subjectMap.get(active.subjectId) : undefined}
            task={activeTask}
            exam={flightExam}
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
        {stage === 'aterrizado' && sessionShown && (
            <LandedCard
              key="aterrizado"
              session={sessionShown}
              city={flightTo?.city ?? sessionShown.to}
              subject={sessionShown.subjectId ? subjectMap.get(sessionShown.subjectId) : undefined}
              task={landedTask}
              isNewCity={isNewCity}
              onCompleteTask={() => {
                if (landedTask && landedTask.status !== 'completada') {
                  haptic('success')
                  dispatch({ type: 'task/update', id: landedTask.id, patch: { status: 'completada' } })
                }
              }}
              onAgain={() => {
                setLandedId(null)
                if (landingParam) navigate('estudio', undefined, true)
                startBooking()
              }}
              onDone={() => {
                setLandedId(null)
                if (landingParam) navigate('estudio', undefined, true)
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
            className="study-pause-veil absolute inset-0 z-[5] pointer-events-none"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
