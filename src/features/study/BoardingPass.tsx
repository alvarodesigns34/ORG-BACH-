import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Plane, PlaneTakeoff } from 'lucide-react'

import { barcode, formatFlightTime, type Airport } from '@/domain/flights'
import { colorVar, quietVar } from '@/domain/palette'
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
  cabin: 'Preferente' | 'Turista'
  /** «Directo», «10 min», «2 × 10 min». */
  layover: string
  subject?: Subject
  task?: Task
}

/** Puerta de embarque: inventada pero estable para cada tarjeta. */
function gate(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `${'ABCDEK'[h % 6]}${(h >>> 8) % 40 + 1}`
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

  const date = new Date().toLocaleDateString('es', { day: '2-digit', month: 'short' })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      className="study-veil absolute inset-0 z-20 flex flex-col items-center justify-center gap-6"
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
        className="w-[380px] drop-shadow-[0_30px_60px_rgb(0_0_0/0.25)]"
      >
        {/* Cuerpo */}
        <div className="pass-body relative rounded-t-[26px] bg-surface overflow-hidden">
          <div aria-hidden className="pass-texture absolute inset-0 pointer-events-none" />
          {/* Cabecera: «compañía» y clase, con el color de la asignatura. */}
          <div
            className="relative flex items-center justify-between px-6 py-3 text-white"
            style={{
              background: pass.subject
                ? `linear-gradient(90deg, color-mix(in srgb, ${colorVar(pass.subject.color)} 62%, #000), color-mix(in srgb, ${colorVar(pass.subject.color)} 82%, #000))`
                : 'linear-gradient(90deg, #003f8a, #0064d2)',
            }}
          >
            <span className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-wide">
              <Plane className="size-4 rotate-45" strokeWidth={2.4} />
              Tarjeta de embarque
            </span>
            <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em] opacity-90">
              {pass.cabin}
            </span>
          </div>

          <div className="relative px-6 pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[2.75rem] font-bold leading-none tracking-tight">{pass.from.iata}</p>
                <p className="text-[0.8125rem] text-ink-3 mt-1.5">{pass.from.city}</p>
              </div>
              <div className="flex flex-col items-center pt-3 text-ink-3 flex-1 px-3">
                <div className="w-full flex items-center gap-1.5">
                  <span className="flex-1 border-t-2 border-dotted border-hairline-strong" />
                  <Plane className="size-4 rotate-45 shrink-0" strokeWidth={2.2} />
                  <span className="flex-1 border-t-2 border-dotted border-hairline-strong" />
                </div>
                <span className="text-[0.6875rem] font-semibold tabular-nums mt-1.5">
                  {formatFlightTime(pass.minutes)}
                </span>
              </div>
              <div className="text-right">
                <p className="font-mono text-[2.75rem] font-bold leading-none tracking-tight">{pass.to.iata}</p>
                <p className="text-[0.8125rem] text-ink-3 mt-1.5">{pass.to.city}</p>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-4 gap-y-3.5 mt-6">
              <Field label="Asiento" value={pass.seat} />
              <Field label="Puerta" value={gate(pass.id)} />
              <Field label="Embarque" value="Ahora" align="right" />
              <Field label="Distancia" value={`${Math.round(pass.km).toLocaleString('es')} km`} />
              <Field label="Escala" value={pass.layover} />
              <Field label="Fecha" value={date} align="right" />
            </dl>

            <div className="mt-5 flex items-center gap-3 rounded-[14px] bg-[var(--c-sunken)] px-3.5 py-3">
              <span
                className="w-1 self-stretch rounded-full shrink-0"
                style={{ background: pass.subject ? colorVar(pass.subject.color) : 'var(--c-ink-3)' }}
              />
              <span className="min-w-0">
                <span className="block text-[0.6875rem] font-medium text-ink-3">Vas a estudiar</span>
                <span className="block text-[0.9375rem] font-semibold truncate">
                  {pass.subject?.name ?? 'Estudio libre'}
                </span>
                {pass.task && <span className="block text-[0.75rem] text-ink-2 truncate">{pass.task.title}</span>}
              </span>
            </div>
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
              className="rounded-b-[26px] bg-surface px-6 pt-1 pb-5"
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
        className="w-[380px]"
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

/** Pantalla de cabina antes de despegar: la ruta, luces de pista y «Despegar». */
export function Takeoff({
  from,
  to,
  minutes,
  onGo,
  onCancel,
  quick,
}: {
  from: Airport
  to: Airport
  minutes: number
  onGo: () => void
  onCancel: () => void
  /**
   * Despegue rápido: no se pasó por el asiento, así que aquí se puede decir
   * (o no) qué se va a estudiar.
   */
  quick?: {
    subjects: Subject[]
    subjectId?: string
    onSubject: (id: string | undefined) => void
  }
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.7 } }}
      className="absolute inset-0 z-30 grid place-items-center bg-[#050608]/92 backdrop-blur-xl text-white"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.2 }}
        className="flex flex-col items-center text-center px-6"
      >
        <p className="flex items-center gap-3 font-mono text-[0.9375rem] font-bold tracking-[0.2em] text-white/55">
          {from.iata}
          <Plane className="size-3.5 rotate-45" strokeWidth={2.4} />
          {to.iata}
        </p>
        {quick && (
          <p className="mt-2 text-[0.9375rem] text-white/55">
            {to.city} · {formatFlightTime(minutes)}
          </p>
        )}

        {/* Luces de pista que se encienden hacia delante. */}
        <div aria-hidden className="flex gap-3 mt-10 mb-10">
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className="runway-light size-1.5 rounded-full bg-white"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>

        <p className="text-[1.75rem] font-semibold leading-snug tracking-[-0.02em]">
          Puertas cerradas.
          <br />
          <span className="text-white/60">Listos para despegar.</span>
        </p>

        {quick && quick.subjects.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Qué vas a estudiar"
            data-theme="dark"
            className="mt-8 flex flex-wrap justify-center gap-1.5 max-w-[34rem]"
          >
            {[undefined, ...quick.subjects].map((subject) => {
              const active = quick.subjectId === subject?.id
              return (
                <button
                  key={subject?.id ?? 'libre'}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    haptic()
                    quick.onSubject(subject?.id)
                  }}
                  className="pressable h-9 px-3.5 rounded-full text-[0.8125rem] font-semibold transition-colors"
                  style={
                    active
                      ? subject
                        ? { background: quietVar(subject.color), color: colorVar(subject.color) }
                        : { background: '#fff', color: '#000' }
                      : { background: 'rgb(255 255 255 / 0.1)', color: 'rgb(255 255 255 / 0.7)' }
                  }
                >
                  {subject ? subject.shortName || subject.name : 'Estudio libre'}
                </button>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onGo}
          autoFocus
          className="pressable mt-10 h-14 px-12 rounded-full bg-white text-black text-[1.0625rem] font-semibold shadow-[0_10px_40px_rgb(255_255_255/0.15)]"
        >
          Despegar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 text-[0.875rem] font-medium text-white/45 hover:text-white/75 transition-colors"
        >
          {quick ? 'Cancelar' : 'Volver a la tarjeta'}
        </button>
      </motion.div>
    </motion.div>
  )
}

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
