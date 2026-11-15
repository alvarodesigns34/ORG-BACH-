import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronLeft, Plane } from 'lucide-react'

import { formatFlightTime, type Airport } from '@/domain/flights'
import { colorVar } from '@/domain/palette'
import type { Subject, Task } from '@/domain/types'
import { haptic, spring } from '@/ui/motion'
import { Button, IconButton, cx } from '@/ui/primitives'

export interface SeatChoice {
  seat: string
  cabin: 'Preferente' | 'Turista'
  subjectId?: string
  taskId?: string
}

// ---------------------------------------------------------------------------
// Distribución de la cabina: 2 + 2 en todas las filas, como un avión
// regional visto desde arriba. Las tres primeras filas son Preferente.
// ---------------------------------------------------------------------------

interface SeatSpot {
  label: string
  row: number
  letter: string
  cabin: SeatChoice['cabin']
}

const ROWS = Array.from({ length: 14 }, (_, i) => i + 1)
const LETTERS = ['A', 'C', 'D', 'F'] as const
const BUSINESS_UNTIL = 3
/** Fila de la salida de emergencia, sobre el ala. */
const EXIT_ROW = 9

const SEATS: SeatSpot[] = ROWS.flatMap((row) =>
  LETTERS.map((letter) => ({
    label: `${String(row).padStart(2, '0')}${letter}`,
    row,
    letter,
    cabin: row <= BUSINESS_UNTIL ? ('Preferente' as const) : ('Turista' as const),
  })),
)

function seatKind(letter: string): string {
  return letter === 'A' || letter === 'F' ? 'Ventanilla' : 'Pasillo'
}

/** Algunos asientos ocupados, siempre los mismos para un mismo vuelo. */
function occupied(seed: string): Set<string> {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out = new Set<string>()
  for (const s of SEATS) {
    h = (h * 1664525 + 1013904223) >>> 0
    if ((h >>> 24) % 100 < 22) out.add(s.label)
  }
  return out
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

export function SeatPicker({
  flightKey,
  from,
  to,
  minutes,
  subjects,
  tasks,
  onBack,
  onDone,
}: {
  flightKey: string
  from: Airport
  to: Airport
  minutes: number
  subjects: Subject[]
  tasks: Task[]
  onBack: () => void
  onDone: (choice: SeatChoice) => void
}) {
  const taken = useMemo(() => occupied(flightKey), [flightKey])
  const [seat, setSeat] = useState<SeatSpot | null>(null)
  // undefined: sin elegir; null: estudio libre.
  const [subjectId, setSubjectId] = useState<string | null | undefined>(undefined)
  const [taskId, setTaskId] = useState<string | undefined>(undefined)

  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : undefined
  const color = subject ? colorVar(subject.color) : 'var(--c-accent-fill)'
  const pending = subjectId
    ? tasks.filter((t) => t.subjectId === subjectId && t.status !== 'completada').slice(0, 6)
    : []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      className="study-veil absolute inset-0 z-20 flex items-center justify-center gap-[clamp(0.5rem,3vw,3rem)] pr-6"
    >
      {/* --- El avión: sube desde abajo y se desplaza para ver más filas --- */}
      <motion.div
        initial={{ y: '70%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '40%', opacity: 0, transition: { duration: 0.25 } }}
        transition={{ type: 'spring', visualDuration: 0.55, bounce: 0.14 }}
        className="relative h-full shrink-0 plane-scroll"
      >
        <div className="h-full overflow-y-auto no-scrollbar px-14 pt-8 pb-24">
          <Fuselage
            taken={taken}
            selected={seat?.label ?? null}
            color={color}
            onPick={(spot) => {
              haptic()
              setSeat(spot)
            }}
          />
        </div>
      </motion.div>

      {/* --- Panel --- */}
      <motion.div
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...spring.smooth, delay: 0.08 }}
        className="liquid w-[360px] shrink-0 rounded-[30px] max-h-[calc(100dvh-3rem)] flex flex-col"
      >
        <div className="relative z-[2] flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-4 pt-4">
            <IconButton label="Volver a la reserva" size="sm" onClick={onBack}>
              <ChevronLeft className="size-5" strokeWidth={2.4} />
            </IconButton>
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-3">
              <span className="font-mono text-ink-2">{from.iata}</span>
              <Plane className="size-3 rotate-45" strokeWidth={2.4} />
              <span className="font-mono text-ink-2">{to.iata}</span>
              <span>· {formatFlightTime(minutes)}</span>
            </p>
          </div>

          <div className="px-6 pt-4 pb-4">
            <AnimatePresence mode="wait" initial={false}>
              {seat ? (
                <motion.div
                  key={seat.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={spring.snappy}
                >
                  <p className="text-[0.8125rem] font-medium text-ink-3">
                    {seat.cabin} · {seatKind(seat.letter)}
                    {seat.row === EXIT_ROW && ' · Salida de emergencia'}
                  </p>
                  <p className="font-mono text-[2.25rem] font-bold leading-tight tracking-tight">
                    {seat.label}
                  </p>
                </motion.div>
              ) : (
                <motion.div key="nada" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="display text-[1.75rem] leading-tight">Elige tu asiento</p>
                  <p className="text-[0.875rem] text-ink-3 mt-1.5 leading-snug">
                    Desliza el avión para ver todas las filas. Las tres primeras son Preferente; los asientos oscuros ya están ocupados.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence initial={false}>
            {seat && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ ...spring.smooth, bounce: 0 }}
                className="min-h-0 flex flex-col overflow-hidden border-t border-[var(--glass-edge)]"
              >
                <div className="min-h-0 overflow-y-auto no-scrollbar px-3 py-3" role="radiogroup" aria-label="Qué vas a estudiar">
                  <p className="eyebrow px-3 mb-1.5">¿Qué vas a estudiar?</p>
                  <ul className="flex flex-col">
                    {subjects.map((s) => (
                      <ChoiceRow
                        key={s.id}
                        selected={subjectId === s.id}
                        color={colorVar(s.color)}
                        label={s.name}
                        onSelect={() => {
                          haptic()
                          setSubjectId(s.id)
                          setTaskId(undefined)
                        }}
                      />
                    ))}
                    <ChoiceRow
                      selected={subjectId === null}
                      color="var(--c-ink-3)"
                      label="Estudio libre"
                      onSelect={() => {
                        haptic()
                        setSubjectId(null)
                        setTaskId(undefined)
                      }}
                    />
                  </ul>

                  <AnimatePresence initial={false}>
                    {pending.length > 0 && (
                      <motion.div
                        key={subjectId ?? 'libre'}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ ...spring.smooth, bounce: 0 }}
                        className="overflow-hidden"
                      >
                        <p className="eyebrow px-3 mt-4 mb-1.5">Tarea concreta (opcional)</p>
                        <ul className="flex flex-col">
                          {pending.map((t) => (
                            <ChoiceRow
                              key={t.id}
                              selected={taskId === t.id}
                              label={t.title}
                              onSelect={() => {
                                haptic()
                                setTaskId(taskId === t.id ? undefined : t.id)
                              }}
                            />
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4 pt-2">
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!seat || subjectId === undefined}
              onClick={() => {
                if (!seat || subjectId === undefined) return
                haptic('success')
                onDone({
                  seat: seat.label,
                  cabin: seat.cabin,
                  subjectId: subjectId ?? undefined,
                  taskId,
                })
              }}
            >
              {!seat
                ? 'Elige un asiento'
                : subjectId === undefined
                  ? 'Elige qué estudiar'
                  : 'Emitir tarjeta de embarque'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ChoiceRow({
  selected,
  color,
  label,
  onSelect,
}: {
  selected: boolean
  color?: string
  label: string
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cx(
          'w-full flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150',
          selected ? 'bg-[var(--glass-tint)]' : 'hover:bg-[var(--glass-tint)]',
        )}
      >
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ background: color ?? 'transparent' }}
        />
        <span className={cx('flex-1 min-w-0 truncate text-[0.9375rem]', selected && 'font-semibold')}>
          {label}
        </span>
        <span
          className={cx(
            'grid place-items-center size-5 rounded-full shrink-0 bg-accent-fill text-white transition-transform duration-200',
            selected ? 'scale-100' : 'scale-0',
          )}
        >
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// El avión
// ---------------------------------------------------------------------------

/**
 * Fuselaje visto desde arriba: morro ojival con dos parabrisas curvos y la
 * cabina debajo, ancha, con asientos grandes en 2 + 2 y el número de fila en
 * el pasillo. El cuerpo sigue por debajo de la pantalla y se desplaza.
 *
 * El morro es un SVG que se estira al ancho del cuerpo; el cuerpo es HTML
 * (una rejilla), así los asientos son botones de verdad y escalan con él.
 */
function Fuselage({
  taken,
  selected,
  color,
  onPick,
}: {
  taken: Set<string>
  selected: string | null
  color: string
  onPick: (spot: SeatSpot) => void
}) {
  return (
    <div className="fuselage-v3 relative" role="group" aria-label="Plano de asientos">
      {/* Morro */}
      <svg viewBox="0 0 400 330" className="block w-full h-auto" aria-hidden>
        <defs>
          <linearGradient id="fs-cuerpo" x1="0" x2="1">
            <stop offset="0" className="fs-edge" />
            <stop offset="0.13" className="fs-mid" />
            <stop offset="0.87" className="fs-mid" />
            <stop offset="1" className="fs-edge" />
          </linearGradient>
          <radialGradient id="fs-brillo" cx="0.5" cy="0.18" r="0.55">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M0 330 C0 168 84 16 200 3 C316 16 400 168 400 330 Z" fill="url(#fs-cuerpo)" />
        <path d="M0 330 C0 168 84 16 200 3 C316 16 400 168 400 330 Z" fill="url(#fs-brillo)" className="fs-shine" />
        {/* Parabrisas: dos paneles curvos, más altos junto al centro */}
        <path d="M124 146 C140 126 162 114 192 109 L192 138 C166 141 145 149 127 160 Z" className="fs-glass" />
        <path d="M276 146 C260 126 238 114 208 109 L208 138 C234 141 255 149 273 160 Z" className="fs-glass" />
      </svg>

      {/* Cabina */}
      <div className="fs-body -mt-px pb-10">
        <div className="fs-grid px-[13%]">
          {['A', 'C', '', 'D', 'F'].map((l, i) => (
            <span key={i} className="fs-letter">
              {l}
            </span>
          ))}
        </div>

        {ROWS.map((row, i) => (
          <div key={row}>
            {row === BUSINESS_UNTIL + 1 && (
              <div className="fs-divider" aria-hidden>
                <span>Turista</span>
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.smooth, delay: 0.25 + i * 0.03 }}
              className={cx('fs-grid px-[13%] relative', row <= BUSINESS_UNTIL ? 'mb-4' : 'mb-3', row === EXIT_ROW && 'is-exit')}
            >
              {LETTERS.slice(0, 2).map((letter) => (
                <Seat
                  key={letter}
                  spot={SEATS.find((s) => s.row === row && s.letter === letter)!}
                  taken={taken}
                  selected={selected}
                  color={color}
                  onPick={onPick}
                />
              ))}
              <span className="fs-row">{String(row).padStart(2, '0')}</span>
              {LETTERS.slice(2).map((letter) => (
                <Seat
                  key={letter}
                  spot={SEATS.find((s) => s.row === row && s.letter === letter)!}
                  taken={taken}
                  selected={selected}
                  color={color}
                  onPick={onPick}
                />
              ))}
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Seat({
  spot,
  taken,
  selected,
  color,
  onPick,
}: {
  spot: SeatSpot
  taken: Set<string>
  selected: string | null
  color: string
  onPick: (spot: SeatSpot) => void
}) {
  const isTaken = taken.has(spot.label)
  const isSelected = selected === spot.label
  return (
    <motion.button
      type="button"
      disabled={isTaken}
      aria-pressed={isSelected}
      aria-label={`Asiento ${spot.label}, ${spot.cabin}, ${seatKind(spot.letter)}${isTaken ? ', ocupado' : ''}`}
      onClick={() => onPick(spot)}
      whileTap={isTaken ? undefined : { scale: 0.9 }}
      animate={{ scale: isSelected ? 1.06 : 1 }}
      transition={spring.bouncy}
      className={cx(
        'fs-seat',
        spot.cabin === 'Preferente' && 'is-business',
        isTaken && 'is-taken',
        isSelected && 'is-selected',
      )}
      style={isSelected ? ({ '--seat': color } as React.CSSProperties) : undefined}
    >
      <AnimatePresence>
        {isSelected && (
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={spring.bouncy}
            className="absolute inset-0 grid place-items-center"
          >
            <Check className="size-[42%] text-white" strokeWidth={3.2} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
