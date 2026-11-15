import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  Check,
  ChevronLeft,
  LocateFixed,
  Pause,
  Plane,
  PlaneLanding,
  Play,
  Route,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

import { formatFlightTime, type Airport } from '@/domain/flights'
import { colorVar, quietVar } from '@/domain/palette'
import type { FocusSession, Subject, Task } from '@/domain/types'
import { haptic, spring } from '@/ui/motion'
import { Button, cx } from '@/ui/primitives'

function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cx('liquid', className)}>
      <div className="relative z-[2] contents">{children}</div>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'pressable relative z-[2] grid place-items-center size-11 rounded-full transition-colors',
        active ? 'text-accent' : 'text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** «1 h 05 min» con cifras grandes y unidades pequeñas. Segundos al final. */
function BigTime({ ms }: { ms: number }) {
  const total = Math.ceil(ms / 1000)
  if (total < 60) {
    return (
      <span className="numeral text-[2.25rem]">
        {total}
        <span className="text-[0.9375rem] font-semibold text-ink-3 ml-1">s</span>
      </span>
    )
  }
  const minutes = Math.ceil(total / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return (
    <span className="numeral text-[2.25rem]">
      {h > 0 && (
        <>
          {h}
          <span className="text-[0.9375rem] font-semibold text-ink-3 ml-1 mr-2">h</span>
        </>
      )}
      {h > 0 ? String(m).padStart(2, '0') : m}
      <span className="text-[0.9375rem] font-semibold text-ink-3 ml-1">min</span>
    </span>
  )
}

export function FlightHud({
  session,
  from,
  to,
  subject,
  remainingMs,
  remainingKm,
  progress,
  following,
  soundOn,
  onExit,
  onFollow,
  onOverview,
  onSound,
  onPause,
  onAbandon,
}: {
  session: FocusSession
  from: Airport
  to: Airport
  subject?: Subject
  remainingMs: number
  remainingKm: number
  progress: number
  following: boolean
  soundOn: boolean
  onExit: () => void
  onFollow: () => void
  onOverview: () => void
  onSound: () => void
  onPause: () => void
  onAbandon: () => void
}) {
  const paused = !!session.pausedAt

  return (
    <>
      {/* Arriba a la izquierda: salir (el vuelo sigue). */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.4 }}
        className="absolute z-10 left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]"
      >
        <Glass className="rounded-full">
          <RoundButton label="Salir (el vuelo sigue en el aire)" onClick={onExit}>
            <ChevronLeft className="size-5" strokeWidth={2.4} />
          </RoundButton>
        </Glass>
      </motion.div>

      {/* Arriba al centro: la ruta. */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.5 }}
        className="absolute z-10 left-1/2 -translate-x-1/2 top-[max(1rem,env(safe-area-inset-top))]"
      >
        <Glass className="rounded-full flex items-center gap-2.5 h-11 pl-4 pr-3">
          <span className="relative z-[2] font-mono text-[0.9375rem] font-bold">{from.iata}</span>
          <Plane className="relative z-[2] size-3.5 rotate-45 text-ink-3" strokeWidth={2.4} />
          <span className="relative z-[2] font-mono text-[0.9375rem] font-bold">{to.iata}</span>
          <span
            className="relative z-[2] ml-1 inline-flex items-center h-7 px-2.5 rounded-full text-[0.75rem] font-semibold"
            style={
              subject
                ? { background: quietVar(subject.color), color: colorVar(subject.color) }
                : { background: 'var(--c-fill)', color: 'var(--c-ink-2)' }
            }
          >
            {subject ? subject.shortName || subject.name : 'Estudio libre'}
          </span>
        </Glass>
      </motion.div>

      {/* Derecha: cámara y sonido. */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring.smooth, delay: 0.55 }}
        className="absolute z-10 right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))]"
      >
        <Glass className="rounded-full flex flex-col p-0.5">
          <RoundButton label="Seguir al avión" onClick={onFollow} active={following}>
            <LocateFixed className="size-[19px]" strokeWidth={2.2} />
          </RoundButton>
          <RoundButton label="Ver la ruta entera" onClick={onOverview}>
            <Route className="size-[19px]" strokeWidth={2.2} />
          </RoundButton>
          <RoundButton label={soundOn ? 'Silenciar cabina' : 'Sonido de cabina'} onClick={onSound} active={soundOn}>
            {soundOn ? (
              <Volume2 className="size-[19px]" strokeWidth={2.2} />
            ) : (
              <VolumeX className="size-[19px]" strokeWidth={2.2} />
            )}
          </RoundButton>
        </Glass>
      </motion.div>

      {/* Abajo: el estado del vuelo. */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.6 }}
        className="absolute z-10 left-1/2 -translate-x-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] w-[min(720px,calc(100vw-2rem))]"
      >
        <Glass className="rounded-[28px] overflow-hidden">
          <div className="relative z-[2] h-[3px] bg-[var(--glass-tint)]">
            <motion.div
              className="h-full bg-accent-fill"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>
          <div className="relative z-[2] grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-4">
            <div>
              <p className="text-[0.75rem] font-medium text-ink-3 mb-1.5">
                {paused ? 'En pausa' : 'Tiempo restante'}
              </p>
              <BigTime ms={remainingMs} />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={paused ? 'Reanudar' : 'Pausar'}
                onClick={onPause}
                className="pressable grid place-items-center size-14 rounded-full bg-ink text-canvas"
              >
                {paused ? (
                  <Play className="size-6 translate-x-px" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Pause className="size-6" fill="currentColor" strokeWidth={0} />
                )}
              </button>
              <HoldToAbandon onConfirm={onAbandon} />
            </div>

            <div className="text-right">
              <p className="text-[0.75rem] font-medium text-ink-3 mb-1.5">Distancia restante</p>
              <span className="numeral text-[2.25rem]">
                {Math.round(remainingKm).toLocaleString('es')}
                <span className="text-[0.9375rem] font-semibold text-ink-3 ml-1">km</span>
              </span>
            </div>
          </div>
        </Glass>
      </motion.div>
    </>
  )
}

/**
 * Abandonar exige mantener pulsado: un anillo se completa en 1,2 s. Soltar
 * antes no hace nada. Así un toque sin querer no tira la sesión.
 */
function HoldToAbandon({ onConfirm }: { onConfirm: () => void }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)

  const stop = () => {
    setHolding(false)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])

  return (
    <button
      type="button"
      aria-label="Mantén pulsado para abandonar el vuelo"
      title="Mantén pulsado para abandonar"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        setHolding(true)
        haptic()
        timer.current = window.setTimeout(() => {
          stop()
          haptic('success')
          onConfirm()
        }, 1200)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        // Con teclado: Mayús + Intro, para que no sea un accidente.
        if (e.key === 'Enter' && e.shiftKey) onConfirm()
      }}
      className="relative grid place-items-center size-11 rounded-full bg-[var(--glass-tint)] text-ink-2 touch-none select-none"
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="22"
          cy="22"
          r="20"
          fill="none"
          stroke="var(--c-danger)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          style={{
            opacity: holding ? 1 : 0,
            strokeDashoffset: holding ? 0 : 1,
            transition: holding ? 'stroke-dashoffset 1.2s linear' : 'stroke-dashoffset 0.25s ease-out',
          }}
        />
      </svg>
      <X className={cx('size-5 transition-colors', holding && 'text-danger')} strokeWidth={2.4} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Aterrizaje
// ---------------------------------------------------------------------------

export function LandedCard({
  session,
  to,
  subject,
  task,
  onCompleteTask,
  onAgain,
  onDone,
}: {
  session: FocusSession
  to: Airport
  subject?: Subject
  task?: Task
  onCompleteTask: () => void
  onAgain: () => void
  onDone: () => void
}) {
  const landedAt = session.endedAt
    ? new Date(session.endedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : ''
  const taskDone = task?.status === 'completada'

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      transition={{ ...spring.smooth, delay: 0.5 }}
      className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] w-[min(440px,calc(100vw-2rem))]"
    >
      <div className="liquid rounded-[30px] p-6">
        <div className="relative z-[2]">
          <span className="tile grid place-items-center size-11 rounded-[14px] text-white" style={{ background: 'linear-gradient(180deg, #5ac8fa, #0071e3)' }}>
            <PlaneLanding className="size-[22px]" strokeWidth={2.2} />
          </span>
          <h2 className="display text-[1.75rem] leading-tight mt-4">Bienvenido a {to.city}</h2>
          <p className="text-[0.9375rem] text-ink-3 mt-1">Has aterrizado a las {landedAt}.</p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <Fact value={formatFlightTime(session.focusedMinutes ?? session.plannedMinutes)} label="Estudiado" />
            <Fact value={`${Math.round(session.distanceKm).toLocaleString('es')} km`} label="Volado" />
            <Fact
              value={subject ? subject.shortName || subject.name : 'Libre'}
              label="Asignatura"
              color={subject ? colorVar(subject.color) : undefined}
            />
          </div>

          {task && (
            <button
              type="button"
              onClick={onCompleteTask}
              disabled={taskDone}
              className="pressable mt-3 w-full flex items-center gap-3 rounded-[16px] bg-[var(--glass-tint)] px-3.5 py-3 text-left disabled:opacity-100"
            >
              <span
                className={cx(
                  'grid place-items-center size-6 rounded-full border-2 shrink-0 transition-colors',
                  taskDone ? 'bg-[var(--c-switch-on)] border-transparent text-white' : 'border-ink-3/50',
                )}
              >
                {taskDone && <Check className="size-3.5" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-semibold truncate">{task.title}</span>
                <span className="block text-[0.75rem] text-ink-3">
                  {taskDone ? 'Tarea completada' : 'Marcar como hecha'}
                </span>
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 mt-5">
            <Button onClick={onDone}>Terminar</Button>
            <Button variant="primary" onClick={onAgain}>
              Seguir volando
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function Fact({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="rounded-[16px] bg-[var(--glass-tint)] px-3 py-2.5 min-w-0">
      <p className="text-[1rem] font-semibold tabular-nums truncate" style={color ? { color } : undefined}>
        {value}
      </p>
      <p className="text-[0.6875rem] font-medium text-ink-3 mt-0.5">{label}</p>
    </div>
  )
}
