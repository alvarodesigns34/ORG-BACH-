import { useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'

import { parseDecimal, sanitizeNumericInput, toDecimalInput } from '@/domain/number'

import { SwitchControl } from './fields'
import { cx } from './primitives'

/**
 * Listas agrupadas, como las de Ajustes de iOS.
 *
 * Una lista es una tarjeta con filas; cada fila lleva a la izquierda un icono
 * en un cuadrado de color y la etiqueta, y a la derecha el valor, un control
 * o un chevron. Los separadores empiezan donde empieza el texto.
 */

export function ListGroup({
  header,
  footer,
  children,
  id,
  className,
}: {
  header?: string
  footer?: ReactNode
  children: ReactNode
  /** Ancla para enlazar al grupo (`#/ajustes?seccion=cuenta`). */
  id?: string
  className?: string
}) {
  return (
    <section id={id} className={cx('scroll-mt-20', className)}>
      {header && (
        <h2 className="px-4 mb-1.5 text-[0.8125rem] font-medium uppercase tracking-[0.02em] text-ink-3">
          {header}
        </h2>
      )}
      <ul className="card overflow-hidden">{children}</ul>
      {footer && (
        <div className="px-4 mt-1.5 text-[0.8125rem] leading-snug text-ink-3">{footer}</div>
      )}
    </section>
  )
}

interface RowProps {
  icon?: LucideIcon
  /** Color del cuadrado del icono. */
  tint?: string
  label: ReactNode
  /** Segunda línea bajo la etiqueta. */
  detail?: ReactNode
  /** Texto a la derecha (gris). */
  value?: ReactNode
  /** Control a la derecha: interruptor, campo, selector. */
  accessory?: ReactNode
  /** Fila pulsable: se pinta como botón con chevron (salvo `action`). */
  onClick?: () => void
  href?: string
  /** Fila de acción: texto en color, sin chevron (Exportar, Cerrar sesión). */
  action?: 'accent' | 'danger'
  disabled?: boolean
  /** Asocia la etiqueta a un control del accesorio. */
  htmlFor?: string
}

export function ListRow({
  icon: Icon,
  tint,
  label,
  detail,
  value,
  accessory,
  onClick,
  href,
  action,
  disabled,
  htmlFor,
}: RowProps) {
  const interactive = !!onClick || !!href
  const body = (
    <>
      {Icon && (
        <span
          aria-hidden
          className="grid place-items-center size-[29px] rounded-[7px] text-white shrink-0"
          style={{ background: tint ?? 'var(--c-ink-3)' }}
        >
          <Icon className="size-[17px]" strokeWidth={2.2} />
        </span>
      )}
      <span
        className={cx(
          'list-row-body flex-1 min-w-0 flex items-center gap-3 min-h-[2.875rem] py-2 pr-4',
        )}
      >
        <span className="flex-1 min-w-0">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="block text-[1rem] text-ink cursor-pointer">
              {label}
            </label>
          ) : (
            <span
              className={cx(
                'block text-[1rem] leading-snug',
                action === 'accent' && 'text-accent',
                action === 'danger' && 'text-danger',
                !action && 'text-ink',
              )}
            >
              {label}
            </span>
          )}
          {detail && <span className="block text-[0.8125rem] text-ink-3 mt-0.5">{detail}</span>}
        </span>
        {value !== undefined && (
          <span className="shrink-0 max-w-[55%] truncate text-[1rem] text-ink-3 tabular-nums">
            {value}
          </span>
        )}
        {accessory && <span className="shrink-0 flex items-center">{accessory}</span>}
        {interactive && !action && (
          <ChevronRight className="size-4 text-ink-3 shrink-0 -mr-1" strokeWidth={2.6} />
        )}
      </span>
    </>
  )

  const rowClass = cx(
    'list-row flex items-center gap-3 pl-4 w-full text-left',
    interactive && 'transition-colors duration-150 active:bg-fill hover:bg-fill/50',
    disabled && 'opacity-45 pointer-events-none',
  )

  return (
    <li className="list-item" data-icon={Icon ? '' : undefined}>
      {href ? (
        <a href={href} className={rowClass}>
          {body}
        </a>
      ) : onClick ? (
        <button type="button" onClick={onClick} disabled={disabled} className={rowClass}>
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  )
}

/** Campo de texto alineado a la derecha, sin caja: el de las filas de iOS. */
export function RowInput({
  label,
  value,
  onChange,
  placeholder,
  icon,
  tint,
  inputMode,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  icon?: LucideIcon
  tint?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  type?: string
}) {
  const id = useId()
  return (
    <ListRow
      icon={icon}
      tint={tint}
      label={label}
      htmlFor={id}
      accessory={
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-[11rem] max-w-[48vw] bg-transparent text-right text-[1rem] text-ink-3 focus:text-ink placeholder:text-ink-3/70 outline-none focus-visible:outline-none"
        />
      }
    />
  )
}

/** Selector nativo alineado a la derecha, con el valor en gris y ⌃⌄. */
export function RowSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  icon,
  tint,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  icon?: LucideIcon
  tint?: string
}) {
  const id = useId()
  return (
    <ListRow
      icon={icon}
      tint={tint}
      label={label}
      htmlFor={id}
      accessory={
        <span className="relative flex items-center">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
            className="appearance-none bg-transparent text-right text-[1rem] text-ink-3 pr-5 cursor-pointer outline-none focus-visible:text-accent max-w-[52vw] truncate font-sans"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 10 16"
            className="pointer-events-none absolute right-0 h-3.5 w-2.5 text-ink-3"
          >
            <path
              d="M2 6l3-3 3 3M2 10l3 3 3-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      }
    />
  )
}

/** Fila con interruptor a la derecha. */
export function RowSwitch({
  label,
  detail,
  checked,
  onChange,
  icon,
  tint,
  disabled,
}: {
  label: string
  detail?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  icon?: LucideIcon
  tint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <ListRow
      icon={icon}
      tint={tint}
      label={label}
      detail={detail}
      htmlFor={id}
      accessory={
        <SwitchControl id={id} checked={checked} onChange={onChange} disabled={disabled} />
      }
    />
  )
}

/**
 * Número editable en una fila (minutos, días, nota máxima). Guarda el
 * borrador mientras se escribe y confirma al salir, para no comerse la coma
 * decimal a medio teclear (ver `NumberField`).
 */
export function RowNumber({
  label,
  value,
  onCommit,
  min,
  max,
  integer,
  suffix,
  fallback,
  icon,
  tint,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  integer?: boolean
  suffix?: string
  fallback?: number
  icon?: LucideIcon
  tint?: string
}) {
  const id = useId()
  return (
    <ListRow
      icon={icon}
      tint={tint}
      label={label}
      htmlFor={id}
      accessory={
        <span className="flex items-center gap-1.5 text-[1rem] text-ink-3">
          <BareNumber
            id={id}
            value={value}
            onCommit={onCommit}
            min={min}
            max={max}
            integer={integer}
            fallback={fallback}
          />
          {suffix && <span>{suffix}</span>}
        </span>
      }
    />
  )
}

function BareNumber({
  id,
  value,
  onCommit,
  min,
  max,
  integer,
  fallback,
}: {
  id: string
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  integer?: boolean
  fallback?: number
}) {
  const [draft, setDraft] = useState(() => toDecimalInput(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(toDecimalInput(value))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const parsed = parseDecimal(draft)
    let next = Number.isFinite(parsed) ? parsed : (fallback ?? value)
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    if (integer) next = Math.round(next)
    setDraft(toDecimalInput(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(sanitizeNumericInput(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className="w-14 bg-transparent text-right tabular-nums text-ink-3 focus:text-ink outline-none"
    />
  )
}
