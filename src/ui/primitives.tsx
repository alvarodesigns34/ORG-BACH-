import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'

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
  primary: 'bg-accent-fill text-accent-ink hover:brightness-[1.08] shadow-xs',
  secondary: 'bg-fill text-ink hover:bg-[color-mix(in_srgb,var(--c-fill)_100%,var(--c-ink)_4%)]',
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
  label?: string
}

const PROGRESS_TONE = {
  accent: 'var(--c-accent)',
  ok: 'var(--c-ok)',
  warn: 'var(--c-warn)',
  danger: 'var(--c-danger)',
}

export function Progress({ value, className, tone = 'accent', label }: ProgressProps) {
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
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-[var(--spring)]"
        style={{ width: `${pct}%`, background: PROGRESS_TONE[tone] }}
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
  // El indicador se mide sobre el botón activo real, así que se desliza bien
  // aunque las etiquetas tengan anchos distintos o haya que desplazarse.
  const track = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const node = track.current
    if (!node) return
    const measure = () => {
      const active = node.querySelector<HTMLElement>('[aria-checked="true"]')
      if (!active) return setThumb(null)
      setThumb({ left: active.offsetLeft, width: active.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [value, options.length])

  // El activo siempre a la vista si la tira se desplaza.
  useEffect(() => {
    track.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value])

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      className={cx(
        'relative inline-flex items-center p-[3px] rounded-full bg-fill',
        'overflow-x-auto no-scrollbar max-w-full',
        className,
      )}
    >
      {thumb && (
        <span
          aria-hidden
          className="absolute top-[3px] bottom-[3px] left-0 rounded-full bg-raised shadow-sm transition-[transform,width] duration-500 ease-[var(--spring)]"
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="radio"
            type="button"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'relative z-[1] shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap',
              'transition-colors duration-200',
              size === 'sm' ? 'h-7 px-3 text-[0.75rem]' : 'h-8 px-3.5 text-[0.8125rem]',
              active ? 'text-ink font-semibold' : 'text-ink-2 font-medium hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="tabular-nums text-[0.6875rem] font-semibold text-ink-3">
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
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
    >
      {icon && (
        <div
          className={cx(
            'flex items-center justify-center rounded-full mb-4',
            'bg-accent-quiet text-accent',
            compact ? 'size-10' : 'size-14',
          )}
        >
          {icon}
        </div>
      )}
      <p className={cx('font-semibold text-ink', compact ? 'text-[0.875rem]' : 'text-base')}>
        {title}
      </p>
      <p
        className={cx(
          'text-ink-3 mt-1.5 text-balance',
          compact ? 'text-[0.8125rem] max-w-[34ch]' : 'text-[0.875rem] max-w-[46ch]',
        )}
      >
        {description}
      </p>
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
