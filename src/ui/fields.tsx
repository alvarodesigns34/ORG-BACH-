import { useEffect, useId, useState } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { parseDecimal, sanitizeNumericInput, toDecimalInput } from '@/domain/number'
import { haptic } from './motion'
import { cx } from './primitives'

/** Estilo común a todo control de formulario, para que no deriven entre sí. */
const CONTROL = [
  'w-full min-w-0 bg-fill text-ink rounded-[12px] border border-transparent',
  'px-3.5 text-[1rem] placeholder:text-ink-3',
  'transition-[border-color,box-shadow,background-color] duration-200',
  'focus:outline-none focus:bg-raised focus:border-accent focus:ring-4 focus:ring-accent/15',
  'aria-[invalid=true]:border-danger',
  'disabled:opacity-50 disabled:pointer-events-none',
].join(' ')

/**
 * Control dentro de una fila de formulario agrupado (estilo Ajustes de iOS):
 * sin caja ni relleno, el valor alineado a la derecha y en gris secundario,
 * como «Calendario › Nuevo evento». La fila entera es la superficie.
 */
const ROW_CONTROL = [
  'w-full min-w-0 bg-transparent border-0 text-right text-[1rem] text-ink-2 h-11',
  'placeholder:text-ink-3 focus:outline-none focus:text-ink',
  'aria-[invalid=true]:text-danger',
  'disabled:opacity-50 disabled:pointer-events-none',
].join(' ')

export type ControlVariant = 'box' | 'row' | 'title'

function controlClass(variant: ControlVariant = 'box'): string {
  if (variant === 'row') return ROW_CONTROL
  if (variant === 'title')
    return 'w-full min-w-0 bg-transparent border-0 px-4 h-[3.25rem] text-[1.0625rem] font-medium text-ink placeholder:text-ink-3 placeholder:font-normal focus:outline-none aria-[invalid=true]:placeholder:text-danger'
  return cx(CONTROL, 'h-11')
}

// ---------------------------------------------------------------------------
// Envoltorio de campo
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string
  children: (props: {
    id: string
    describedBy?: string
    required?: boolean
    invalid?: boolean
  }) => ReactNode
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
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div data-field className={cx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cx('text-[0.8125rem] font-semibold text-ink-2', hideLabel && 'sr-only')}
      >
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>

      {children({ id, describedBy, required, invalid: !!error })}

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

export function Input({
  className,
  variant,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { variant?: ControlVariant }) {
  const date = variant === 'row' && (props.type === 'date' || props.type === 'time')
  return (
    <input
      className={cx(date ? 'row-date' : controlClass(variant), className)}
      {...props}
      onClick={
        date
          ? (event) => {
              props.onClick?.(event)
              // La cápsula no lleva el icono del calendario: tocarla entera
              // abre el selector también en el ordenador.
              try {
                event.currentTarget.showPicker?.()
              } catch {
                /* Safari antiguo o el selector ya abierto */
              }
            }
          : props.onClick
      }
    />
  )
}

export function Textarea({
  className,
  rows = 3,
  variant,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { variant?: ControlVariant }) {
  return (
    <textarea
      rows={rows}
      className={cx(
        variant === 'row'
          ? 'w-full bg-transparent border-0 px-4 py-3 text-[1rem] text-ink placeholder:text-ink-3 resize-none min-h-[5.25rem] focus:outline-none'
          : cx(CONTROL, 'py-2.5 resize-y min-h-20'),
        className,
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Formulario agrupado (filas de iOS)
// ---------------------------------------------------------------------------

/**
 * Grupo de filas con esquinas redondeadas, como las secciones de un
 * formulario de iOS: cabecera opcional encima, nota al pie debajo.
 */
export function FormGroup({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('flex flex-col gap-1.5', className)}>
      {header && <h3 className="px-4 text-[0.8125rem] font-medium text-ink-3">{header}</h3>}
      <div className="form-group">{children}</div>
      {footer && <div className="px-4 text-[0.75rem] leading-snug text-ink-3">{footer}</div>}
    </section>
  )
}

/**
 * Fila de formulario: etiqueta a la izquierda y valor a la derecha. Con
 * `bare` no se pinta la etiqueta (queda para lectores de pantalla) y el
 * control ocupa toda la fila: título, notas.
 */
export function FormRow({
  label,
  children,
  hint,
  error,
  required,
  bare,
  className,
}: Omit<FieldProps, 'hideLabel'> & { bare?: boolean }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div data-field className={cx('form-row', className)}>
      {bare ? (
        <>
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          {children({ id, describedBy, required, invalid: !!error })}
        </>
      ) : (
        <div className="flex items-center gap-3 pl-4 pr-3 min-h-11">
          <label htmlFor={id} className="shrink-0 text-[1rem] text-ink">
            {label}
          </label>
          <div className="flex-1 min-w-0 flex items-center justify-end">
            {children({ id, describedBy, required, invalid: !!error })}
          </div>
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="px-4 pb-2.5 -mt-0.5 text-[0.75rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="px-4 pb-2.5 -mt-0.5 text-[0.75rem] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Select({
  className,
  children,
  pill,
  active,
  variant,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  /** 'row': valor a la derecha dentro de una fila de formulario agrupado. */
  variant?: ControlVariant
  /** Píldora compacta para filas de filtros. */
  pill?: boolean
  /** En modo píldora: hay un filtro aplicado. */
  active?: boolean
}) {
  if (variant === 'row') {
    return (
      <div className="relative flex items-center min-w-0 max-w-full">
        <select
          className={cx(ROW_CONTROL, 'row-select appearance-none cursor-pointer pr-5 font-sans', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 12 16"
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-3.5 text-ink-3"
        >
          <path
            d="M3 6 6 3l3 3M3 10l3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }
  return (
    <div className={cx('relative', pill && 'shrink-0')}>
      <select
        className={cx(
          pill
            ? cx(
                'pressable h-10 rounded-full pl-4 pr-9 text-[0.875rem] max-sm:text-[1rem] whitespace-nowrap',
                'appearance-none cursor-pointer',
                'focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20',
                // Filtro de iOS 26: una cápsula de cristal; aplicado, tintada.
                active
                  ? 'filter-on text-accent font-semibold'
                  : 'glass-btn text-ink font-medium',
              )
            : cx(CONTROL, 'h-11 appearance-none pr-9 cursor-pointer'),
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
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 size-3',
          pill ? 'right-3.5' : 'right-3.5',
          active ? 'text-accent' : 'text-ink-3',
        )}
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
  variant,
  onChange,
  // `step` solo tiene efecto en type="number"; se descarta para no dejar un
  // atributo que promete un comportamiento que no existe.
  step: _step,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { suffix?: string; variant?: ControlVariant }) {
  if (variant === 'row') {
    return (
      <div className="flex items-center gap-1 min-w-0 w-full justify-end">
        <input
          {...props}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cx(ROW_CONTROL, 'tabular-nums', className)}
          onChange={(event) => {
            if (!onChange) return
            const cleaned = sanitizeNumericInput(event.target.value)
            if (cleaned !== event.target.value) event.target.value = cleaned
            onChange(event)
          }}
        />
        {suffix && props.value !== '' && props.value != null && (
          <span className="shrink-0 text-[1rem] text-ink-3">{suffix}</span>
        )}
      </div>
    )
  }
  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cx(CONTROL, 'h-11 tabular-nums', suffix && 'pr-10', className)}
        onChange={(event) => {
          if (!onChange) return
          const cleaned = sanitizeNumericInput(event.target.value)
          if (cleaned !== event.target.value) event.target.value = cleaned
          onChange(event)
        }}
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
// Campo numérico con confirmación diferida
// ---------------------------------------------------------------------------

interface NumberFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'min' | 'max'
> {
  value: number
  /** Se llama al salir del campo o al pulsar Intro, no en cada tecla. */
  onCommit: (value: number) => void
  min?: number
  max?: number
  /** Redondea al confirmar. Para minutos, días y otras cantidades enteras. */
  integer?: boolean
  suffix?: string
  /** Valor al que volver si el campo queda vacío o ilegible. */
  fallback?: number
  /** 'sm' para filas densas, como el reparto de pesos de una asignatura. */
  inputSize?: 'sm' | 'md'
  /**
   * Clases del contenedor. Aquí van las de anchura y colocación: el input
   * lleva `w-full`, así que ponérselas a él no tendría efecto.
   */
  containerClassName?: string
}

/**
 * Campo numérico ligado directamente a un número del estado.
 *
 * A diferencia de `NumberInput`, que espera que el formulario guarde el texto
 * y lo interprete al enviar, este mantiene su propio borrador y solo confirma
 * al salir del campo o al pulsar Intro.
 *
 * Hace falta porque normalizar en cada pulsación impide escribir decimales:
 * al teclear «5,» el valor se convierte en 5, el componente se vuelve a
 * dibujar con «5» y la coma desaparece antes de poder escribir lo que va
 * detrás. Con un borrador, el estado intermedio sobrevive hasta que la cifra
 * está completa.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  integer,
  suffix,
  fallback,
  inputSize = 'md',
  className,
  containerClassName,
  ...props
}: NumberFieldProps) {
  const [draft, setDraft] = useState(() => toDecimalInput(value))
  const [editing, setEditing] = useState(false)

  // Si el valor cambia desde fuera (importar datos, reiniciar) el borrador se
  // pone al día, pero nunca mientras se está escribiendo en él.
  useEffect(() => {
    if (!editing) setDraft(toDecimalInput(value))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const parsed = parseDecimal(draft)
    const base = Number.isFinite(parsed) ? parsed : (fallback ?? value)

    let next = base
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    if (integer) next = Math.round(next)

    setDraft(toDecimalInput(next))
    if (next !== value) onCommit(next)
  }

  return (
    <div className={cx('relative', containerClassName)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        className={cx(
          CONTROL,
          'tabular-nums',
          inputSize === 'sm' ? 'h-9 leading-none' : 'h-11',
          suffix && (inputSize === 'sm' ? 'pr-7' : 'pr-10'),
          className,
        )}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(sanitizeNumericInput(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        {...props}
      />
      {suffix && (
        <span
          className={cx(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-3',
            inputSize === 'sm' ? 'right-2.5 text-[0.75rem]' : 'right-3 text-[0.8125rem]',
          )}
        >
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
  const box = size === 'sm' ? 'size-[20px]' : 'size-[24px]'
  return (
    <label
      className={cx(
        'group inline-flex items-center gap-2.5 cursor-pointer select-none',
        // Zona táctil de 44 px aunque el círculo dibujado sea más pequeño.
        hideLabel && 'p-2.5 -m-2.5',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          haptic(e.target.checked ? 'success' : 'tick')
          onChange(e.target.checked)
        }}
        className="sr-only peer"
        aria-label={hideLabel ? label : undefined}
      />
      <span
        aria-hidden
        className={cx(
          box,
          'relative grid place-items-center rounded-full border-[1.75px] shrink-0',
          'transition-[background-color,border-color,transform,box-shadow] duration-300 ease-[var(--spring)]',
          // Como una gota de cristal: al pulsar se hincha, no se hunde.
          'group-hover:scale-[1.07] group-active:scale-[1.18]',
          'peer-focus-visible:outline peer-focus-visible:outline-[2.5px] peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2',
          checked
            ? 'bg-accent-fill border-accent-fill text-white shadow-[inset_0_1px_0.5px_rgb(255_255_255/0.6),inset_0_-1px_1.5px_rgb(0_0_0/0.16),0_3px_10px_color-mix(in_srgb,var(--c-accent-fill)_44%,transparent)]'
            : 'bg-transparent border-hairline-strong group-hover:border-accent/65',
        )}
      >
        {checked && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-accent-fill animate-[check-burst_520ms_var(--ease-out)_both] pointer-events-none"
          />
        )}
        {checked && (
          <svg
            viewBox="0 0 12 12"
            className={cx(
              'relative',
              size === 'sm' ? 'size-2.5' : 'size-3',
              'animate-[check-pop_380ms_var(--spring)]',
            )}
          >
            <path
              d="M2.2 6.3 4.9 9 9.8 3.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="16"
              className="animate-[check-draw_260ms_ease-out_both]"
            />
          </svg>
        )}
      </span>
      {!hideLabel && <span className="text-[0.9375rem] text-ink">{label}</span>}
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
        <label htmlFor={id} className="text-[0.9375rem] font-medium text-ink cursor-pointer">
          {label}
        </label>
        {description && <p className="text-[0.8125rem] text-ink-3 mt-0.5">{description}</p>}
      </div>
      <SwitchControl id={id} checked={checked} onChange={onChange} />
    </div>
  )
}

/** Solo el interruptor de iOS, para filas de lista que ponen su propia etiqueta. */
export function SwitchControl({
  checked,
  onChange,
  id,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  /** Nombre accesible si no hay un <label for> que lo dé. */
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic()
        onChange(!checked)
      }}
      className={cx(
        'group relative shrink-0 w-[51px] h-[31px] rounded-full transition-[background-color,box-shadow] duration-300',
        'disabled:opacity-45',
        checked
          ? 'bg-[var(--c-switch-on)] shadow-[inset_0_1px_2px_rgb(0_0_0/0.12),0_2px_10px_-2px_color-mix(in_srgb,var(--c-switch-on)_45%,transparent)]'
          : 'bg-fill shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)]',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'switch-thumb absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white',
          'shadow-[0_3px_8px_rgb(0_0_0/0.16),0_1px_1.5px_rgb(0_0_0/0.16)]',
          'transition-[transform,width,background-color,box-shadow] duration-500 ease-[var(--spring)]',
          // Al pulsar, la bola se estira como en iOS.
          'group-active:w-[33px]',
          checked ? 'translate-x-[20px] group-active:translate-x-[14px]' : 'translate-x-0',
        )}
      />
    </button>
  )
}
