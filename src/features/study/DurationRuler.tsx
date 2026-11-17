import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { haptic } from '@/ui/motion'
import { cx } from '@/ui/primitives'

/** Píxeles por minuto: 8 px deja los tramos de 5 minutos cómodos al dedo. */
const PX = 8

function label(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m}`
}

/**
 * Regla vertical de duración. Se desplaza con inercia nativa (dedo, rueda,
 * trackpad) y la marca central dice el tiempo elegido: arriba, menos; abajo,
 * más. Un toque háptico cada 5 minutos, como una rueda de iOS.
 *
 * Si el valor cambia desde fuera (se toca un destino), la regla se desliza
 * hasta él sola.
 */
export function DurationRuler({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (minutes: number) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  // Último valor que salió de la propia regla: lo que llegue distinto viene
  // de fuera y hay que desplazarse hasta él.
  const emitted = useRef(value)
  const lastTick = useRef(Math.floor(value / 5))
  const ready = useRef(false)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(el.clientHeight))
    observer.observe(el)
    setHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  // Posición inicial, sin animar.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !height || ready.current) return
    el.scrollTop = (value - min) * PX
    ready.current = true
  }, [height, value, min])

  useEffect(() => {
    const el = scroller.current
    if (!el || !ready.current || value === emitted.current) return
    emitted.current = value
    // Un preset o destino cambia el valor de una vez. Un desplazamiento
    // animado emitiría de vuelta valores intermedios como si fueran del dedo.
    el.scrollTop = (value - min) * PX
    lastTick.current = Math.floor(value / 5)
  }, [value, min])

  const onScroll = () => {
    const el = scroller.current
    if (!el || !ready.current) return
    const next = Math.min(max, Math.max(min, min + Math.round(el.scrollTop / PX)))
    const tick = Math.floor(next / 5)
    if (tick !== lastTick.current) {
      lastTick.current = tick
      haptic()
    }
    if (next !== emitted.current) {
      emitted.current = next
      onChange(next)
    }
  }

  const marks: number[] = []
  for (let m = Math.ceil(min / 5) * 5; m <= max; m += 5) marks.push(m)

  return (
    <div className="relative h-full select-none">
      {/* Marca central: el tiempo elegido. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex items-center"
      >
        <span className="size-0 border-y-[6px] border-y-transparent border-l-[7px] border-l-accent-fill" />
        <span className="w-4 h-[2.5px] rounded-full bg-accent-fill" />
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        role="slider"
        tabIndex={0}
        aria-label="Duración del vuelo"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={label(value)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 15 : 5
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault()
            onChange(Math.min(max, value + step))
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault()
            onChange(Math.max(min, value - step))
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            onChange(event.key === 'Home' ? min : max)
          }
        }}
        className="ruler h-full overflow-y-auto no-scrollbar overscroll-contain rounded-[14px] outline-none"
        style={{ paddingBlock: height / 2 }}
      >
        <div className="relative" style={{ height: (max - min) * PX }}>
          {marks.map((m) => {
            const hour = m % 60 === 0
            const quarter = m % 15 === 0
            return (
              <div
                key={m}
                className="absolute left-0 right-0 flex items-center gap-1.5"
                style={{ top: (m - min) * PX, transform: 'translateY(-50%)' }}
              >
                <span
                  className={cx(
                    'h-px rounded-full shrink-0',
                    hour ? 'w-5 bg-ink-2' : quarter ? 'w-3.5 bg-ink-3' : 'w-2 bg-ink-3/50',
                  )}
                />
                {quarter && (
                  <span
                    className={cx(
                      'text-[0.6875rem] tabular-nums whitespace-nowrap',
                      hour ? 'font-semibold text-ink-2' : 'text-ink-3',
                    )}
                  >
                    {label(m)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
