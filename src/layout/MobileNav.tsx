import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { ChevronRight, LayoutGrid, Plus, Sparkles } from 'lucide-react'

import { hrefFor, type RouteId } from '@/router'
import { exitFast, haptic, spring, useMediaQuery } from '@/ui/motion'
import { cx } from '@/ui/primitives'
import { Modal } from '@/ui/Modal'
import { ASSISTANT_FILL, CREATE_ITEMS, useChrome } from './chrome'
import { MOBILE_PRIMARY, NAV_ITEMS, NAV_TINTS, tintFill, type NavItem } from './navigation'

interface MobileNavProps {
  current: RouteId
  badges: Partial<Record<RouteId, number>>
}

/** Alto de la fila de pestañas, sin contar la zona segura inferior. */
const ROW_HEIGHT = 54
/** Margen del indicador en reposo dentro de su pestaña. */
const REST_INSET_X = 0
const REST_INSET_Y = 0
/** Cuánto crece la lente al tocar, respecto a la pestaña. */
const LENS_GROW_X = 1.3
const LENS_HEIGHT = 70
/** Aumento del contenido visto a través de la lente. */
const LENS_ZOOM = 1.16

interface Tab {
  id: RouteId | 'mas'
  label: string
  icon: NavItem['icon']
}

/** Secciones de la hoja «Más». Ajustes no está: se abre desde el avatar. */
const MORE_ITEMS = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.id) && i.id !== 'ajustes')
/** En el iPad en vertical caben todas: no hace falta «Más». */
const ALL_ITEMS = NAV_ITEMS.filter((i) => i.id !== 'ajustes')

/**
 * Barra de pestañas: una cápsula de cristal que flota sobre el contenido, con
 * el botón de crear aparte a su derecha (como la búsqueda en las barras de
 * iOS 26). En el iPhone lleva cuatro secciones y «Más»; en el iPad en
 * vertical, todas.
 *
 * Un único elemento hace de indicador y de lente (Liquid Glass):
 * - En reposo es una cápsula tenue detrás de la pestaña activa.
 * - Al tocar, crece por encima de la barra, se vuelve una lente con borde
 *   refractado y muestra AUMENTADO lo que tiene debajo (una copia de los
 *   iconos, en azul, escalada alrededor de su centro).
 * - Mientras el dedo se arrastra, la lente lo sigue sin retraso y la pestaña
 *   bajo ella se ilumina; al soltar se asienta con un muelle en la elegida.
 *
 * Ajustes no está aquí: se abre desde el avatar, arriba a la derecha.
 *
 * Accesibilidad: son enlaces reales con `aria-current`; con teclado se navega
 * con Tab e Intro. La lente y su copia son decorativas (`aria-hidden`). Con
 * «reducir movimiento» no hay animaciones; con «reducir transparencia», el
 * cristal es opaco.
 */
export function MobileNav({ current, badges }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const wide = useMediaQuery('(min-width: 700px)')

  const tabs: Tab[] = wide
    ? ALL_ITEMS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))
    : [
        ...MOBILE_PRIMARY.map((id) => {
          const item = NAV_ITEMS.find((i) => i.id === id)!
          return { id: item.id, label: item.label, icon: item.icon }
        }),
        { id: 'mas', label: 'Más', icon: LayoutGrid },
      ]
  // Una sección que no está en la barra se marca en «Más» (salvo Ajustes,
  // que tiene su propio acceso y no marca ninguna pestaña).
  const ownIndex = tabs.findIndex((t) => t.id === current)
  const restIndex = ownIndex >= 0 ? ownIndex : current === 'ajustes' || wide ? -1 : tabs.length - 1

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
    // Tocar la pestaña en la que ya estás sube al principio, como en iOS.
    else window.scrollTo({ top: 0, behavior: 'smooth' })
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
      haptic()
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
      if (tabs[g.index]?.id !== current) haptic()
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
      {/* El contenido se disuelve al acercarse a la barra. */}
      <div aria-hidden className="edge-bottom lg:hidden" />

      <div
        className={cx(
          'app-tabbar lg:hidden fixed inset-x-0 z-30 flex items-end justify-center gap-2.5 pointer-events-none',
          'bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.625rem))]',
          'pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
        )}
      >
        <nav
          aria-label="Secciones"
          className="liquid pointer-events-auto flex-1 min-w-0 max-w-[430px] md:max-w-[640px] rounded-full p-1"
        >
          <div
            ref={row}
            className="relative z-[2] touch-none select-none"
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
                        className="w-full h-full rounded-full"
                      >
                        {body}
                      </button>
                    ) : (
                      <a
                        href={hrefFor(tab.id)}
                        aria-label={tab.id === 'calendario' ? 'Calendario' : undefined}
                        aria-current={isCurrent ? 'page' : undefined}
                        draggable={false}
                        onClick={(e) => {
                          if (handledClick.current) e.preventDefault()
                          else if (isCurrent) {
                            e.preventDefault()
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }
                        }}
                        className="block h-full rounded-full"
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
        </nav>

        <CreateButton />
      </div>

      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} current={current} />
    </>
  )
}

/**
 * Botón de crear: un círculo de cristal teñido junto a la barra. Al tocarlo,
 * el «+» gira a «×» y del propio botón sale un menú con lo que se puede
 * apuntar. Todo con el mismo muelle, para que se lea como una sola pieza.
 */
function CreateButton() {
  const { openCreate, openAssistant, hasSubjects } = useChrome()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative pointer-events-auto shrink-0">
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="velo"
              className="fixed inset-0 -z-[1] pointer-events-auto"
              style={{ background: 'var(--scrim)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.22 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.ul
              key="menu"
              role="menu"
              aria-label="Crear"
              className="liquid absolute right-0 bottom-[calc(100%+0.75rem)] w-[13.5rem] rounded-[28px] p-1.5 origin-bottom-right"
              initial={{ opacity: 0, scale: 0.4, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 16, transition: exitFast }}
              transition={spring.bouncy}
            >
              {CREATE_ITEMS.map((item, index) => {
                const disabled = item.needsSubject && !hasSubjects
                return (
                  <motion.li
                    key={item.kind}
                    role="none"
                    className="relative z-[2]"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring.snappy, delay: 0.03 * (CREATE_ITEMS.length - index) }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      onClick={() => {
                        setOpen(false)
                        openCreate(item.kind)
                      }}
                      className="pressable w-full flex items-center gap-3 h-[3.25rem] pl-2 pr-4 rounded-[22px] text-left active:bg-fill disabled:opacity-40"
                    >
                      <span
                        className="tile grid place-items-center size-9 rounded-full text-white shrink-0"
                        style={{ background: tintFill(item.tint) }}
                      >
                        <item.icon className="size-[18px]" strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[1.0625rem] font-medium text-ink leading-tight">
                          {item.label}
                        </span>
                        {disabled && (
                          <span className="block text-[0.6875rem] text-ink-3">
                            Crea antes una asignatura
                          </span>
                        )}
                      </span>
                    </button>
                  </motion.li>
                )
              })}
              {/* El asistente, lo último: lo más cerca del pulgar. */}
              <motion.li
                role="none"
                className="relative z-[2] mt-1 pt-1 border-t border-hairline"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={spring.snappy}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    openAssistant()
                  }}
                  className="pressable w-full flex items-center gap-3 h-[3.25rem] pl-2 pr-4 rounded-[22px] text-left active:bg-fill"
                >
                  <span
                    className="grid place-items-center size-9 rounded-full text-white shrink-0"
                    style={{ background: ASSISTANT_FILL }}
                  >
                    <Sparkles className="size-[18px]" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[1.0625rem] font-medium text-ink leading-tight">
                      Asistente
                    </span>
                    <span className="block text-[0.6875rem] text-ink-3">Escribe o habla</span>
                  </span>
                </button>
              </motion.li>
            </motion.ul>
          </>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label={open ? 'Cerrar el menú de crear' : 'Crear'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          haptic()
          setOpen((v) => !v)
        }}
        whileTap={{ scale: 0.9 }}
        transition={spring.snappy}
        className="liquid relative grid place-items-center rounded-full text-white"
        style={{
          width: ROW_HEIGHT + 8,
          height: ROW_HEIGHT + 8,
          background:
            'linear-gradient(180deg, rgb(255 255 255 / 0.3), transparent 55%), var(--c-accent-fill)',
        }}
      >
        <motion.span
          className="relative z-[2] grid place-items-center"
          animate={{ rotate: open ? 135 : 0 }}
          transition={spring.bouncy}
        >
          <Plus className="size-[26px]" strokeWidth={2.4} />
        </motion.span>
      </motion.button>
    </div>
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
      <span className="truncate max-w-full">
        {tab.id === 'calendario' ? <><span className="sm:hidden">Agenda</span><span className="hidden sm:inline">Calendario</span></> : tab.label}
      </span>
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
                  className="tile grid place-items-center size-[30px] rounded-[8px] text-white shrink-0"
                  style={{ background: tintFill(NAV_TINTS[item.id]) }}
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
