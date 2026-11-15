import { motion } from 'motion/react'
import { Mic, Plus } from 'lucide-react'

import { courseLine } from '@/data/defaults'
import { useSettings } from '@/state/StoreProvider'
import { hrefFor, type RouteId } from '@/router'
import { SyncBadge } from '@/features/account/SyncBadge'
import { spring } from '@/ui/motion'
import { cx } from '@/ui/primitives'
import { AccountAvatar, CREATE_ITEMS, useChrome } from './chrome'
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
  const { openAssistant, openCreate, hasSubjects } = useChrome()

  return (
    <aside
      className={cx(
        'hidden lg:flex flex-col fixed z-30 w-[272px] rounded-[30px] liquid',
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

        {/* --- Crear --- */}
        <div className="px-4 pb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openCreate('tarea')}
              className="pressable flex-1 flex items-center gap-2 h-11 pl-4 pr-3 rounded-full bg-accent-fill text-white text-[0.9375rem] font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_14px_rgb(0_113_227/0.28)]"
            >
              <Plus className="size-4" strokeWidth={2.6} />
              Nueva tarea
              <kbd className="ml-auto text-[0.6875rem] font-semibold opacity-75 tabular-nums rounded-[5px] bg-white/20 px-1.5 py-px">
                C
              </kbd>
            </button>
            <button
              type="button"
              onClick={openAssistant}
              aria-label="Asistente"
              title="Asistente"
              className="pressable grid place-items-center size-11 rounded-full bg-fill text-accent shrink-0"
            >
              <Mic className="size-[18px]" strokeWidth={2.3} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {CREATE_ITEMS.filter((item) => item.kind !== 'tarea').map((item) => (
              <button
                key={item.kind}
                type="button"
                disabled={item.needsSubject && !hasSubjects}
                onClick={() => openCreate(item.kind)}
                className="pressable flex flex-col items-center gap-1 py-2 rounded-[14px] bg-fill text-[0.6875rem] font-semibold text-ink-2 hover:text-ink disabled:opacity-40"
              >
                <item.icon className="size-4" strokeWidth={2.2} style={{ color: item.tint }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* --- Navegación --- */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4" aria-label="Secciones">
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
                          aria-current={active ? 'page' : undefined}
                          className={cx(
                            'pressable relative flex items-center gap-2.5 h-10 pl-2 pr-3 rounded-[12px]',
                            'text-[0.9375rem] transition-colors duration-150',
                            active
                              ? 'text-ink font-semibold'
                              : 'text-ink-2 hover:text-ink hover:bg-[var(--glass-tint)]/60',
                          )}
                        >
                          {/* Un solo indicador que viaja de una sección a otra. */}
                          {active && (
                            <motion.span
                              aria-hidden
                              layoutId="sidebar-activo"
                              transition={spring.snappy}
                              className="absolute inset-0 rounded-[12px] bg-[var(--glass-tint)] shadow-[inset_0_0_0_0.5px_var(--glass-edge)]"
                            />
                          )}
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
