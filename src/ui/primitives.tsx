import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { animate, m as motion, useReducedMotion } from 'motion/react'

import { haptic, spring } from './motion'

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
  ghost: 'bg-transparent text-accent hover:bg-fill',
  danger: 'bg-transparent text-danger hover:bg-danger-quiet',
  dangerFill: 'bg-danger text-white hover:brightness-110',
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
          ? 'bg-transparent text-ink-2 hover:bg-fill hover:text-ink'
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
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.02em]">{title}</h2>
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
        <h2 className="text-[1.375rem] font-bold tracking-[-0.022em] leading-tight">{title}</h2>
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
        'inline-flex items-center rounded-full px-2 py-0.5',
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
  // El indicador es UN elemento compartido entre opciones (`layoutId`): al
  // cambiar, Motion lo lleva de un botón a otro con un muelle, midiendo los
  // dos, así que se desliza bien aunque las etiquetas tengan anchos distintos.
  const track = useRef<HTMLDivElement>(null)
  const thumbId = useId()

  // El activo siempre a la vista si la tira se desplaza.
  useEffect(() => {
    track.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value])

  return (
    <motion.div
      ref={track}
      layoutScroll
      role="radiogroup"
      aria-label={label}
      className={cx(
        'relative inline-flex items-center p-[3px] rounded-full bg-fill',
        'overflow-x-auto no-scrollbar max-w-full',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="radio"
            type="button"
            aria-checked={active}
            onClick={() => {
              if (!active) haptic()
              onChange(option.value)
            }}
            className={cx(
              'relative shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap',
              'transition-colors duration-200',
              size === 'sm' ? 'h-7 px-3 text-[0.75rem]' : 'h-8 px-3.5 text-[0.8125rem]',
              active ? 'text-ink font-semibold' : 'text-ink-2 font-medium hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={thumbId}
                transition={spring.snappy}
                className="lens absolute inset-0 rounded-full"
              />
            )}
            <span className="relative">{option.label}</span>
            {option.count !== undefined && (
              <span className="relative tabular-nums text-[0.6875rem] font-semibold text-ink-3">
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </motion.div>
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
    <div className={cx('flex flex-col items-center text-center py-12 px-6', className)}>
      {icon && (
        <div className="flex items-center justify-center rounded-full mb-4 bg-accent-quiet text-accent size-14">
          {icon}
        </div>
      )}
      <p className="font-semibold text-ink text-base">{title}</p>
      <p className="text-ink-3 mt-1.5 text-balance text-[0.875rem] max-w-[46ch]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
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
