import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Plane, Search, Shuffle, X } from 'lucide-react'

import {
  MAX_MINUTES,
  MIN_MINUTES,
  distanceKm,
  flag,
  formatFlightTime,
  kmFor,
  minutesFor,
  type Airport,
  type Destination,
} from '@/domain/flights'
import { relativeDay } from '@/domain/dates'
import type { FocusSession, Subject } from '@/domain/types'
import { colorVar } from '@/domain/palette'
import { spring } from '@/ui/motion'
import { Button, IconButton, cx } from '@/ui/primitives'
import { AIRPORT_BY_IATA, searchAirports } from './airports'
import { DurationRuler } from './DurationRuler'

/**
 * Hoja flotante de la izquierda: el mismo cristal para el inicio y para la
 * reserva, como la tarjeta de Apple Mapas sobre el mapa.
 */
export function SidePanel({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={spring.smooth}
      className={cx(
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

export const PANEL_WIDTH = 380

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 14) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

export function HomePanel({
  origin,
  sessions,
  subjects,
  today,
  onExit,
  onStart,
}: {
  origin: Airport
  sessions: FocusSession[]
  subjects: Map<string, Subject>
  today: string
  onExit: () => void
  onStart: () => void
}) {
  const stats = useMemo(() => {
    const landed = sessions.filter((s) => s.status !== 'en_vuelo' && s.endedAt)
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    let todayMin = 0
    let weekMin = 0
    let km = 0
    for (const s of landed) {
      const end = new Date(s.endedAt!)
      const minutes = s.focusedMinutes ?? 0
      if (end >= weekStart) weekMin += minutes
      if (localDay(end) === today) todayMin += minutes
      if (s.status === 'aterrizado') km += s.distanceKm
    }
    const recent = [...landed].sort((a, b) => (a.endedAt! < b.endedAt! ? 1 : -1)).slice(0, 5)
    return { todayMin, weekMin, km, flights: landed.filter((s) => s.status === 'aterrizado').length, recent }
  }, [sessions, today])

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4">
        <IconButton label="Salir del modo estudio" size="sm" onClick={onExit}>
          <ChevronLeft className="size-5" strokeWidth={2.4} />
        </IconButton>
        <span className="text-[0.8125rem] font-semibold text-ink-3">Modo estudio</span>
        <span className="size-9" />
      </div>

      <div className="px-6 pt-4">
        <p className="text-[0.9375rem] text-ink-3">{greeting()}. Estás en</p>
        <h1 className="display text-[2.5rem] leading-[1.05] mt-0.5">{origin.city}</h1>
        <p className="mt-1.5 text-[0.875rem] text-ink-2 flex items-center gap-1.5">
          <span className="font-mono font-semibold tracking-wide">{origin.iata}</span>
          <span className="text-ink-3">·</span>
          <span aria-hidden>{flag(origin.country)}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 mt-6">
        <Stat value={formatShort(stats.todayMin)} label="Hoy" />
        <Stat value={formatShort(stats.weekMin)} label="Semana" />
        <Stat value={stats.km >= 1000 ? `${(stats.km / 1000).toFixed(1)}k` : `${Math.round(stats.km)}`} label="Km volados" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 mt-6 pb-4">
        <p className="eyebrow px-2 mb-2">Últimos vuelos</p>
        {stats.recent.length === 0 ? (
          <p className="px-2 text-[0.875rem] text-ink-3 leading-relaxed">
            Aún no has volado. Elige cuánto vas a estudiar y despega: cada sesión es un vuelo a
            una ciudad real, y el siguiente sale desde donde aterrices.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {stats.recent.map((s) => {
              const from = AIRPORT_BY_IATA.get(s.from)
              const to = AIRPORT_BY_IATA.get(s.to)
              const subject = s.subjectId ? subjects.get(s.subjectId) : undefined
              const cancelled = s.status === 'cancelado'
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-[16px] px-2.5 py-2 hover:bg-[var(--glass-tint)] transition-colors"
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[0.875rem] font-semibold">
                      <span className="font-mono">{s.from}</span>
                      <Plane className="size-3 text-ink-3 rotate-45" strokeWidth={2.4} />
                      <span className={cx('font-mono', cancelled && 'line-through text-ink-3')}>
                        {s.to}
                      </span>
                      <span className="truncate font-normal text-ink-3">
                        {cancelled ? 'Desviado' : to?.city ?? from?.city}
                      </span>
                    </span>
                    <span className="block text-[0.75rem] text-ink-3 truncate">
                      {subject?.name ?? 'Estudio libre'} · {relativeDay(localDay(new Date(s.endedAt!)), today)}
                    </span>
                  </span>
                  <span className="text-[0.8125rem] font-semibold tabular-nums text-ink-2">
                    {formatFlightTime(s.focusedMinutes ?? 0)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="p-4 pt-2">
        <Button variant="primary" size="lg" block onClick={onStart}>
          <Plane className="size-[18px]" strokeWidth={2.4} />
          Nuevo vuelo
        </Button>
      </div>
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[18px] bg-[var(--glass-tint)] px-3 py-2.5">
      <p className="numeral text-[1.375rem]">{value}</p>
      <p className="text-[0.6875rem] font-medium text-ink-3 mt-1">{label}</p>
    </div>
  )
}

function formatShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = minutes / 60
  return `${h >= 10 ? Math.round(h) : h.toFixed(1).replace('.0', '')}h`
}

function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------------

export function BookingPanel({
  origin,
  minutes,
  onMinutes,
  candidates,
  selected,
  onSelect,
  onRandom,
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

  return (
    <>
      <div className="flex items-center gap-1 px-4 pt-4">
        <IconButton label="Volver" size="sm" onClick={onBack}>
          <ChevronLeft className="size-5" strokeWidth={2.4} />
        </IconButton>
        <p className="flex-1 min-w-0 text-[0.8125rem] font-semibold text-ink-3 truncate">
          Desde {origin.city} · <span className="font-mono">{origin.iata}</span>
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
          {searching ? (
            <X className="size-[18px]" strokeWidth={2.4} />
          ) : (
            <Search className="size-[18px]" strokeWidth={2.2} />
          )}
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
            className="px-4 pt-3 pb-2"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ciudad o código (BCN, Roma…)"
              aria-label="Buscar ciudad o aeropuerto"
              className="w-full h-11 px-4 rounded-full bg-fill text-[0.9375rem] outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent"
            />
          </motion.div>
        ) : (
          <motion.div
            key="tiempo"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={spring.snappy}
            className="px-6 pt-3 pb-3"
          >
            <p className="text-[0.875rem] text-ink-3">¿Cuánto vas a estudiar?</p>
            <p className="display text-[2.25rem] leading-tight tabular-nums mt-0.5">
              {formatFlightTime(minutes)}
            </p>
            <p className="text-[0.8125rem] text-ink-3 tabular-nums">
              {kmFor(minutes).toLocaleString('es')} km de vuelo
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 flex gap-2 pl-3 pr-2 border-t border-[var(--glass-edge)]">
        <ul className="flex-1 min-w-0 overflow-y-auto no-scrollbar py-2 flex flex-col gap-0.5">
          {(searching ? results : candidates).map((d) => {
            const reachable = d.minutes >= MIN_MINUTES && d.minutes <= MAX_MINUTES
            const isSelected = selected?.airport.iata === d.airport.iata
            return (
              <li key={d.airport.iata}>
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
                    'pressable w-full flex items-center gap-3 rounded-[14px] px-2.5 py-2 text-left',
                    'disabled:opacity-45 transition-colors',
                    isSelected ? 'bg-accent-fill text-white' : 'hover:bg-[var(--glass-tint)]',
                  )}
                >
                  <span
                    className={cx(
                      'shrink-0 w-[3.25rem] h-7 grid place-items-center rounded-[8px] font-mono text-[0.8125rem] font-bold tracking-wide',
                      isSelected ? 'bg-white/20' : 'bg-[var(--glass-tint)] text-ink',
                    )}
                  >
                    {d.airport.iata}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold leading-tight truncate">
                      {d.airport.city}
                    </span>
                    <span
                      className={cx(
                        'block text-[0.75rem] tabular-nums',
                        isSelected ? 'text-white/80' : 'text-ink-3',
                      )}
                    >
                      {flag(d.airport.country)} {Math.round(d.km).toLocaleString('es')} km
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
              </li>
            )
          })}
          {searching && query && results.length === 0 && (
            <li className="px-3 py-6 text-center text-[0.875rem] text-ink-3">
              Ningún aeropuerto con ese nombre.
            </li>
          )}
        </ul>

        {!searching && (
          <div className="w-[4.75rem] shrink-0 py-2">
            <DurationRuler value={minutes} min={MIN_MINUTES} max={MAX_MINUTES} onChange={onMinutes} />
          </div>
        )}
      </div>

      <div className="p-4 pt-3 border-t border-[var(--glass-edge)]">
        <Button variant="primary" size="lg" block disabled={!selected} onClick={onBook}>
          {selected ? (
            <span className="truncate">Reservar vuelo a {selected.airport.city}</span>
          ) : (
            'Elige un destino'
          )}
        </Button>
      </div>
    </>
  )
}
