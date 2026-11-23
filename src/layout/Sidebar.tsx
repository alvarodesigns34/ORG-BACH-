import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Mic, PanelLeft } from 'lucide-react'

import { courseLine } from '@/data/defaults'
import { useSettings } from '@/state/StoreProvider'
import { hrefFor, type RouteId } from '@/router'
import { SyncBadge } from '@/features/account/SyncBadge'
import { haptic } from '@/ui/motion'
import { createLiquidIndicator, type LiquidIndicator } from '@/ui/liquid'
import { cx } from '@/ui/primitives'
import { AccountAvatar, AssistantIcon, useChrome } from './chrome'
import { BrandMark } from './Brand'
import { NAV_GROUPS, NAV_ITEMS } from './navigation'
import { toggleGroup, toggleSidebar, useSidebarPrefs } from './sidebarState'

interface SidebarProps {
  current: RouteId
  /** Recuentos que se muestran junto a algunas secciones. */
  badges: Partial<Record<RouteId, number>>
}

/**
 * Barra lateral de iPadOS 26 (iPad en horizontal y ordenador): un panel de
 * cristal inserto que flota sobre el contenido. Solo navegación: crear vive
 * en la barra de herramientas («+»), como en las apps del sistema.
 *
 * - Arriba, el nombre de la app y el botón para ocultarla.
 * - Un campo, como el de búsqueda de Mail o Música, que abre el asistente.
 * - Grupos plegables con cabecera en negrita.
 * - Glifos en el color de acento; la sección activa, bajo una lente.
 */
export function Sidebar({ current, badges }: SidebarProps) {
  const settings = useSettings()
  const { openAssistant } = useChrome()
  const { hidden, folded } = useSidebarPrefs()
  const indicator = useActiveIndicator(current, folded)

  return (
    <aside
      inert={hidden}
      aria-hidden={hidden || undefined}
      className="app-sidebar hidden lg:flex flex-col fixed z-30 w-[var(--sidebar-w)] rounded-[30px] liquid top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))]"
    >
      <div className="relative z-[2] flex flex-col min-h-0 flex-1">
        {/* --- Cabecera: la app y ocultar la barra --- */}
        <div className="flex items-center gap-2 pl-5 pr-3 pt-4 pb-3">
          <a
            href={hrefFor('inicio')}
            className="pressable flex items-center gap-2.5 min-w-0 flex-1 rounded-[12px]"
          >
            <BrandMark size={30} />
            <span className="min-w-0">
              <span className="block display text-[1.25rem] leading-none">Órbita</span>
              <span className="block text-[0.6875rem] text-ink-3 tabular-nums truncate mt-1">
                {courseLine(settings)}
              </span>
            </span>
          </a>
          <button
            type="button"
            onClick={() => {
              haptic()
              toggleSidebar(true)
            }}
            aria-label="Ocultar la barra lateral"
            title="Ocultar la barra lateral"
            className="pressable grid place-items-center size-10 rounded-full text-ink-2 hover:bg-[var(--glass-tint)] shrink-0"
          >
            <PanelLeft className="size-[20px]" strokeWidth={2} />
          </button>
        </div>

        {/* --- El asistente, con forma de campo de búsqueda --- */}
        <div className="px-3 pb-3">
          <div className="sidebar-field group flex items-center h-10 rounded-full transition-[background-color,box-shadow] duration-200 hover:ring-1 hover:ring-accent/25">
            <button
              type="button"
              onClick={() => openAssistant('text')}
              aria-label="Asistente: escríbele lo que quieras apuntar o preguntar"
              className="flex-1 min-w-0 h-full flex items-center gap-2 pl-3 rounded-full text-left"
            >
              <AssistantIcon className="size-[17px] text-accent shrink-0 transition-transform duration-300 ease-[var(--spring)] group-hover:scale-110" />
              <span className="truncate text-[0.9375rem] text-ink-3 group-hover:text-ink-2 transition-colors">
                Pregunta o apunta
              </span>
            </button>
            <button
              type="button"
              onClick={() => openAssistant('voice')}
              aria-label="Dictar al asistente"
              title="Dictar"
              className="pressable liquid-press grid place-items-center size-10 rounded-full text-ink-2 hover:text-accent shrink-0"
            >
              <Mic className="size-[17px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* --- Navegación --- */}
        <nav
          ref={indicator.navRef}
          className="relative flex-1 overflow-y-auto no-scrollbar px-3 pb-3"
          aria-label="Secciones"
        >
          {/* Un solo indicador que viaja de una sección a otra. Se mueve en el
              espacio de la propia lista, no con un `layoutId`: la barra es
              `fixed` y Motion mide las animaciones compartidas en coordenadas
              de página, así que al cambiar de sección con la página desplazada
              el indicador salía disparado y luego volvía. */}
          <SidebarLens box={indicator.box} animate={indicator.animate} />
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter(
              (item) => item.group === group.id && item.id !== 'ajustes',
            )
            if (items.length === 0) return null
            const open = !folded.includes(group.id)
            const listId = `sidebar-${group.id}`
            return (
              <div key={group.id} className="mb-2 last:mb-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  aria-controls={listId}
                  className="w-full flex items-center justify-between h-9 pl-3 pr-2.5 rounded-[12px] text-[0.9375rem] font-bold tracking-[-0.01em] text-ink hover:bg-[var(--glass-tint)] transition-colors duration-150"
                >
                  {group.label}
                  <ChevronDown
                    aria-hidden
                    strokeWidth={2.6}
                    className={cx(
                      'size-4 text-accent transition-transform duration-300 ease-[var(--spring)]',
                      !open && '-rotate-90',
                    )}
                  />
                </button>
                <div
                  id={listId}
                  className="sidebar-fold"
                  data-open={open}
                  inert={!open}
                  onTransitionEnd={indicator.remeasure}
                >
                  <ul className="min-h-0 overflow-hidden flex flex-col gap-0.5 pt-0.5">
                    {items.map((item) => {
                      const active = item.id === current
                      const count = badges[item.id]
                      return (
                        <li key={item.id}>
                          <a
                            href={hrefFor(item.id)}
                            data-nav={item.id}
                            aria-current={active ? 'page' : undefined}
                            className={cx(
                              'group pressable relative flex items-center gap-3 h-11 pl-3.5 pr-4 rounded-[18px]',
                              'text-[1rem] tracking-[-0.01em] transition-colors duration-150',
                              active
                                ? 'text-ink font-semibold'
                                : 'text-ink hover:bg-[var(--glass-tint)]',
                            )}
                          >
                            <item.icon
                              aria-hidden
                              className={cx(
                                'relative size-[20px] text-accent shrink-0 transition-transform duration-300 ease-[var(--spring)]',
                                active ? 'scale-[1.06]' : 'group-hover:scale-110',
                              )}
                              strokeWidth={active ? 2.4 : 2}
                            />
                            <span className="relative truncate">{item.label}</span>
                            {count !== undefined && count > 0 && (
                              <span className="relative ml-auto text-[0.875rem] tabular-nums text-ink-3">
                                {count}
                              </span>
                            )}
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )
          })}
        </nav>

        {/* --- Pie: la cuenta y los ajustes --- */}
        <div className="mx-3 h-px bg-[var(--glass-edge)]" aria-hidden />
        <a
          href={hrefFor('ajustes')}
          aria-current={current === 'ajustes' ? 'page' : undefined}
          className={cx(
            'pressable mx-2 mt-2 flex items-center gap-3 rounded-[20px] px-2.5 py-2 transition-colors duration-150',
            current === 'ajustes' ? 'lens' : 'hover:bg-[var(--glass-tint)]',
          )}
        >
          <AccountAvatar size={34} decorative />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold text-ink truncate">
              {settings.userName || 'Sin nombre'}
            </span>
            <span className="block text-[0.75rem] text-ink-3 truncate">Ajustes y cuenta</span>
          </span>
        </a>
        <div className="px-5 pt-1.5 pb-3.5">
          <SyncBadge />
        </div>
      </div>
    </aside>
  )
}

/**
 * Posición del indicador de la sección activa, medida dentro de la lista.
 * La primera medida no se anima (al abrir la app ya está en su sitio). Se
 * vuelve a medir al plegar o desplegar un grupo; si la sección activa queda
 * dentro de un grupo plegado, no hay indicador.
 */
function useActiveIndicator(current: RouteId, folded: string[]) {
  const navRef = useRef<HTMLElement>(null)
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  const [tick, setTick] = useState(0)
  const measured = useRef(false)
  const foldedKey = folded.join(',')

  useLayoutEffect(() => {
    const link = navRef.current?.querySelector<HTMLElement>(`[data-nav="${current}"]`)
    const hiddenGroup = NAV_ITEMS.find((item) => item.id === current)?.group
    if (!link || (hiddenGroup && foldedKey.split(',').includes(hiddenGroup))) {
      setBox(null)
      measured.current = false
      return
    }
    setBox({ top: link.offsetTop, height: link.offsetHeight })
  }, [current, foldedKey, tick])

  useLayoutEffect(() => {
    if (box) measured.current = true
  })

  return {
    navRef,
    box,
    animate: measured.current,
    remeasure: (event: React.TransitionEvent) => {
      if (event.target === event.currentTarget) setTick((t) => t + 1)
    },
  }
}

/** La lente de la sección activa: viaja con un muelle y se estira en vertical
 *  según su velocidad, como una gota que se desliza (ver ui/liquid.ts). */
function SidebarLens({ box, animate }: { box: { top: number; height: number } | null; animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const lens = useRef<LiquidIndicator | null>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    lens.current = createLiquidIndicator(ref.current)
    return () => lens.current?.destroy()
  }, [])
  useLayoutEffect(() => {
    if (box) lens.current?.to({ y: box.top, h: box.height }, !animate)
  }, [box?.top, box?.height, animate])
  return (
    <span
      ref={ref}
      aria-hidden
      className="lens absolute left-3 right-3 top-0 rounded-[18px] pointer-events-none origin-center will-change-transform"
      style={{ opacity: box ? 1 : 0, transition: 'opacity 200ms var(--ease-std)' }}
    />
  )
}
