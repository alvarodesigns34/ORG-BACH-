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
// Distribución de la cabina (coordenadas del dibujo, viewBox 700 × 1120)
// ---------------------------------------------------------------------------

interface SeatSpot {
  label: string
  row: number
  letter: string
  x: number
  y: number
  w: number
  h: number
  cabin: SeatChoice['cabin']
}

const CX = 350
const BUSINESS_ROWS = [1, 2]
const ECONOMY_ROWS = [3, 4, 5, 6, 7, 8, 9, 10]
/** Filas junto a las salidas sobre el ala: un poco más de espacio delante. */
const EXIT_ROW = 8

function rowY(row: number): number {
  if (row <= 2) return 300 + (row - 1) * 84
  return 506 + (row - 3) * 64 + (row >= EXIT_ROW ? 16 : 0)
}

function layout(): SeatSpot[] {
  const out: SeatSpot[] = []
  // Preferente: 2 + 2, asientos anchos.
  for (const row of BUSINESS_ROWS) {
    const y = rowY(row)
    const w = 54
    const h = 60
    const spots: [string, number][] = [
      ['A', CX - 30 - 2 * w - 10],
      ['C', CX - 30 - w],
      ['D', CX + 30],
      ['F', CX + 30 + w + 10],
    ]
    for (const [letter, x] of spots) {
      out.push({ label: `0${row}${letter}`, row, letter, x, y, w, h, cabin: 'Preferente' })
    }
  }
  // Turista: 3 + 3.
  for (const row of ECONOMY_ROWS) {
    const y = rowY(row)
    const w = 38
    const h = 44
    const xs = [
      CX - 26 - 3 * w - 8,
      CX - 26 - 2 * w - 4,
      CX - 26 - w,
      CX + 26,
      CX + 26 + w + 4,
      CX + 26 + 2 * w + 8,
    ]
    ;['A', 'B', 'C', 'D', 'E', 'F'].forEach((letter, k) => {
      out.push({
        label: `${String(row).padStart(2, '0')}${letter}`,
        row,
        letter,
        x: xs[k],
        y,
        w,
        h,
        cabin: 'Turista',
      })
    })
  }
  return out
}

const SEATS = layout()

function seatKind(letter: string): string {
  if (letter === 'A' || letter === 'F') return 'Ventanilla'
  if (letter === 'B' || letter === 'E') return 'Centro'
  return 'Pasillo'
}

/** Algunos asientos ocupados, siempre los mismos para un mismo vuelo. */
function occupied(seed: string): Set<string> {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out = new Set<string>()
  for (const s of SEATS) {
    h = (h * 1664525 + 1013904223) >>> 0
    if ((h >>> 24) % 100 < (s.cabin === 'Preferente' ? 25 : 38)) out.add(s.label)
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
      className="study-veil absolute inset-0 z-20 flex items-center justify-center gap-[clamp(1.5rem,4vw,4rem)] px-6"
    >
      {/* --- El avión --- */}
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={spring.smooth}
        className="relative shrink-0"
        style={{ height: 'min(calc(100dvh - 3rem), calc((100vw - 30rem) * 1.6), 900px)' }}
      >
        <PlaneDrawing
          taken={taken}
          selected={seat?.label ?? null}
          color={color}
          onPick={(spot) => {
            haptic()
            setSeat(spot)
          }}
        />
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
                    Preferente delante, Turista detrás. Los asientos oscuros ya están ocupados.
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
// El dibujo
// ---------------------------------------------------------------------------

/**
 * Avión visto desde arriba: morro con parabrisas, ventanillas, alas con
 * motores y la cabina con sus asientos. Los colores salen del tema (clases en
 * study.css), así que sirve igual en claro que en oscuro.
 */
function PlaneDrawing({
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
  const windowsY = Array.from({ length: 14 }, (_, i) => 318 + i * 54)
  const exitY = rowY(EXIT_ROW) - 12
  return (
    <svg
      viewBox="0 0 700 1120"
      className="plane-drawing h-full w-auto"
      role="group"
      aria-label="Plano de asientos"
    >
      <defs>
        <linearGradient id="pd-fuselaje" x1="0" x2="1">
          <stop offset="0" className="pd-edge" />
          <stop offset="0.12" className="pd-body" />
          <stop offset="0.88" className="pd-body" />
          <stop offset="1" className="pd-edge" />
        </linearGradient>
        <linearGradient id="pd-ala" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="pd-body" />
          <stop offset="1" className="pd-edge" />
        </linearGradient>
        <linearGradient id="pd-fundido" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.8" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="pd-mascara">
          <rect width="700" height="1120" fill="url(#pd-fundido)" />
        </mask>
      </defs>

      <g mask="url(#pd-mascara)">
        {/* Alas en flecha y motores, por detrás del fuselaje */}
        <path d="M188 740 L18 940 Q8 958 26 962 L70 964 L188 880 Z" fill="url(#pd-ala)" className="pd-line" />
        <path d="M512 740 L682 940 Q692 958 674 962 L630 964 L512 880 Z" fill="url(#pd-ala)" className="pd-line" />
        <rect x="88" y="826" width="40" height="88" rx="18" className="pd-engine" />
        <rect x="572" y="826" width="40" height="88" rx="18" className="pd-engine" />

        {/* Fuselaje */}
        <path
          d="M186 1120 L186 340 C186 170 262 56 350 32 C438 56 514 170 514 340 L514 1120 Z"
          fill="url(#pd-fuselaje)"
          className="pd-line"
        />

        {/* Parabrisas */}
        <g className="pd-glass">
          <path d="M306 150 Q328 128 346 122 L346 160 L310 168 Z" />
          <path d="M394 150 Q372 128 354 122 L354 160 L390 168 Z" />
          <path d="M292 177 L306 171 L304 199 L288 204 Z" />
          <path d="M408 177 L394 171 L396 199 L412 204 Z" />
        </g>

        {/* Ventanillas */}
        {windowsY.map((y) => (
          <g key={y} className="pd-window">
            <rect x="190" y={y} width="5" height="16" rx="2.5" />
            <rect x="505" y={y} width="5" height="16" rx="2.5" />
          </g>
        ))}

        {/* Cabinas */}
        <text x={CX} y="278" textAnchor="middle" className="pd-caption">
          PREFERENTE
        </text>
        <line x1="214" x2="486" y1="474" y2="474" className="pd-divider" />
        <text x={CX} y="494" textAnchor="middle" className="pd-caption">
          TURISTA
        </text>

        {/* Salidas de emergencia sobre el ala */}
        <g className="pd-exit">
          <path d={`M180 ${exitY} l-12 7 l12 7 Z`} />
          <path d={`M520 ${exitY} l12 7 l-12 7 Z`} />
        </g>

        {/* Asientos */}
        {SEATS.map((s) => {
          const isTaken = taken.has(s.label)
          const isSelected = selected === s.label
          const big = s.cabin === 'Preferente'
          return (
            <g
              key={s.label}
              role="button"
              tabIndex={isTaken ? -1 : 0}
              aria-label={`Asiento ${s.label}, ${s.cabin}, ${seatKind(s.letter)}${isTaken ? ', ocupado' : ''}`}
              aria-pressed={isSelected}
              aria-disabled={isTaken}
              onClick={() => !isTaken && onPick(s)}
              onKeyDown={(e) => {
                if (!isTaken && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onPick(s)
                }
              }}
              className={cx('pd-seat', isTaken ? 'is-taken' : 'is-free', isSelected && 'is-selected')}
              style={
                {
                  '--seat': color,
                  transformOrigin: `${s.x + s.w / 2}px ${s.y + s.h / 2}px`,
                } as React.CSSProperties
              }
            >
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={big ? 15 : 10} className="pd-seat-base" />
              <rect
                x={s.x + 4}
                y={s.y + 4}
                width={s.w - 8}
                height={big ? 15 : 11}
                rx={big ? 7 : 5}
                className="pd-seat-back"
              />
              <path
                d={`M${s.x + s.w / 2 - 7} ${s.y + s.h / 2 + 5} l5 5 l10 -11`}
                className="pd-seat-check"
              />
            </g>
          )
        })}

        {/* Números de fila, en el pasillo */}
        {[...BUSINESS_ROWS, ...ECONOMY_ROWS].map((row) => (
          <text
            key={row}
            x={CX}
            y={rowY(row) + (row <= 2 ? 37 : 28)}
            textAnchor="middle"
            className="pd-row"
          >
            {row}
          </text>
        ))}
      </g>
    </svg>
  )
}
