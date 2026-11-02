import { Plus } from 'lucide-react'

import { useSettings } from '@/state/StoreProvider'
import { hrefFor, type RouteId } from '@/router'
import { SyncBadge } from '@/features/account/SyncBadge'
import { Button, cx } from '@/ui/primitives'
import { BrandMark, BrandWordmark } from './Brand'
import { NAV_GROUPS, NAV_ITEMS, NAV_TINTS } from './navigation'

interface SidebarProps {
  current: RouteId
  onCreate: () => void
  /** Recuentos que se muestran junto a algunas secciones. */
  badges: Partial<Record<RouteId, number>>
}

/** Barra lateral de escritorio, al estilo de las apps de macOS. */
export function Sidebar({ current, onCreate, badges }: SidebarProps) {
  const settings = useSettings()

  return (
    <aside
      className={cx(
        'hidden lg:flex flex-col w-[264px] shrink-0 h-dvh sticky top-0',
        'glass-bar border-r border-hairline',
        'pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]',
      )}
    >
      {/* --- Identidad --- */}
      <div className="px-4 pt-5 pb-4">
        <a
          href={hrefFor('inicio')}
          className="flex items-center gap-2.5 rounded-[12px] p-1.5 -m-1.5 hover:bg-fill transition-colors duration-150"
        >
          <BrandMark size={32} />
          <span className="flex flex-col gap-0.5 min-w-0">
            <BrandWordmark />
            <span className="text-[0.6875rem] text-ink-3 tabular-nums truncate">
              {settings.course} · {settings.academicYear}
            </span>
          </span>
        </a>
      </div>

      <div className="px-4 pb-4">
        <Button variant="primary" block onClick={onCreate} className="justify-start">
          <Plus className="size-4" strokeWidth={2.6} />
          Nueva tarea
          <kbd className="ml-auto text-[0.6875rem] font-semibold opacity-70 tabular-nums rounded-[5px] bg-white/20 px-1.5 py-px">
            C
          </kbd>
        </Button>
      </div>

      {/* --- Navegación --- */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Secciones">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <p className="eyebrow px-2.5 mb-1.5">{group.label}</p>
            <ul className="flex flex-col gap-px">
              {NAV_ITEMS.filter((item) => item.group === group.id).map((item) => {
                const active = item.id === current
                const count = badges[item.id]
                return (
                  <li key={item.id}>
                    <a
                      href={hrefFor(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex items-center gap-2.5 h-9 pl-2 pr-2.5 rounded-[10px]',
                        'text-[0.875rem] transition-colors duration-150',
                        active
                          ? 'bg-accent-quiet text-ink font-semibold'
                          : 'text-ink-2 hover:bg-fill hover:text-ink',
                      )}
                    >
                      <span
                        className="grid place-items-center size-6 rounded-[7px] text-white shrink-0"
                        style={{ background: NAV_TINTS[item.id] }}
                      >
                        <item.icon className="size-[14px]" strokeWidth={2.3} />
                      </span>
                      <span className="truncate">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span className="ml-auto text-[0.75rem] font-semibold tabular-nums text-ink-3">
                          {count}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* --- Pie --- */}
      <div className="px-4 py-3 border-t border-hairline flex flex-col gap-1">
        <p className="text-[0.8125rem] font-semibold text-ink truncate">
          {settings.userName || 'Sin nombre'}
        </p>
        <SyncBadge />
      </div>
    </aside>
  )
}
