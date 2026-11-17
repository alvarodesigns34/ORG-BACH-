import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Coffee, Plane, Search, Shuffle, X } from 'lucide-react'

import {
  MAX_MINUTES,
  MIN_MINUTES,
  countryName,
  distanceKm,
  formatFlightTime,
  kmFor,
  layoverPoints,
  minutesBySubject,
  minutesFor,
  passport,
  type Airport,
  type Destination,
} from '@/domain/flights'
import { relativeDay } from '@/domain/dates'
import type { FocusSession, Subject } from '@/domain/types'
import { colorVar } from '@/domain/palette'
import { haptic, spring } from '@/ui/motion'
import { Button, IconButton, Segmented, cx } from '@/ui/primitives'
import { AIRPORT_BY_IATA, searchAirports } from './airports'
import { DurationRuler } from './DurationRuler'
import type { LayoverMode, StudyPrefs } from './prefs'

export const PANEL_WIDTH = 380

/**
 * Hoja flotante de la izquierda: el mismo material para inicio y reserva,
 * como la tarjeta de Apple Mapas sobre el mapa.
 */
export function SidePanel({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -28, transition: { duration: 0.18 } }}
      transition={spring.smooth}
      className={cx(
        'study-side-panel',
        'absolute z-10 left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]',
        'bottom-[max(1rem,env(safe-area-inset-bottom))] w-[min(380px,calc(100vw-2rem))]',
      )}
    >
      <div className="liquid h-full rounded-[30px] flex flex-col overflow-hidden">
        <div className="relative z-[2] flex flex-col h-full min-h-0">{children}</div>
      </div>
    </motion.div>
  )
}

function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** «2 h 05», «45 min»: corto para las cifras grandes. */
function shortTime(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: 'min' }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return { value: m ? `${h}:${String(m).padStart(2, '0')}` : String(h), unit: 'h' }
}

function Figure({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="rounded-[18px] bg-[var(--glass-tint)] px-3.5 py-3 min-w-0">
      <p className="numeral text-[1.5rem] truncate">
        {value}
        {unit && <span className="text-[0.8125rem] font-semibold text-ink-3 ml-0.5">{unit}</span>}
      </p>
      <p className="text-[0.75rem] font-medium text-ink-3 mt-1.5">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

export type HomeTab = 'resumen' | 'diario' | 'pasaporte'

const QUICK = [25, 45, 60, 90]

export function HomePanel({
  origin,
  sessions,
  subjects,
  today,
  tab,
  onTab,
  onExit,
  onStart,
  onQuick,
  onShowFlight,
}: {
  origin: Airport
  sessions: FocusSession[]
  subjects: Map<string, Subject>
  today: string
  tab: HomeTab
  onTab: (tab: HomeTab) => void
  onExit: () => void
  onStart: () => void
  onQuick: (minutes: number) => void
  onShowFlight: (session: FocusSession) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-4">
        <IconButton label="Salir del modo estudio" size="sm" onClick={onExit}>
          <ChevronLeft className="size-5" strokeWidth={2.4} />
        </IconButton>
        <Segmented<HomeTab>
          label="Sección"
          size="sm"
          value={tab}
          onChange={(next) => {
            haptic()
            onTab(next)
          }}
          options={[
            { value: 'resumen', label: 'Resumen' },
            { value: 'diario', label: 'Diario' },
            { value: 'pasaporte', label: 'Pasaporte' },
          ]}
          className="min-w-0 flex-1 [&>button]:flex-1"
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
          transition={spring.snappy}
          className="flex-1 min-h-0 flex flex-col"
        >
          {tab === 'resumen' && (
            <Summary origin={origin} sessions={sessions} subjects={subjects} today={today} onStart={onStart} onQuick={onQuick} />
          )}
          {tab === 'diario' && (
            <Logbook sessions={sessions} subjects={subjects} today={today} onShow={onShowFlight} />
          )}
          {tab === 'pasaporte' && <PassportView sessions={sessions} subjects={subjects} />}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function Summary({
  origin,
  sessions,
  subjects,
  today,
  onStart,
  onQuick,
}: {
  origin: Airport
  sessions: FocusSession[]
  subjects: Map<string, Subject>
  today: string
  onStart: () => void
  onQuick: (minutes: number) => void
}) {
  const stats = useMemo(() => {
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    let todayMin = 0
    let weekMin = 0
    let flights = 0
    for (const s of sessions) {
      if (s.status === 'en_vuelo' || !s.endedAt) continue
      const end = new Date(s.endedAt)
      const minutes = s.focusedMinutes ?? 0
      if (end >= weekStart) weekMin += minutes
      if (localDay(end) === today) todayMin += minutes
      if (s.status === 'aterrizado') flights++
    }
    const last = [...sessions]
      .filter((s) => s.status === 'aterrizado' && s.endedAt)
      .sort((a, b) => (a.endedAt! < b.endedAt! ? 1 : -1))[0]
    const bySubject = [...minutesBySubject(sessions, weekStart.getTime())]
      .map(([id, minutes]) => ({ id, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
    return { todayMin, weekMin, flights, last, bySubject }
  }, [sessions, today])

  const hoy = shortTime(stats.todayMin)
  const semana = shortTime(stats.weekMin)
  const last = stats.last
  const lastSubject = last?.subjectId ? subjects.get(last.subjectId) : undefined

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar page-enter">
        <div className="px-6 pt-6">
          <p className="eyebrow">Focus Flight</p>
          <h1 className="display text-[2.75rem] leading-[1.02] mt-0.5 tracking-[-0.03em]">{origin.city}</h1>
          <p className="mt-2 text-[0.875rem] text-ink-2 flex items-center gap-2">
            <span className="font-mono font-bold tracking-wide text-[0.8125rem] px-1.5 py-0.5 rounded-[6px] bg-[var(--glass-tint)]">
              {origin.iata}
            </span>
            {countryName(origin.country)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 mt-6">
          <Figure value={hoy.value} unit={hoy.unit} label="Hoy" />
          <Figure value={semana.value} unit={semana.unit} label="Esta semana" />
          <Figure value={String(stats.flights)} label="Vuelos" />
        </div>

        {last && (
          <div className="px-4 mt-5">
            <p className="eyebrow px-2 mb-2">Último vuelo</p>
            <div className="rounded-[18px] bg-[var(--glass-tint)] px-4 py-3 flex items-center gap-3">
              <span
                className="w-1 self-stretch rounded-full"
                style={{ background: lastSubject ? colorVar(lastSubject.color) : 'var(--c-ink-3)' }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-mono text-[0.9375rem] font-bold">
                  {last.from}
                  <Plane className="size-3 rotate-45 text-ink-3" strokeWidth={2.4} />
                  {last.to}
                </span>
                <span className="block text-[0.75rem] text-ink-3 truncate mt-0.5">
                  {lastSubject?.name ?? 'Estudio libre'} ·{' '}
                  {relativeDay(localDay(new Date(last.endedAt!)), today)}
                </span>
              </span>
              <span className="text-[0.875rem] font-semibold tabular-nums text-ink-2">
                {formatFlightTime(last.focusedMinutes ?? last.plannedMinutes)}
              </span>
            </div>
          </div>
        )}

        {stats.bySubject.length > 0 && (
          <div className="px-4 mt-5">
            <p className="eyebrow px-2 mb-2.5">Esta semana</p>
            <ul className="flex flex-col gap-2.5 px-2">
              {stats.bySubject.slice(0, 5).map(({ id, minutes }) => {
                const subject = id ? subjects.get(id) : undefined
                const max = stats.bySubject[0].minutes
                return (
                  <li key={id ?? 'libre'}>
                    <div className="flex items-baseline justify-between text-[0.8125rem]">
                      <span className="truncate font-medium">{subject?.name ?? 'Estudio libre'}</span>
                      <span className="tabular-nums text-ink-3 ml-3 shrink-0">{formatFlightTime(minutes)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--glass-tint)] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(minutes / max) * 100}%` }}
                        transition={{ ...spring.smooth, bounce: 0 }}
                        className="h-full rounded-full"
                        style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="px-4 mt-5 pb-4">
          <p className="eyebrow px-2 mb-2">Despegar ahora</p>
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onQuick(m)}
                className="pressable h-14 rounded-[16px] bg-[var(--glass-tint)] hover:bg-[color-mix(in_srgb,var(--glass-tint)_100%,var(--c-ink)_4%)] flex flex-col items-center justify-center"
              >
                <span className="numeral text-[1.0625rem]">{m < 60 ? m : m % 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : m / 60}</span>
                <span className="text-[0.6875rem] font-medium text-ink-3 mt-1">{m < 60 ? 'min' : m === 60 ? 'hora' : 'horas'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 pt-2">
        <Button variant="secondary" size="lg" block onClick={onStart}>
          <Plane className="size-[18px]" strokeWidth={2.4} />
          Planear vuelo
        </Button>
      </div>
    </>
  )
}

function Logbook({
  sessions,
  subjects,
  today,
  onShow,
}: {
  sessions: FocusSession[]
  subjects: Map<string, Subject>
  today: string
  onShow: (session: FocusSession) => void
}) {
  const [filter, setFilter] = useState<string>('todas')
  const closed = useMemo(
    () =>
      sessions
        .filter((s) => s.status !== 'en_vuelo' && s.endedAt)
        .sort((a, b) => (a.endedAt! < b.endedAt! ? 1 : -1)),
    [sessions],
  )
  const used = [...new Set(closed.map((s) => s.subjectId).filter((id): id is string => !!id))]
  const shown = closed.filter((s) => filter === 'todas' || s.subjectId === filter)

  const groups: { day: string; items: FocusSession[] }[] = []
  for (const s of shown) {
    const day = localDay(new Date(s.endedAt!))
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(s)
    else groups.push({ day, items: [s] })
  }

  if (closed.length === 0) {
    return (
      <div className="flex-1 grid place-items-center px-8 text-center">
        <div>
          <p className="text-[1.0625rem] font-semibold">Tu diario está vacío</p>
          <p className="text-[0.875rem] text-ink-3 mt-1.5 leading-relaxed">
            Aquí se apunta cada vuelo: de dónde a dónde, cuánto estudiaste y de qué.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {used.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pt-4 pb-1">
          {['todas', ...used].map((id) => {
            const subject = id === 'todas' ? undefined : subjects.get(id)
            const active = filter === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cx(
                  'pressable shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[0.8125rem] font-semibold transition-colors',
                  active ? 'bg-ink text-canvas' : 'bg-[var(--glass-tint)] text-ink-2',
                )}
              >
                {subject && (
                  <span className="size-2 rounded-full" style={{ background: colorVar(subject.color) }} />
                )}
                {subject ? subject.shortName || subject.name : 'Todas'}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-4">
        {groups.map((g) => (
          <section key={g.day} className="mt-3">
            <p className="eyebrow px-3 mb-1 first-letter:uppercase">{relativeDay(g.day, today)}</p>
            <ul>
              {g.items.map((s) => {
                const subject = s.subjectId ? subjects.get(s.subjectId) : undefined
                const to = AIRPORT_BY_IATA.get(s.to)
                const cancelled = s.status === 'cancelado'
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onShow(s)}
                      className="w-full flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-[var(--glass-tint)] transition-colors"
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-mono text-[0.875rem] font-bold">
                            {s.from}–{s.to}
                          </span>
                          <span className={cx('text-[0.875rem] truncate', cancelled ? 'text-ink-3 line-through' : 'text-ink-2')}>
                            {to?.city}
                          </span>
                        </span>
                        <span className="block text-[0.75rem] text-ink-3 truncate">
                          {cancelled ? 'Abandonado' : subject?.name ?? 'Estudio libre'}
                        </span>
                      </span>
                      <span className="text-[0.8125rem] font-semibold tabular-nums text-ink-2">
                        {formatFlightTime(s.focusedMinutes ?? 0)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function hashAngle(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return (h % 15) - 7
}

function PassportView({
  sessions,
  subjects,
}: {
  sessions: FocusSession[]
  subjects: Map<string, Subject>
}) {
  const book = useMemo(
    () => passport(sessions, (iata) => AIRPORT_BY_IATA.get(iata)?.country),
    [sessions],
  )
  const time = shortTime(book.minutes)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-5">
      <div className="grid grid-cols-2 gap-2 px-4 pt-4">
        <Figure value={time.value} unit={time.unit} label="Estudiado en vuelo" />
        <Figure
          value={book.km >= 10000 ? `${(book.km / 1000).toFixed(1)}k` : Math.round(book.km).toLocaleString('es')}
          unit="km"
          label="Distancia volada"
        />
        <Figure value={String(book.stamps.length)} label={book.stamps.length === 1 ? 'Ciudad' : 'Ciudades'} />
        <Figure value={String(book.countries.length)} label={book.countries.length === 1 ? 'País' : 'Países'} />
      </div>

      {book.countries.length > 0 && (
        <div className="px-4 mt-5">
          <p className="eyebrow px-2 mb-2">Países</p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {book.countries.map((c) => (
              <span key={c} className="h-7 px-3 inline-flex items-center rounded-full bg-[var(--glass-tint)] text-[0.8125rem] font-medium">
                {countryName(c)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 mt-5">
        <p className="eyebrow px-2 mb-3">Sellos</p>
        {book.stamps.length === 0 ? (
          <p className="px-2 text-[0.875rem] text-ink-3 leading-relaxed">
            Cada ciudad nueva a la que llegues te deja un sello aquí.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-2 gap-y-3">
            {book.stamps.map((s) => {
              const airport = AIRPORT_BY_IATA.get(s.iata)
              const subject = s.subjectId ? subjects.get(s.subjectId) : undefined
              const tint = subject ? colorVar(subject.color) : 'var(--c-accent)'
              const date = new Date(s.firstAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })
              return (
                <motion.div
                  key={s.iata}
                  initial={{ scale: 1.25, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring.bouncy}
                  className="aspect-square grid place-items-center"
                  style={{ rotate: `${hashAngle(s.iata)}deg` }}
                >
                  <div
                    className="size-full rounded-full grid place-items-center text-center border-[2.5px] border-dashed p-2"
                    style={{ borderColor: `color-mix(in srgb, ${tint} 70%, transparent)`, color: tint }}
                  >
                    <div>
                      <p className="font-mono text-[1.0625rem] font-black tracking-wider leading-none">{s.iata}</p>
                      <p className="text-[0.625rem] font-semibold mt-1 leading-tight line-clamp-2 uppercase tracking-wide">
                        {airport?.city}
                      </p>
                      <p className="text-[0.5625rem] font-medium opacity-75 mt-0.5 uppercase">{date}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------------

const PRESETS = [25, 45, 60, 90, 120]
const BREAKS = [5, 10, 15]
const FOCUS = [25, 50]

export function BookingPanel({
  origin,
  minutes,
  onMinutes,
  candidates,
  selected,
  onSelect,
  onRandom,
  layover,
  onLayover,
  onBack,
  onBook,
}: {
  origin: Airport
  minutes: number
  onMinutes: (minutes: number) => void
  candidates: Destination[]
  selected: Destination | null
  onSelect: (iata: string, minutes: number) => void
  onRandom: () => void
  layover: { mode: LayoverMode; minutes: number; focus: number }
  onLayover: (patch: Partial<Pick<StudyPrefs, 'layoverMode' | 'layover' | 'focus'>>) => void
  onBack: () => void
  onBook: () => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(
    () =>
      searchAirports(query)
        .filter((a) => a.iata !== origin.iata)
        .map((airport) => {
          const km = distanceKm(origin, airport)
          return { airport, km, minutes: minutesFor(km) }
        }),
    [query, origin],
  )

  const flightMinutes = selected?.minutes ?? minutes
  const plan =
    layover.mode === 'pomodoro'
      ? { layoverMinutes: layover.minutes, layoverEvery: layover.focus }
      : layover.mode === 'mitad' && flightMinutes >= 40
        ? { layoverMinutes: layover.minutes }
        : {}
  const stops = layoverPoints({ plannedMinutes: flightMinutes, ...plan }).length

  return (
    <>
      <div className="flex items-center gap-1 px-4 pt-4">
        <IconButton label="Volver" size="sm" onClick={onBack}>
          <ChevronLeft className="size-5" strokeWidth={2.4} />
        </IconButton>
        <p className="flex-1 min-w-0 text-[0.8125rem] font-semibold text-ink-3 truncate">
          Desde {origin.city}
        </p>
        <IconButton label="Destino sorpresa" size="sm" onClick={onRandom}>
          <Shuffle className="size-[18px]" strokeWidth={2.2} />
        </IconButton>
        <IconButton
          label={searching ? 'Cerrar búsqueda' : 'Buscar destino'}
          size="sm"
          onClick={() => {
            setSearching((v) => !v)
            setQuery('')
          }}
        >
          {searching ? <X className="size-[18px]" strokeWidth={2.4} /> : <Search className="size-[18px]" strokeWidth={2.2} />}
        </IconButton>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {searching ? (
          <motion.div
            key="buscar"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={spring.snappy}
            className="px-4 pt-3 pb-3"
          >
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ciudad o código"
                aria-label="Buscar ciudad o aeropuerto"
                className="w-full h-11 pl-10 pr-4 rounded-full bg-[var(--glass-tint)] text-[0.9375rem] outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="tiempo"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={spring.snappy}
            className="pt-3 pb-3"
          >
            <div className="px-6">
              <p className="text-[0.875rem] font-medium text-ink-3">¿Cuánto vas a estudiar?</p>
              <p className="display text-[2.5rem] leading-[1.1] tabular-nums tracking-[-0.03em]">
                {formatFlightTime(minutes)}
              </p>
            </div>
            <div className="flex gap-1.5 px-4 mt-3 overflow-x-auto no-scrollbar">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    haptic()
                    onMinutes(p)
                  }}
                  className={cx(
                    'pressable shrink-0 h-8 px-3 rounded-full text-[0.8125rem] font-semibold tabular-nums transition-colors',
                    minutes === p ? 'bg-ink text-canvas' : 'bg-[var(--glass-tint)] text-ink-2 hover:text-ink',
                  )}
                >
                  {p < 60 ? `${p} min` : formatFlightTime(p).replace(' min', '')}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 flex gap-1 pl-3 pr-2 border-t border-[var(--glass-edge)]">
        <ul className="flex-1 min-w-0 overflow-y-auto no-scrollbar py-2 flex flex-col gap-0.5">
          {(searching ? results : candidates).map((d) => {
            const reachable = d.minutes >= MIN_MINUTES && d.minutes <= MAX_MINUTES
            const isSelected = selected?.airport.iata === d.airport.iata
            return (
              // Al mover la regla, los destinos se recolocan deslizándose.
              <motion.li
                key={d.airport.iata}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={spring.snappy}
              >
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => {
                    onSelect(d.airport.iata, d.minutes)
                    if (searching) {
                      setSearching(false)
                      setQuery('')
                    }
                  }}
                  className={cx(
                    'w-full flex items-center gap-3 rounded-[14px] px-2.5 py-2 text-left',
                    'disabled:opacity-40 transition-colors duration-150',
                    isSelected ? 'bg-[#0064d2] text-white' : 'hover:bg-[var(--glass-tint)]',
                  )}
                >
                  <span
                    className={cx(
                      'shrink-0 w-[3.25rem] h-7 grid place-items-center rounded-[8px] font-mono text-[0.8125rem] font-bold tracking-wide',
                      isSelected ? 'bg-white/18 text-white' : 'bg-[var(--glass-tint)] text-ink',
                    )}
                  >
                    {d.airport.iata}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold leading-tight truncate">
                      {d.airport.city}
                    </span>
                    <span className={cx('block text-[0.75rem] truncate', isSelected ? 'text-white/75' : 'text-ink-3')}>
                      {countryName(d.airport.country)}
                      {!reachable && ' · fuera de alcance'}
                    </span>
                  </span>
                  <span
                    className={cx(
                      'text-[0.8125rem] font-semibold tabular-nums shrink-0',
                      isSelected ? 'text-white' : 'text-ink-2',
                    )}
                  >
                    {formatFlightTime(d.minutes)}
                  </span>
                </button>
              </motion.li>
            )
          })}
          {searching && query && results.length === 0 && (
            <li className="px-3 py-6 text-center text-[0.875rem] text-ink-3">
              Ningún aeropuerto con ese nombre.
            </li>
          )}
        </ul>

        {!searching && (
          <div className="w-[4.5rem] shrink-0 py-2">
            <DurationRuler value={minutes} min={MIN_MINUTES} max={MAX_MINUTES} onChange={onMinutes} />
          </div>
        )}
      </div>

      <div className="px-4 pt-3 pb-4 border-t border-[var(--glass-edge)]">
        <div className="mb-3 px-1">
          <div className="flex items-center gap-3">
            <Coffee className="size-4 text-ink-3 shrink-0" strokeWidth={2.2} />
            <span className="flex-1 text-[0.8125rem] font-medium text-ink-2">Escalas</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Escalas">
              {(
                [
                  ['no', 'No'],
                  ['mitad', 'A mitad'],
                  ['pomodoro', 'Pomodoro'],
                ] as const
              ).map(([mode, label]) => (
                <Chip
                  key={mode}
                  active={layover.mode === mode}
                  onClick={() => onLayover({ layoverMode: mode })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          {layover.mode !== 'no' && (
            <div className="flex items-center gap-2 mt-2 pl-7 text-[0.75rem] text-ink-3">
              {layover.mode === 'pomodoro' && (
                <>
                  <span>Cada</span>
                  {FOCUS.map((m) => (
                    <Chip key={m} active={layover.focus === m} onClick={() => onLayover({ focus: m })}>
                      {m}′
                    </Chip>
                  ))}
                </>
              )}
              <span>{layover.mode === 'pomodoro' ? 'descansa' : 'De'}</span>
              {BREAKS.map((m) => (
                <Chip key={m} active={layover.minutes === m} onClick={() => onLayover({ layover: m })}>
                  {m}′
                </Chip>
              ))}
            </div>
          )}
        </div>
        <Button variant="primary" size="lg" block disabled={!selected} onClick={onBook}>
          {selected ? <span className="truncate">Reservar · {selected.airport.city}</span> : 'Elige un destino'}
        </Button>
        <p className="text-center text-[0.75rem] text-ink-3 mt-2 tabular-nums">
          {selected
            ? `${Math.round(selected.km).toLocaleString('es')} km · ${formatFlightTime(selected.minutes)}${
                stops === 0
                  ? layover.mode !== 'no'
                    ? ' · demasiado corto para escala'
                    : ''
                  : ` + ${stops === 1 ? '' : `${stops} × `}${layover.minutes} min de escala`
              }`
            : `${kmFor(minutes).toLocaleString('es')} km de alcance`}
        </p>
      </div>
    </>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => {
        haptic()
        onClick()
      }}
      className={cx(
        'h-7 min-w-9 px-2.5 rounded-full text-[0.75rem] font-semibold tabular-nums transition-colors',
        active ? 'bg-ink text-canvas' : 'bg-[var(--glass-tint)] text-ink-2',
      )}
    >
      {children}
    </button>
  )
}
