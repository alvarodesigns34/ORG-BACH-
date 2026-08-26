import { useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'

import { hrefFor, type RouteId } from '@/router'
import { cx } from '@/ui/primitives'
import { Modal } from '@/ui/Modal'
import { MOBILE_PRIMARY, NAV_GROUPS, NAV_ITEMS } from './navigation'

interface MobileNavProps {
  current: RouteId
  onCreate: () => void
  badges: Partial<Record<RouteId, number>>
}

/**
 * Navegación de móvil y tablet.
 *
 * Barra inferior fija con las cuatro secciones del día a día y un acceso a las
 * demás. No es la barra lateral encogida: el orden es distinto porque en el
 * móvil lo que se consulta de pie es lo de hoy, no las estadísticas.
 */
export function MobileNav({ current, onCreate, badges }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const primary = MOBILE_PRIMARY.map((id) => NAV_ITEMS.find((i) => i.id === id)!).filter(Boolean)
  const inSheet = !MOBILE_PRIMARY.includes(current)

  return (
    <>
      {/* Botón de creación, por encima de la barra y al alcance del pulgar. */}
      <button
        type="button"
        onClick={onCreate}
        aria-label="Crear"
        className={cx(
          'lg:hidden fixed right-4 z-30 size-14 rounded-full',
          'bg-accent text-accent-ink shadow-lg',
          'grid place-items-center active:scale-95 transition-transform duration-150',
          'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
        )}
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>

      <nav
        aria-label="Secciones"
        className={cx(
          'lg:hidden fixed bottom-0 inset-x-0 z-30',
          'bg-surface/92 backdrop-blur-md border-t border-hairline',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="grid grid-cols-5">
          {primary.map((item) => {
            const active = item.id === current
            const count = badges[item.id]
            return (
              <li key={item.id}>
                <a
                  href={hrefFor(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex flex-col items-center justify-center gap-1 h-[4.25rem]',
                    'text-[0.6875rem] font-medium transition-colors duration-150',
                    active ? 'text-accent' : 'text-ink-3',
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-0 w-8 h-[2px] rounded-b-full bg-accent"
                    />
                  )}
                  <span className="relative">
                    <item.icon className="size-[21px]" strokeWidth={active ? 2.3 : 1.9} />
                    {count !== undefined && count > 0 && (
                      <span
                        className={cx(
                          'absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full',
                          'text-[0.625rem] font-bold tabular-nums leading-4 text-center',
                          'bg-danger text-white',
                        )}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </span>
                  {item.label}
                </a>
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              className={cx(
                'relative w-full flex flex-col items-center justify-center gap-1 h-[4.25rem]',
                'text-[0.6875rem] font-medium transition-colors duration-150',
                inSheet ? 'text-accent' : 'text-ink-3',
              )}
            >
              {inSheet && (
                <span aria-hidden className="absolute top-0 w-8 h-[2px] rounded-b-full bg-accent" />
              )}
              <MoreHorizontal className="size-[21px]" strokeWidth={inSheet ? 2.3 : 1.9} />
              Más
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Todas las secciones">
        <div className="flex flex-col gap-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="eyebrow mb-2">{group.label}</p>
              <ul className="flex flex-col gap-1">
                {NAV_ITEMS.filter((item) => item.group === group.id).map((item) => {
                  const active = item.id === current
                  return (
                    <li key={item.id}>
                      <a
                        href={hrefFor(item.id)}
                        onClick={() => setSheetOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'flex items-center gap-3 h-12 px-3 rounded-md text-[0.9375rem]',
                          'transition-colors duration-150',
                          active
                            ? 'bg-accent-quiet text-accent font-semibold'
                            : 'text-ink hover:bg-sunken',
                        )}
                      >
                        <item.icon className="size-5 shrink-0" strokeWidth={active ? 2.25 : 1.9} />
                        {item.label}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
