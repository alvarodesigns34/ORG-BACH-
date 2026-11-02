import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ChevronRight, LayoutGrid } from 'lucide-react'

import { hrefFor, type RouteId } from '@/router'
import { cx } from '@/ui/primitives'
import { Modal } from '@/ui/Modal'
import { MOBILE_PRIMARY, NAV_ITEMS, NAV_TINTS, type NavItem } from './navigation'

interface MobileNavProps {
  current: RouteId
  badges: Partial<Record<RouteId, number>>
}

/** Alto de la fila de pestañas, sin contar la zona segura inferior. */
const ROW_HEIGHT = 54
/** Margen del indicador en reposo dentro de su pestaña. */
const REST_INSET_X = 6
const REST_INSET_Y = 5
/** Cuánto crece la lente al tocar, respecto a la pestaña. */
const LENS_GROW_X = 1.3
const LENS_HEIGHT = 68
/** Aumento del contenido visto a través de la lente. */
const LENS_ZOOM = 1.16

interface Tab {
  id: RouteId | 'mas'
  label: string
  icon: NavItem['icon']
}

/** Secciones de la hoja «Más». Ajustes no está: se abre desde el avatar. */
const MORE_ITEMS = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.id) && i.id !== 'ajustes')

/**
 * Barra de pestañas del móvil: de lado a lado, con material de cristal.
 *
 * Un único elemento hace de indicador y de lente (Liquid Glass):
 * - En reposo es una cápsula tenue detrás de la pestaña activa.
 * - Al tocar, crece por encima de la barra, se vuelve una lente con borde
 *   refractado y muestra AUMENTADO lo que tiene debajo (una copia de los
 *   iconos, en azul, escalada alrededor de su centro).
 * - Mientras el dedo se arrastra, la lente lo sigue sin retraso y la pestaña
 *   bajo ella se ilumina; al soltar se asienta con un muelle en la elegida.
 *
 * Crear y Ajustes no están aquí: van arriba a la derecha (ver `TopBar`), como
 * en las apps de iOS, y la barra queda solo para moverse entre secciones.
 *
 * Accesibilidad: son enlaces reales con `aria-current`; con teclado se navega
 * con Tab e Intro. La lente y su copia son decorativas (`aria-hidden`). Con
 * «reducir movimiento» no hay animaciones; con «reducir transparencia», el
 * cristal es opaco.
 */
export function MobileNav({ current, badges }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const tabs: Tab[] = [
    ...MOBILE_PRIMARY.map((id) => {
      const item = NAV_ITEMS.find((i) => i.id === id)!
      return { id: item.id, label: item.label, icon: item.icon }
    }),
    { id: 'mas', label: 'Más', icon: LayoutGrid },
  ]
  // Una sección que no está en la barra se marca en «Más» (salvo Ajustes,
  // que tiene su propio acceso y no marca ninguna pestaña).
  const restIndex = MOBILE_PRIMARY.includes(current)
    ? tabs.findIndex((t) => t.id === current)
    : current === 'ajustes'
      ? -1
      : tabs.length - 1

  // --- Geometría ---------------------------------------------------------
  const row = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = row.current
    if (!node) return
    const update = () => setWidth(node.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const tabW = width / tabs.length

  // --- Gesto -------------------------------------------------------------
  const [pressing, setPressing] = useState(false)
  const [dragX, setDragX] = useState<number | null>(null)
  const gesture = useRef<{ id: number; startX: number; moved: boolean; index: number } | null>(null)
  /** El último gesto ya navegó: el `click` que lo sigue no debe repetir. */
  const handledClick = useRef(false)

  const clampX = useCallback(
    (clientX: number) => {
      const rect = row.current!.getBoundingClientRect()
      return Math.min(Math.max(clientX - rect.left, tabW / 2), rect.width - tabW / 2)
    },
    [tabW],
  )
  const indexAt = useCallback(
    (x: number) => Math.min(tabs.length - 1, Math.max(0, Math.floor(x / tabW))),
    [tabW, tabs.length],
  )

  const select = (index: number) => {
    const tab = tabs[index]
    if (!tab) return
    if (tab.id === 'mas') {
      setSheetOpen(true)
      return
    }
    if (tab.id !== current) window.location.hash = hrefFor(tab.id).slice(1)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !tabW) return
    const x = clampX(event.clientX)
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      moved: false,
      index: indexAt(x),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPressing(true)
    setDragX(x)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    if (!g.moved && Math.abs(event.clientX - g.startX) > 6) g.moved = true
    const x = clampX(event.clientX)
    const index = indexAt(x)
    if (index !== g.index) {
      g.index = index
      // Un toque háptico mínimo al cambiar de pestaña (solo Android lo admite).
      try {
        navigator.vibrate?.(6)
      } catch {
        // Sin vibración disponible.
      }
    }
    setDragX(x)
  }

  const finish = (commit: boolean) => {
    const g = gesture.current
    gesture.current = null
    setPressing(false)
    setDragX(null)
    if (g && commit) {
      handledClick.current = true
      select(g.index)
      // El `click` llega justo después del `pointerup`; pasado ese momento,
      // un clic de teclado debe volver a funcionar.
      setTimeout(() => (handledClick.current = false), 400)
    }
  }

  // Cambiar de sección desde fuera (enlace, atajo) mueve el indicador solo.
  useEffect(() => {
    if (!pressing) setDragX(null)
  }, [current, pressing])

  // --- Posición y forma de la lente ---------------------------------------
  const resting = restIndex >= 0
  const restCenter = ((resting ? restIndex : 0) + 0.5) * tabW
  const centerX = dragX ?? restCenter
  const visualIndex = pressing && dragX !== null ? indexAt(dragX) : restIndex
  const lensW = pressing ? tabW * LENS_GROW_X : Math.max(0, tabW - REST_INSET_X * 2)
  const lensH = pressing ? LENS_HEIGHT : ROW_HEIGHT - REST_INSET_Y * 2

  const lensStyle: CSSProperties = {
    width: lensW,
    height: lensH,
    transform: `translate3d(${centerX - lensW / 2}px, -50%, 0)`,
    opacity: pressing || resting ? 1 : 0,
    // Mientras se arrastra, la lente va pegada al dedo: sin transición en la
    // posición, pero sí en el tamaño. Al soltar, todo vuelve con muelle.
    transitionProperty:
      dragX !== null && pressing
        ? 'width, height, background-color, box-shadow, opacity'
        : 'transform, width, height, background-color, box-shadow, opacity',
  }

  return (
    <>
      <nav
        aria-label="Secciones"
        className={cx(
          'lg:hidden fixed bottom-0 inset-x-0 z-30 glass-bar border-t border-hairline',
          'pb-[env(safe-area-inset-bottom)]',
          'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
        )}
      >
        <div className="mx-auto max-w-[560px] px-1.5">
          <div
            ref={row}
            className="relative touch-none select-none"
            style={{ height: ROW_HEIGHT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
            onLostPointerCapture={() => gesture.current && finish(false)}
          >
            {/* --- Pestañas reales (accesibles) --- */}
            <ul
              className="relative z-[1] grid h-full"
              style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
            >
              {tabs.map((tab, index) => {
                const lit = index === visualIndex
                const isCurrent = index === restIndex
                const count = tab.id !== 'mas' ? badges[tab.id] : undefined
                const body = <TabFace tab={tab} lit={lit} count={count} />
                return (
                  <li key={tab.id} className="min-w-0">
                    {tab.id === 'mas' ? (
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={sheetOpen}
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={(e) => {
                          if (handledClick.current) {
                            e.preventDefault()
                            return
                          }
                          setSheetOpen(true)
                        }}
                        className="w-full h-full rounded-[14px]"
                      >
                        {body}
                      </button>
                    ) : (
                      <a
                        href={hrefFor(tab.id)}
                        aria-current={isCurrent ? 'page' : undefined}
                        draggable={false}
                        onClick={(e) => {
                          if (handledClick.current) e.preventDefault()
                        }}
                        className="block h-full rounded-[14px]"
                      >
                        {body}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* --- Indicador / lente --- */}
            {tabW > 0 && (
              <div
                aria-hidden
                className={cx(
                  'absolute left-0 top-1/2 z-[2] rounded-full overflow-hidden pointer-events-none',
                  'duration-[520ms] ease-[var(--spring)]',
                  pressing ? 'lens' : 'bg-[var(--glass-tint)]',
                )}
                style={lensStyle}
              >
                {/* Copia aumentada de las pestañas, centrada en la lente. */}
                <div
                  className="absolute left-1/2 top-1/2 size-0 transition-[transform,opacity] duration-[520ms] ease-[var(--spring)]"
                  style={{
                    transform: `scale(${pressing ? LENS_ZOOM : 1})`,
                    opacity: pressing ? 1 : 0,
                  }}
                >
                  <div
                    className="absolute grid text-accent"
                    style={{
                      width,
                      height: ROW_HEIGHT,
                      left: -centerX,
                      top: -ROW_HEIGHT / 2,
                      gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
                    }}
                  >
                    {tabs.map((tab) => (
                      <TabFace key={tab.id} tab={tab} lit forceColor />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} current={current} />
    </>
  )
}

function TabFace({
  tab,
  lit,
  count,
  forceColor,
}: {
  tab: Tab
  lit: boolean
  count?: number
  /** Dentro de la lente todo se pinta del color de acento. */
  forceColor?: boolean
}) {
  const Icon = tab.icon
  return (
    <span
      className={cx(
        'flex flex-col items-center justify-center gap-[3px] h-full px-0.5',
        'text-[0.625rem] font-semibold leading-none tracking-[-0.005em]',
        'transition-colors duration-200',
        forceColor ? '' : lit ? 'text-accent' : 'text-ink-2',
      )}
    >
      <span className="relative">
        <Icon className="size-[23px]" strokeWidth={lit ? 2.3 : 1.85} />
        {count !== undefined && count > 0 && (
          <span
            className={cx(
              'absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full',
              'text-[0.625rem] font-bold tabular-nums leading-[18px] text-center',
              'bg-danger text-white ring-2 ring-[var(--c-surface)]',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
      <span className="truncate max-w-full">{tab.label}</span>
    </span>
  )
}

/** Hoja «Más»: el resto de secciones, como una lista agrupada de iOS. */
function MoreSheet({
  open,
  onClose,
  current,
}: {
  open: boolean
  onClose: () => void
  current: RouteId
}) {
  return (
    <Modal open={open} onClose={onClose} title="Más">
      <ul className="rounded-[18px] bg-canvas dark:bg-raised/60 overflow-hidden">
        {MORE_ITEMS.map((item, index) => {
          const active = item.id === current
          return (
            <li key={item.id}>
              <a
                href={hrefFor(item.id)}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3.5 pl-3.5 pr-3 h-[3.25rem] transition-colors duration-150',
                  'active:bg-fill',
                )}
              >
                <span
                  className="grid place-items-center size-[30px] rounded-[8px] text-white shrink-0"
                  style={{ background: NAV_TINTS[item.id] }}
                >
                  <item.icon className="size-[18px]" strokeWidth={2.2} />
                </span>
                <span
                  className={cx(
                    'flex-1 min-w-0 h-full flex items-center gap-3 text-[1.0625rem]',
                    index > 0 && 'border-t border-hairline',
                    active ? 'font-semibold text-accent' : 'text-ink',
                  )}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  <ChevronRight className="size-4 text-ink-3 shrink-0" strokeWidth={2.4} />
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
