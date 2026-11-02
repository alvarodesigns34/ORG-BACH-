import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { cx } from './primitives'

/**
 * Gráficos dibujados a mano en SVG.
 *
 * Sin librería: estos cuatro gráficos son sencillos, y una dependencia de
 * visualización pesa más que todo el código de este archivo y obliga a pelear
 * con sus estilos para que respeten los colores de la aplicación.
 *
 * Reglas que siguen todos:
 * - Una sola serie por gráfico, así que no hace falta leyenda: el título dice
 *   qué se está viendo.
 * - El color NO identifica nada. Cada barra lleva su etiqueta escrita al lado,
 *   porque la paleta de asignaturas está pensada para puntos pequeños en la
 *   interfaz y no separa lo suficiente como para distinguir diez series.
 * - Rejilla y ejes en segundo plano; el dato manda.
 * - Cada gráfico incluye una tabla equivalente para lectores de pantalla.
 */

// ---------------------------------------------------------------------------
// Medición del contenedor
// ---------------------------------------------------------------------------

/**
 * Ancho real del contenedor.
 *
 * Se mide en lugar de escalar un `viewBox` fijo: al escalar, el texto se
 * deforma con el gráfico y acaba diminuto en móvil y enorme en escritorio.
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

function ChartFrame({
  children,
  table,
  className,
}: {
  children: ReactNode
  /** Equivalente en tabla, solo para lectores de pantalla. */
  table: ReactNode
  className?: string
}) {
  return (
    <div className={cx('relative', className)}>
      {children}
      <div className="sr-only">{table}</div>
    </div>
  )
}

function Tooltip({
  x,
  y,
  width,
  children,
}: {
  x: number
  y: number
  width: number
  children: ReactNode
}) {
  // Se ancla al borde cuando el punto está cerca de un lateral, para que no
  // se salga del gráfico.
  const clamped = Math.max(8, Math.min(x, width - 8))
  const align = clamped < 90 ? 'left' : clamped > width - 90 ? 'right' : 'center'

  return (
    <div
      className={cx(
        'pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-sm whitespace-nowrap',
        'bg-raised border border-hairline shadow-md',
        'text-[0.75rem] text-ink tabular-nums',
      )}
      style={{
        left: clamped,
        top: y,
        transform:
          align === 'center'
            ? 'translate(-50%, -115%)'
            : align === 'left'
              ? 'translate(0, -115%)'
              : 'translate(-100%, -115%)',
      }}
    >
      {children}
    </div>
  )
}

const AXIS_TEXT = 'fill-[var(--c-ink-3)] text-[0.6875rem]'

// ---------------------------------------------------------------------------
// Gráfico de línea
// ---------------------------------------------------------------------------

export interface LinePoint {
  label: string
  value: number
  /** Texto extra para el globo de información. */
  detail?: string
}

interface LineChartProps {
  points: LinePoint[]
  yMin: number
  yMax: number
  formatValue: (value: number) => string
  /** Línea de referencia horizontal, p. ej. la nota objetivo. */
  reference?: { value: number; label: string }
  height?: number
  title: string
}

export function LineChart({
  points,
  yMin,
  yMax,
  formatValue,
  reference,
  height = 200,
  title,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const padding = { top: 16, right: 16, bottom: 26, left: 38 }
  const plotWidth = Math.max(0, width - padding.left - padding.right)
  const plotHeight = height - padding.top - padding.bottom

  const scaleX = (i: number) =>
    padding.left + (points.length <= 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth)
  const scaleY = (value: number) =>
    padding.top + plotHeight - ((value - yMin) / Math.max(0.0001, yMax - yMin)) * plotHeight

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (points.length === 0 || plotWidth <= 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left - padding.left
      const ratio = Math.max(0, Math.min(1, x / plotWidth))
      setHover(Math.round(ratio * (points.length - 1)))
    },
    [points.length, plotWidth, padding.left],
  )

  const ticks = [yMin, (yMin + yMax) / 2, yMax]
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(p.value)}`)
    .join(' ')
  const area =
    points.length > 0
      ? `${path} L ${scaleX(points.length - 1)} ${padding.top + plotHeight} L ${scaleX(0)} ${padding.top + plotHeight} Z`
      : ''

  const active = hover !== null ? points[hover] : null

  return (
    <ChartFrame
      className="w-full"
      table={
        <table>
          <caption>{title}</caption>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td>{formatValue(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="w-full">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={title}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            className="touch-none"
          >
            {/* Rejilla: solo horizontales, y en segundo plano. */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={scaleY(tick)}
                  y2={scaleY(tick)}
                  stroke="var(--c-hairline)"
                  strokeWidth={1}
                />
                <text
                  x={padding.left - 8}
                  y={scaleY(tick) + 4}
                  textAnchor="end"
                  className={AXIS_TEXT}
                >
                  {formatValue(tick)}
                </text>
              </g>
            ))}

            {/* Referencia: discontinua, para no confundirla con el dato. */}
            {reference && reference.value >= yMin && reference.value <= yMax && (
              <g>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={scaleY(reference.value)}
                  y2={scaleY(reference.value)}
                  stroke="var(--c-ink-3)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text
                  x={width - padding.right}
                  y={scaleY(reference.value) - 6}
                  textAnchor="end"
                  className={AXIS_TEXT}
                >
                  {reference.label}
                </text>
              </g>
            )}

            {area && <path d={area} fill="var(--c-accent)" opacity={0.07} />}
            <path
              d={path}
              fill="none"
              stroke="var(--c-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Puntos visibles solo si son pocos: en una serie larga ensucian. */}
            {points.length <= 14 &&
              points.map((p, i) => (
                <circle
                  key={i}
                  cx={scaleX(i)}
                  cy={scaleY(p.value)}
                  r={3}
                  fill="var(--c-surface)"
                  stroke="var(--c-accent)"
                  strokeWidth={2}
                />
              ))}

            {/* Retícula de seguimiento del puntero. */}
            {hover !== null && active && (
              <g>
                <line
                  x1={scaleX(hover)}
                  x2={scaleX(hover)}
                  y1={padding.top}
                  y2={padding.top + plotHeight}
                  stroke="var(--c-hairline-strong)"
                  strokeWidth={1}
                />
                <circle
                  cx={scaleX(hover)}
                  cy={scaleY(active.value)}
                  r={5}
                  fill="var(--c-accent)"
                  stroke="var(--c-surface)"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* Solo la primera y la última etiqueta del eje: el resto sobra. */}
            {points.length > 0 && (
              <>
                <text x={padding.left} y={height - 6} textAnchor="start" className={AXIS_TEXT}>
                  {points[0].label}
                </text>
                {points.length > 1 && (
                  <text
                    x={width - padding.right}
                    y={height - 6}
                    textAnchor="end"
                    className={AXIS_TEXT}
                  >
                    {points[points.length - 1].label}
                  </text>
                )}
              </>
            )}
          </svg>
        )}

        {hover !== null && active && (
          <Tooltip x={scaleX(hover)} y={scaleY(active.value)} width={width}>
            <span className="font-semibold">{formatValue(active.value)}</span>
            <span className="text-ink-3"> · {active.label}</span>
            {active.detail && <span className="text-ink-3"> · {active.detail}</span>}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------

export interface Column {
  label: string
  /** Etiqueta corta para el eje; si falta se usa `label`. */
  shortLabel?: string
  value: number
  formatted: string
  /** Resalta la columna (p. ej. hoy). */
  highlight?: boolean
}

export function ColumnChart({
  columns,
  height = 168,
  title,
}: {
  columns: Column[]
  height?: number
  title: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const padding = { top: 14, right: 4, bottom: 22, left: 4 }
  const plotHeight = height - padding.top - padding.bottom
  const max = Math.max(...columns.map((c) => c.value), 1)

  const slot = columns.length > 0 ? (width - padding.left - padding.right) / columns.length : 0
  // 2 px de aire entre columnas: sin separación se leen como una mancha.
  const barWidth = Math.max(4, Math.min(34, slot - 6))

  return (
    <ChartFrame
      className="w-full"
      table={
        <table>
          <caption>{title}</caption>
          <tbody>
            {columns.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}</th>
                <td>{c.formatted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="w-full">
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={title}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + plotHeight}
              y2={padding.top + plotHeight}
              stroke="var(--c-hairline)"
              strokeWidth={1}
            />

            {columns.map((column, i) => {
              const barHeight =
                column.value === 0 ? 0 : Math.max(3, (column.value / max) * plotHeight)
              const x = padding.left + i * slot + (slot - barWidth) / 2
              const y = padding.top + plotHeight - barHeight

              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  {/* Zona sensible mayor que la barra: acertar con el dedo en
                      una columna de 4 px es imposible. */}
                  <rect
                    x={padding.left + i * slot}
                    y={padding.top}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                  />
                  {barHeight > 0 && (
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx={4}
                      fill={column.highlight ? 'var(--c-accent)' : 'var(--c-ink-3)'}
                      opacity={hover === i ? 1 : column.highlight ? 0.95 : 0.55}
                      className="transition-opacity duration-150"
                    />
                  )}
                  {barHeight === 0 && (
                    <circle
                      cx={x + barWidth / 2}
                      cy={padding.top + plotHeight - 2}
                      r={1.5}
                      fill="var(--c-hairline-strong)"
                    />
                  )}
                </g>
              )
            })}

            {columns.map((column, i) => (
              <text
                key={i}
                x={padding.left + i * slot + slot / 2}
                y={height - 6}
                textAnchor="middle"
                className={cx(AXIS_TEXT, column.highlight && 'fill-[var(--c-ink)] font-semibold')}
              >
                {column.shortLabel ?? column.label}
              </text>
            ))}
          </svg>
        )}

        {hover !== null && columns[hover] && (
          <Tooltip
            x={padding.left + hover * slot + slot / 2}
            y={padding.top + plotHeight - (columns[hover].value / max) * plotHeight}
            width={width}
          >
            <span className="font-semibold">{columns[hover].formatted}</span>
            <span className="text-ink-3"> · {columns[hover].label}</span>
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------
// Barras horizontales con etiqueta
// ---------------------------------------------------------------------------

export interface RankedBar {
  id: string
  label: string
  value: number
  formatted: string
  /** Punto de color de identidad. Acompaña a la etiqueta, no la sustituye. */
  dotColor?: string
  /** Marca de referencia sobre la barra (el objetivo de la asignatura). */
  marker?: { value: number; label: string }
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
}

const BAR_TONE = {
  accent: 'var(--c-accent)',
  ok: 'var(--c-ok)',
  warn: 'var(--c-warn)',
  danger: 'var(--c-danger)',
}

/**
 * Ranking en barras horizontales.
 *
 * El nombre va escrito junto a cada barra, así que el color no tiene que
 * distinguir nada: todas comparten tono salvo cuando el tono significa algo
 * (aprobado, suspenso). Diez colores para diez barras ya etiquetadas serían
 * diez colores que no informan.
 */
export function RankedBars({
  bars,
  max,
  title,
  emptyLabel = 'Sin datos',
}: {
  bars: RankedBar[]
  max: number
  title: string
  emptyLabel?: string
}) {
  if (bars.length === 0) {
    return <p className="text-[0.8125rem] text-ink-3 py-6 text-center">{emptyLabel}</p>
  }

  return (
    <div role="img" aria-label={title}>
      <ul className="flex flex-col gap-3.5">
        {bars.map((bar) => {
          const percent = Math.max(0, Math.min(100, (bar.value / Math.max(max, 0.0001)) * 100))
          const markerPercent =
            bar.marker !== undefined
              ? Math.max(0, Math.min(100, (bar.marker.value / Math.max(max, 0.0001)) * 100))
              : null

          return (
            <li key={bar.id}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  {bar.dotColor && (
                    <span
                      aria-hidden
                      className="size-2 rounded-full shrink-0"
                      style={{ background: bar.dotColor }}
                    />
                  )}
                  <span className="text-[0.8125rem] text-ink truncate">{bar.label}</span>
                </span>
                <span className="text-[0.8125rem] font-semibold text-ink tabular-nums shrink-0">
                  {bar.formatted}
                </span>
              </div>

              <div className="relative h-2 rounded-full bg-sunken overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${percent}%`,
                    background: BAR_TONE[bar.tone ?? 'accent'],
                  }}
                />
                {markerPercent !== null && (
                  <span
                    aria-hidden
                    title={bar.marker!.label}
                    className="absolute top-0 bottom-0 w-px bg-ink-2"
                    style={{ left: `${markerPercent}%` }}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.id}>
              <th scope="row">{bar.label}</th>
              <td>{bar.formatted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
