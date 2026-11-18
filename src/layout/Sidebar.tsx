import { useLayoutEffect, useRef, useState } from 'react'
import { m as motion } from 'motion/react'
import { Plus } from 'lucide-react'

import { courseLine } from '@/data/defaults'
import { useSettings } from '@/state/StoreProvider'
import { hrefFor, type RouteId } from '@/router'
import { SyncBadge } from '@/features/account/SyncBadge'
import { spring } from '@/ui/motion'
import { cx } from '@/ui/primitives'
import { AccountAvatar, AssistantLauncher, CREATE_ITEMS, useChrome } from './chrome'
import { BrandMark, BrandWordmark } from './Brand'
import { NAV_GROUPS, NAV_ITEMS, NAV_TINTS, tintFill } from './navigation'

interface SidebarProps {
  current: RouteId
  /** Recuentos que se muestran junto a algunas secciones. */
  badges: Partial<Record<RouteId, number>>
}

/**
 * Barra lateral del iPad en horizontal (y de escritorio): un panel de cristal
 * que flota separado de los bordes, como la de iPadOS 26. El contenido pasa
 * por detrás y se adivina a través.
 */
export function Sidebar({ current, badges }: SidebarProps) {
  const settings = useSettings()
  const { openCreate, hasSubjects } = useChrome()
  const indicator = useActiveIndicator(current)

  return (
    <aside
      className={cx(
        'app-sidebar hidden lg:flex flex-col fixed z-30 w-[272px] rounded-[30px] liquid',
        'top-[max(0.75rem,env(safe-area-inset-top))] bottom-3 left-[max(0.75rem,env(safe-area-inset-left))]',
      )}
    >
      <div className="relative z-[2] flex flex-col min-h-0 flex-1">
        {/* --- Identidad --- */}
        <div className="px-4 pt-5 pb-4">
          <a
            href={hrefFor('inicio')}
            className="flex items-center gap-2.5 rounded-[14px] p-1.5 -m-1.5 hover:bg-fill transition-colors duration-150"
          >
            <BrandMark size={32} />
            <span className="flex flex-col gap-0.5 min-w-0">
              <BrandWordmark />
              <span className="text-[0.6875rem] text-ink-3 tabular-nums truncate">
                {courseLine(settings)}
              </span>
            </span>
          </a>
        </div>

        {/* --- Asistente y crear --- */}
        <div className="px-4 pb-4">
          <AssistantLauncher />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => openCreate('tarea')}
              className="pressable flex-1 flex items-center gap-2 h-11 pl-4 pr-3 rounded-full glass-tinted text-white text-[0.9375rem] font-semibold"
            >
              <Plus className="size-4" strokeWidth={2.6} />
              Nueva tarea
              <kbd className="ml-auto text-[0.6875rem] font-semibold opacity-75 tabular-nums rounded-[5px] bg-white/20 px-1.5 py-px">
                C
              </kbd>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {CREATE_ITEMS.filter((item) => item.kind !== 'tarea').map((item) => (
              <button
                key={item.kind}
                type="button"
                disabled={item.needsSubject && !hasSubjects}
                onClick={() => openCreate(item.kind)}
                className="glass-btn pressable flex flex-col items-center gap-1 py-2 rounded-[14px] text-[0.6875rem] font-semibold text-ink-2 hover:text-ink disabled:opacity-40"
              >
                <item.icon className="size-4" strokeWidth={2.2} style={{ color: item.tint }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* --- Navegación --- */}
        <nav
          ref={indicator.navRef}
          className="relative flex-1 overflow-y-auto no-scrollbar px-3 pb-4"
          aria-label="Secciones"
        >
          {/* Un solo indicador que viaja de una sección a otra. Se mueve en el
              espacio de la propia lista, no con un `layoutId`: la barra es
              `fixed` y Motion mide las animaciones compartidas en coordenadas
              de página, así que al cambiar de sección con la página desplazada
              (la memoria de scroll vuelve arriba) el indicador salía disparado
              tantos píxeles como hubiera desplazamiento y luego volvía. */}
          {indicator.box && (
            <motion.span
              aria-hidden
              initial={false}
              animate={{ y: indicator.box.top, height: indicator.box.height, opacity: 1 }}
              transition={indicator.animate ? spring.snappy : { duration: 0 }}
              className="lens absolute left-3 right-3 top-0 rounded-[12px] pointer-events-none"
            />
          )}
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter(
              (item) => item.group === group.id && item.id !== 'ajustes',
            )
            if (items.length === 0) return null
            return (
              <div key={group.id} className="mb-5 last:mb-0">
                <p className="eyebrow px-2.5 mb-1.5">{group.label}</p>
                <ul className="flex flex-col gap-px">
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
                            'pressable relative flex items-center gap-2.5 h-10 pl-2 pr-3 rounded-[12px]',
                            'text-[0.9375rem] transition-colors duration-150',
                            active
                              ? 'text-ink font-semibold'
                              : 'text-ink-2 hover:text-ink hover:bg-[var(--glass-tint)]/60',
                          )}
                        >
                          <span
                            className="tile relative grid place-items-center size-[26px] rounded-[8px] text-white shrink-0"
                            style={{ background: tintFill(NAV_TINTS[item.id]) }}
                          >
                            <item.icon className="size-[15px]" strokeWidth={2.3} />
                          </span>
                          <span className="relative truncate">{item.label}</span>
                          {count !== undefined && count > 0 && (
                            <span className="relative ml-auto text-[0.8125rem] font-semibold tabular-nums text-ink-3">
                              {count}
                            </span>
                          )}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>

        {/* --- Pie: la cuenta y los ajustes --- */}
        <a
          href={hrefFor('ajustes')}
          aria-current={current === 'ajustes' ? 'page' : undefined}
          className={cx(
            'pressable mx-3 mb-2 mt-1 flex items-center gap-3 rounded-[16px] px-2.5 py-2.5 transition-colors duration-150',
            current === 'ajustes' ? 'bg-[var(--glass-tint)]' : 'hover:bg-fill',
          )}
        >
          <AccountAvatar size={36} decorative />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold text-ink truncate">
              {settings.userName || 'Sin nombre'}
            </span>
            <span className="block text-[0.75rem] text-ink-3 truncate">Ajustes y cuenta</span>
          </span>
        </a>
        <div className="px-5 pb-4">
          <SyncBadge />
        </div>
      </div>
    </aside>
  )
}

/**
 * Posición del indicador de la sección activa, medida dentro de la lista.
 * La primera medida no se anima (al abrir la app ya está en su sitio).
 */
function useActiveIndicator(current: RouteId) {
  const navRef = useRef<HTMLElement>(null)
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  const measured = useRef(false)

  useLayoutEffect(() => {
    const link = navRef.current?.querySelector<HTMLElement>(`[data-nav="${current}"]`)
    if (!link) {
      // Ajustes vive en el pie, fuera de la lista: sin indicador.
      setBox(null)
      measured.current = false
      return
    }
    setBox({ top: link.offsetTop, height: link.offsetHeight })
  }, [current])

  useLayoutEffect(() => {
    if (box) measured.current = true
  })

  return { navRef, box, animate: measured.current }
}
