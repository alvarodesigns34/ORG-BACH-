import { useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Check } from 'lucide-react'

import { sanitizeNumericInput } from '@/domain/number'
import { cx } from './primitives'

/** Estilo común a todo control de formulario, para que no deriven entre sí. */
const CONTROL = [
  'w-full bg-raised text-ink rounded-sm border border-hairline-strong',
  'px-3 text-[0.875rem] placeholder:text-ink-3/70',
  'transition-[border-color,box-shadow] duration-150',
  'hover:border-ink-3/45',
  'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/18',
  'disabled:opacity-50 disabled:pointer-events-none',
].join(' ')

// ---------------------------------------------------------------------------
// Envoltorio de campo
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string
  children: (props: { id: string; describedBy?: string }) => ReactNode
  hint?: string
  error?: string | null
  required?: boolean
  className?: string
  /** Oculta la etiqueta visualmente pero la mantiene para lectores de pantalla. */
  hideLabel?: boolean
}

export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
  hideLabel,
}: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cx(
          'text-[0.8125rem] font-medium text-ink-2',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>

      {children({ id, describedBy })}

      {error ? (
        <p id={errorId} role="alert" className="text-[0.75rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[0.75rem] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, 'h-10', className)} {...props} />
}

export function Textarea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cx(CONTROL, 'py-2.5 resize-y min-h-20', className)} {...props} />
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx(
          CONTROL,
          'h-10 appearance-none pr-9 cursor-pointer',
          // El bloque select nativo no hereda la fuente en algunos navegadores.
          'font-sans',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-3 text-ink-3"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/**
 * Campo numérico con unidad opcional a la derecha.
 *
 * Deliberadamente NO usa `type="number"`: ese control rechaza la coma decimal
 * en la mayoría de navegadores, y en España «8,5» es la forma natural de
 * escribir una nota. Con `type="text"` e `inputMode="decimal"` el teclado del
 * móvil sigue siendo numérico, la coma se acepta y `parseDecimal` la entiende.
 */
export function NumberInput({
  className,
  suffix,
  onChange,
  // `step` solo tiene efecto en type="number"; se descarta para no dejar un
  // atributo que promete un comportamiento que no existe.
  step: _step,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cx(CONTROL, 'h-10 tabular-nums', suffix && 'pr-10', className)}
        onChange={(event) => {
          if (!onChange) return
          const cleaned = sanitizeNumericInput(event.target.value)
          if (cleaned !== event.target.value) event.target.value = cleaned
          onChange(event)
        }}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Casilla
// ---------------------------------------------------------------------------

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** Muestra solo la casilla; la etiqueta pasa a ser el nombre accesible. */
  hideLabel?: boolean
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Casilla propia en lugar de la nativa: la del sistema no acepta el color de
 * acento con contraste suficiente en modo oscuro y su tamaño no se puede
 * ajustar de forma fiable entre navegadores.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  hideLabel,
  className,
  size = 'md',
}: CheckboxProps) {
  const box = size === 'sm' ? 'size-[17px]' : 'size-[19px]'
  return (
    <label
      className={cx(
        'group inline-flex items-center gap-2.5 cursor-pointer select-none',
        // Zona táctil cómoda aunque la casilla dibujada sea pequeña.
        hideLabel && 'p-1.5 -m-1.5',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
        aria-label={hideLabel ? label : undefined}
      />
      <span
        aria-hidden
        className={cx(
          box,
          'grid place-items-center rounded-xs border shrink-0',
          'transition-[background-color,border-color] duration-150',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2',
          checked
            ? 'bg-accent border-accent text-accent-ink'
            : 'bg-raised border-hairline-strong group-hover:border-ink-3',
        )}
      >
        <Check
          className={cx(
            size === 'sm' ? 'size-3' : 'size-3.5',
            'transition-opacity duration-150',
            checked ? 'opacity-100' : 'opacity-0',
          )}
          strokeWidth={3}
        />
      </span>
      {!hideLabel && <span className="text-[0.875rem] text-ink">{label}</span>}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Conmutador
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.875rem] font-medium text-ink cursor-pointer">
          {label}
        </label>
        {description && <p className="text-[0.8125rem] text-ink-3 mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 mt-0.5',
          checked ? 'bg-accent' : 'bg-hairline-strong',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'absolute top-0.5 size-5 rounded-full bg-raised shadow-xs',
            'transition-transform duration-200 ease-out',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
