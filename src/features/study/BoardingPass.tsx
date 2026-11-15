import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Plane, PlaneTakeoff } from 'lucide-react'

import { barcode, formatFlightTime, type Airport } from '@/domain/flights'
import { colorVar } from '@/domain/palette'
import type { Subject, Task } from '@/domain/types'
import { haptic, spring } from '@/ui/motion'
import { Button, IconButton } from '@/ui/primitives'

export interface PassData {
  id: string
  from: Airport
  to: Airport
  km: number
  minutes: number
  seat: string
  subject?: Subject
  task?: Task
}

/**
 * La tarjeta de embarque. «Embarcar» la rasga por la línea perforada: el
 * resguardo con el código de barras cae, con un toque háptico, y se pasa a
 * cabina.
 */
export function BoardingPass({
  pass,
  onBack,
  onBoard,
}: {
  pass: PassData
  onBack: () => void
  onBoard: () => void
}) {
  const [torn, setTorn] = useState(false)

  const board = () => {
    if (torn) return
    setTorn(true)
    haptic('success')
    window.setTimeout(onBoard, reduced() ? 0 : 900)
  }

  const date = new Date().toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[color-mix(in_srgb,var(--c-canvas)_35%,transparent)]"
    >
      <div className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]">
        <IconButton label="Cambiar asiento" onClick={onBack} className="liquid" disabled={torn}>
          <ChevronLeft className="relative z-[2] size-5" strokeWidth={2.4} />
        </IconButton>
      </div>

      <motion.div
        initial={{ y: 140, opacity: 0, rotate: -2 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={spring.smooth}
        className="w-[360px] drop-shadow-[0_24px_48px_rgb(0_0_0/0.22)]"
      >
        {/* Cuerpo */}
        <div className="pass-body relative rounded-t-[24px] bg-surface px-6 pt-6 pb-5 overflow-hidden">
          <div aria-hidden className="pass-texture absolute inset-0 pointer-events-none" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="font-mono text-[2.5rem] font-bold leading-none tracking-tight">
                {pass.from.iata}
              </p>
              <p className="text-[0.8125rem] text-ink-3 mt-1.5">{pass.from.city}</p>
            </div>
            <div className="flex flex-col items-center pt-2.5 text-ink-3">
              <Plane className="size-4 rotate-45" strokeWidth={2.2} />
              <span className="text-[0.6875rem] font-semibold tabular-nums mt-1">
                {formatFlightTime(pass.minutes)}
              </span>
            </div>
            <div className="text-right">
              <p className="font-mono text-[2.5rem] font-bold leading-none tracking-tight">
                {pass.to.iata}
              </p>
              <p className="text-[0.8125rem] text-ink-3 mt-1.5">{pass.to.city}</p>
            </div>
          </div>

          <dl className="relative grid grid-cols-2 gap-x-6 gap-y-3 mt-6">
            <Field label="Asiento" value={pass.seat} />
            <Field label="Distancia" value={`${Math.round(pass.km).toLocaleString('es')} km`} align="right" />
            <Field label="Embarque" value="Ahora" />
            <Field label="Fecha" value={date} align="right" />
          </dl>

          <div className="relative mt-5 flex items-center gap-2.5 rounded-[14px] bg-[var(--c-sunken)] px-3 py-2.5">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: pass.subject ? colorVar(pass.subject.color) : 'var(--c-ink-3)' }}
            />
            <span className="min-w-0">
              <span className="block text-[0.875rem] font-semibold truncate">
                {pass.subject?.name ?? 'Estudio libre'}
              </span>
              {pass.task && (
                <span className="block text-[0.75rem] text-ink-3 truncate">{pass.task.title}</span>
              )}
            </span>
          </div>
        </div>

        {/* Perforado */}
        <div aria-hidden className="pass-perforation relative h-5 bg-surface" />

        {/* Resguardo */}
        <AnimatePresence>
          {!torn ? (
            <motion.div
              key="resguardo"
              exit={{
                y: 360,
                x: 30,
                rotate: 11,
                opacity: 0,
                transition: { duration: 0.85, ease: [0.45, 0, 0.9, 0.55] },
              }}
              className="rounded-b-[24px] bg-surface px-6 pt-1 pb-5"
            >
              <Barcode id={pass.id} />
            </motion.div>
          ) : (
            <div key="hueco" className="h-0" />
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: torn ? 0 : 1, y: 0 }}
        transition={{ ...spring.smooth, delay: torn ? 0 : 0.18 }}
        className="w-[360px]"
      >
        <Button variant="primary" size="lg" block onClick={board} disabled={torn}>
          <PlaneTakeoff className="size-[18px]" strokeWidth={2.3} />
          Embarcar
        </Button>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, value, align }: { label: string; value: string; align?: 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : undefined}>
      <dt className="text-[0.6875rem] font-medium text-ink-3">{label}</dt>
      <dd className="font-mono text-[0.9375rem] font-semibold tabular-nums mt-0.5">{value}</dd>
    </div>
  )
}

function Barcode({ id }: { id: string }) {
  const bars = barcode(id, 58)
  let x = 0
  const rects = bars.map((w, i) => {
    const rect = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={44} /> : null
    x += w
    return rect
  })
  return (
    <svg
      viewBox={`0 0 ${x} 44`}
      preserveAspectRatio="none"
      className="w-full h-12 text-ink"
      fill="currentColor"
      aria-label="Código de embarque"
      role="img"
    >
      {rects}
    </svg>
  )
}

/** Pantalla de cabina antes de despegar. */
export function Takeoff({ onGo, onCancel }: { onGo: () => void; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
      className="absolute inset-0 z-30 grid place-items-center bg-black/88 backdrop-blur-md text-white"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.25 }}
        className="flex flex-col items-center text-center"
      >
        <PlaneTakeoff className="size-7 text-white/90" strokeWidth={2} />
        <p className="mt-5 text-[1.5rem] font-semibold leading-snug tracking-[-0.02em]">
          Puertas cerradas.
          <br />
          Listos para despegar.
        </p>
        <button
          type="button"
          onClick={onGo}
          className="pressable mt-9 h-12 px-10 rounded-full bg-white text-black text-[1rem] font-semibold"
        >
          Despegar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 text-[0.875rem] font-medium text-white/55 hover:text-white/80"
        >
          Volver a la tarjeta
        </button>
      </motion.div>
    </motion.div>
  )
}

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
