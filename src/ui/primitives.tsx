import { useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { animate, m as motion, useReducedMotion } from 'motion/react'

import { haptic, spring } from './motion'
import { createLiquidIndicator, type LiquidIndicator } from './liquid'

import { colorVar, quietVar } from '@/domain/palette'
import type { Priority, Subject } from '@/domain/types'

/** Une clases ignorando falsos, para no llenar el JSX de ternarios sueltos. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerFill'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'glass-tinted text-accent-ink hover:brightness-[1.08]',
  // Botón de cristal: el control secundario de iOS 26.
  secondary: 'glass-btn text-ink',
  ghost: 'liquid-press bg-transparent text-accent hover:bg-fill',
  danger: 'bg-transparent text-danger hover:bg-danger-quiet',
  dangerFill: 'bg-[var(--c-danger-fill)] text-white hover:brightness-110',
}

const SIZES: Record<ButtonSize, string> = {
  // Cápsulas, como los botones de iOS 26. 36 px de alto mínimo: el dedo acierta.
  sm: 'h-9 px-3.5 text-[0.8125rem] gap-1.5 rounded-full',
  md: 'h-11 px-5 text-[0.9375rem] gap-2 rounded-full',
  lg: 'h-[3.25rem] px-6 text-[1rem] gap-2 rounded-full',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Ocupa todo el ancho disponible. Útil en móvil. */
  block?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'pressable inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obligatorio: un botón que solo muestra un icono necesita nombre accesible. */
  label: string
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'pressable inline-flex items-center justify-center rounded-full shrink-0',
        'disabled:pointer-events-none disabled:opacity-40',
        variant === 'ghost'
          ? 'liquid-press bg-transparent text-ink-2 hover:bg-fill hover:text-ink'
          : VARIANTS[variant],
        size === 'sm' ? 'size-9' : 'size-11',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Superficies
// ---------------------------------------------------------------------------

interface CardProps {
  children: ReactNode
  className?: string
  /** Sin relleno interior, para tarjetas que gestionan su propio espaciado. */
  flush?: boolean
  /** Ancla para enlazar a la tarjeta (`#/ajustes?seccion=cuenta`). */
  id?: string
}

export function Card({ children, className, flush, id }: CardProps) {
  return (
    <section id={id} className={cx('card scroll-mt-20', !flush && 'p-5 sm:p-6', className)}>
      {children}
    </section>
  )
}

interface SectionHeaderProps {
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, hint, action, className }: SectionHeaderProps) {
  return (
    <header className={cx('flex items-baseline justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.012em]">{title}</h2>
        {hint && <p className="text-[0.8125rem] text-ink-3 mt-0.5">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

/**
 * Título de un grupo de filas, FUERA de la tarjeta, como en las listas
 * agrupadas de iOS («Hoy» … «Ver todas»).
 */
export function GroupTitle({
  title,
  hint,
  action,
  className,
}: {
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-end justify-between gap-4 px-1 mb-2.5', className)}>
      <div className="min-w-0">
        <h2 className="text-[1.375rem] font-bold tracking-[-0.014em] leading-tight">{title}</h2>
        {hint && <p className="text-[0.8125rem] text-ink-3 mt-0.5">{hint}</p>}
      </div>
      {action && <div className="shrink-0 pb-0.5">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

export function SubjectTag({ subject, className }: { subject?: Subject; className?: string }) {
  if (!subject) {
    return (
      <span
        className={cx(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
          'bg-fill text-ink-3',
          className,
        )}
      >
        Sin asignatura
      </span>
    )
  }
  return (
    <span
      className={cx(
        'tag-glass inline-flex items-center rounded-full px-2 py-0.5',
        'text-[0.6875rem] font-semibold whitespace-nowrap',
        className,
      )}
      style={{ background: quietVar(subject.color), color: colorVar(subject.color) }}
    >
      {subject.shortName || subject.name}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Prioridad
// ---------------------------------------------------------------------------

const PRIORITY_LEVEL: Record<Priority, number> = { baja: 1, media: 2, alta: 3, urgente: 4 }
const PRIORITY_COLOR: Record<Priority, string> = {
  baja: 'var(--c-ink-3)',
  media: 'var(--c-accent)',
  alta: 'var(--c-warn)',
  urgente: 'var(--c-danger)',
}
export const PRIORITY_LABEL: Record<Priority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
}

/**
 * Prioridad como barras crecientes.
 *
 * La altura de las barras codifica el nivel, así que la información sobrevive
 * al daltonismo y a una captura en blanco y negro; el color solo refuerza.
 */
export function PriorityMark({ priority, className }: { priority: Priority; className?: string }) {
  const level = PRIORITY_LEVEL[priority]
  const color = PRIORITY_COLOR[priority]
  return (
    <span
      className={cx('inline-flex items-end gap-[2px] h-3', className)}
      role="img"
      aria-label={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}
      title={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className="w-[3px] rounded-[1px] transition-colors duration-150"
          style={{
            height: `${4 + bar * 3}px`,
            background: level - 1 >= bar ? color : 'var(--c-hairline-strong)',
          }}
        />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------

interface ProgressProps {
  /** 0-100. */
  value: number
  className?: string
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
  /** Color propio (el de una asignatura); manda sobre `tone`. */
  color?: string
  label?: string
}

const PROGRESS_TONE = {
  accent: 'var(--c-accent)',
  ok: 'var(--c-ok)',
  warn: 'var(--c-warn)',
  danger: 'var(--c-danger)',
}

export function Progress({ value, className, tone = 'accent', color, label }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cx('h-1.5 rounded-full bg-fill overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {/* Crece desde cero al aparecer, y con muelle si cambia después. */}
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ ...spring.smooth, visualDuration: 0.7, bounce: 0 }}
        style={{ background: color ?? PROGRESS_TONE[tone] }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selector segmentado
// ---------------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  // Una sola lente de cristal que viaja entre opciones con un muelle propio
  // (ui/liquid.ts) y se estira según su velocidad. Se puede ARRASTRAR, como
  // en iOS 26: se agarra la opción activa, se desliza y al soltar se elige la
  // más cercana.
  const track = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLSpanElement>(null)
  const lens = useRef<LiquidIndicator | null>(null)
  const drag = useRef<{ id: number; startX: number; fromX: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const boxOf = (button: HTMLElement | null | undefined) =>
    button ? { x: button.offsetLeft, w: button.offsetWidth } : null

  const activeButton = () =>
    track.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? null

  useLayoutEffect(() => {
    if (!lensRef.current) return
    lens.current = createLiquidIndicator(lensRef.current)
    return () => lens.current?.destroy()
  }, [])

  useLayoutEffect(() => {
    const box = boxOf(activeButton())
    if (box) lens.current?.to(box)
    activeButton()?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [value, options.length])

  // Si cambia el ancho (fuente, contador, giro), la lente se recoloca sin animar.
  useEffect(() => {
    const el = track.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const box = boxOf(activeButton())
      if (box && !drag.current) lens.current?.to(box, true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const buttons = () => Array.from(track.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      className={cx(
        'segmented relative inline-flex items-center p-[3px] rounded-full',
        'overflow-x-auto no-scrollbar max-w-full',
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const target = (event.target as Element).closest<HTMLElement>('[role="radio"]')
        if (!target) return
        lens.current?.press(true)
        if (target.getAttribute('aria-checked') === 'true') {
          drag.current = { id: event.pointerId, startX: event.clientX, fromX: target.offsetLeft, moved: false }
          track.current?.setPointerCapture?.(event.pointerId)
        }
      }}
      onPointerMove={(event) => {
        const d = drag.current
        if (!d || d.id !== event.pointerId) return
        const dx = event.clientX - d.startX
        if (!d.moved && Math.abs(dx) < 4) return
        d.moved = true
        const list = buttons()
        const first = list[0]
        const lastBtn = list[list.length - 1]
        const active = activeButton()
        if (!first || !lastBtn || !active) return
        const min = first.offsetLeft
        const max = lastBtn.offsetLeft + lastBtn.offsetWidth - active.offsetWidth
        const raw = d.fromX + dx
        // Más allá de los extremos, resistencia elástica.
        const over = raw < min ? raw - min : raw > max ? raw - max : 0
        const x = Math.min(max, Math.max(min, raw)) + (over ? Math.sign(over) * 14 * (1 - 1 / (Math.abs(over) / 14 + 1)) : 0)
        lens.current?.drag(x)
      }}
      onPointerUp={(event) => {
        const d = drag.current
        drag.current = null
        lens.current?.press(false)
        if (!d || d.id !== event.pointerId || !d.moved) return
        suppressClick.current = true
        const active = activeButton()
        const center = d.fromX + (event.clientX - d.startX) + (active?.offsetWidth ?? 0) / 2
        let best: HTMLElement | null = null
        let bestDist = Infinity
        for (const b of buttons()) {
          const dist = Math.abs(b.offsetLeft + b.offsetWidth / 2 - center)
          if (dist < bestDist) {
            bestDist = dist
            best = b
          }
        }
        const next = options.find((o) => o.value === best?.dataset.value)
        if (next && next.value !== value) {
          haptic()
          onChange(next.value)
        } else {
          const box = boxOf(active)
          if (box) lens.current?.to(box)
        }
      }}
      onPointerCancel={() => {
        drag.current = null
        lens.current?.press(false)
        const box = boxOf(activeButton())
        if (box) lens.current?.to(box)
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.stopPropagation()
          event.preventDefault()
        }
      }}
    >
      <span ref={lensRef} aria-hidden className="lens liquid-lens absolute left-0 top-[3px] bottom-[3px] rounded-full pointer-events-none" />
      {options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="radio"
            type="button"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={option.value}
            data-liquid="off"
            onClick={() => {
              if (!active) haptic()
              onChange(option.value)
            }}
            onKeyDown={(e) => {
              let nextIndex: number | null = null
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                nextIndex = (index + 1) % options.length
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                nextIndex = (index - 1 + options.length) % options.length
              } else if (e.key === 'Home') {
                nextIndex = 0
              } else if (e.key === 'End') {
                nextIndex = options.length - 1
              }
              if (nextIndex === null) return
              e.preventDefault()
              const next = options[nextIndex]
              if (next && next.value !== value) {
                haptic()
                onChange(next.value)
              }
              buttons()[nextIndex]?.focus()
            }}
            className={cx(
              'relative shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap',
              'transition-colors duration-200',
              active && 'touch-pan-y cursor-grab active:cursor-grabbing',
              size === 'sm' ? 'h-7 px-3 text-[0.75rem]' : 'h-9 px-4 text-[0.875rem]',
              active ? 'text-ink font-semibold' : 'text-ink-2 font-medium hover:text-ink',
            )}
          >
            <span className="relative">{option.label}</span>
            {option.count !== undefined && (
              <span className="relative tabular-nums text-[0.6875rem] font-semibold text-ink-3">
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estados vacíos
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
  /** Versión reducida, para huecos dentro de una tarjeta. */
  compact?: boolean
}

/**
 * Un hueco sin datos tiene que explicar qué falta y ofrecer el primer paso.
 * Una pantalla en blanco es un callejón sin salida.
 *
 * - Normal: centrado, para una pantalla entera vacía.
 * - `compact`: una fila (icono, dos líneas y la acción a la derecha) para un
 *   hueco dentro de una pantalla que ya tiene otras cosas. Ocupa lo que una
 *   fila de lista, no media pantalla.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div
        className={cx(
          'flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5 py-4',
          className,
        )}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1 basis-[16rem]">
          {icon && (
            <div className="grid place-items-center size-10 rounded-[12px] shrink-0 bg-accent-quiet text-accent">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold text-ink leading-snug">{title}</p>
            <p className="text-[0.8125rem] text-ink-3 mt-0.5 leading-snug text-pretty">{description}</p>
          </div>
        </div>
        {action && <div className="shrink-0 flex flex-wrap gap-2">{action}</div>}
      </div>
    )
  }
  return (
    // «Sin contenido» de iOS (ContentUnavailableView): un símbolo grande en
    // gris, sin fondo, un título en negrita y la acción en cápsula.
    <div className={cx('flex flex-col items-center text-center py-14 px-6', className)}>
      {icon && (
        <div className="animate-pop mb-4 text-ink-3 [&_svg]:!size-12 [&_svg]:[stroke-width:1.6]">
          {icon}
        </div>
      )}
      <p className="display text-ink text-[1.375rem] leading-tight">{title}</p>
      <p className="text-ink-3 mt-2 text-balance text-[0.9375rem] max-w-[46ch]">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cifras
// ---------------------------------------------------------------------------

/**
 * Una cifra académica: redondeada (SF Pro Rounded en Apple), tabular y con la
 * unidad en tamaño menor.
 * `tabular-nums` evita que el número se mueva al actualizarse.
 */
export function Numeral({
  value,
  suffix,
  size = 'md',
  tone,
  className,
}: {
  value: string
  suffix?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'ok' | 'warn' | 'danger' | 'accent'
  className?: string
}) {
  const sizes = {
    sm: 'text-[1.375rem]',
    md: 'text-[1.875rem]',
    lg: 'text-[2.625rem]',
    xl: 'text-[3.5rem]',
  }
  const tones = {
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
    accent: 'text-accent',
  }
  return (
    <span
      className={cx(
        'numeral inline-flex items-baseline gap-1',
        sizes[size],
        tone && tones[tone],
        className,
      )}
    >
      {value}
      {suffix && <span className="text-[0.5em] font-semibold text-ink-3">{suffix}</span>}
    </span>
  )
}

/**
 * Número que rueda hasta su nuevo valor cuando cambia.
 *
 * No anima al montarse: una cifra que cuenta desde cero cada vez que se abre
 * la sección cansa a la tercera. Solo se mueve cuando el dato cambia de
 * verdad (entra una nota, se completa una tarea), que es cuando el movimiento
 * informa.
 */
export function CountUp({
  value,
  format,
}: {
  value: number | null
  format: (value: number | null) => string
}) {
  const node = useRef<HTMLSpanElement>(null)
  const previous = useRef(value)
  const reduce = useReducedMotion()

  useEffect(() => {
    const from = previous.current
    previous.current = value
    if (reduce || from === null || value === null || from === value || !node.current) return
    const el = node.current
    const controls = animate(from, value, {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        el.textContent = format(latest)
      },
      onComplete: () => {
        el.textContent = format(value)
      },
    })
    return () => controls.stop()
    // `format` suele ser una función en línea; no debe relanzar la animación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce])

  return <span ref={node}>{format(value)}</span>
}
