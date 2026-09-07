import { Plus } from 'lucide-react'

import { useSettings } from '@/state/StoreProvider'
import { hrefFor, type RouteId } from '@/router'
import { Button, cx } from '@/ui/primitives'
import { BrandMark, BrandWordmark } from './Brand'
import { NAV_GROUPS, NAV_ITEMS } from './navigation'
import { ThemeToggle } from './ThemeToggle'

interface SidebarProps {
  current: RouteId
  onCreate: () => void
  /** Recuentos que se muestran junto a algunas secciones. */
  badges: Partial<Record<RouteId, number>>
}

export function Sidebar({ current, onCreate, badges }: SidebarProps) {
  const settings = useSettings()

  return (
    <aside className="hidden lg:flex flex-col w-[268px] shrink-0 border-r border-hairline bg-surface h-dvh sticky top-0 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]">
      {/* --- Identidad --- */}
      <div className="px-5 pt-5 pb-4">
        <a
          href={hrefFor('inicio')}
          className="flex items-center gap-2.5 rounded-sm -m-1 p-1 hover:bg-sunken transition-colors duration-150"
        >
          <BrandMark />
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
          <Plus className="size-4" strokeWidth={2.5} />
          Crear
          <kbd className="ml-auto text-[0.6875rem] font-sans font-medium opacity-60 tabular-nums">
            C
          </kbd>
        </Button>
      </div>

      {/* --- Navegación --- */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Secciones">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <p className="eyebrow px-3 mb-1.5">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {NAV_ITEMS.filter((item) => item.group === group.id).map((item) => {
                const active = item.id === current
                const count = badges[item.id]
                return (
                  <li key={item.id}>
                    <a
                      href={hrefFor(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'relative flex items-center gap-2.5 h-9 pl-3 pr-2.5 rounded-sm',
                        'text-[0.875rem] transition-colors duration-150',
                        active
                          ? 'bg-accent-quiet text-accent font-semibold'
                          : 'text-ink-2 hover:bg-sunken hover:text-ink',
                      )}
                    >
                      {/* Marca de sección activa: no depende solo del color. */}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-accent"
                        />
                      )}
                      <item.icon
                        className="size-[17px] shrink-0"
                        strokeWidth={active ? 2.25 : 1.9}
                      />
                      <span className="truncate">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span
                          className={cx(
                            'ml-auto text-[0.6875rem] font-semibold tabular-nums',
                            'px-1.5 h-5 inline-flex items-center rounded-full',
                            active ? 'bg-accent text-accent-ink' : 'bg-sunken text-ink-3',
                          )}
                        >
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
      <div className="px-4 py-3 border-t border-hairline flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-ink truncate">
            {settings.userName || 'Sin nombre'}
          </p>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  )
}
