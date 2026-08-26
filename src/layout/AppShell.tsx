import type { ReactNode } from 'react'
import { TriangleAlert, X } from 'lucide-react'

import { useStore } from '@/state/StoreProvider'
import { hrefFor, type RouteId } from '@/router'
import { IconButton, cx } from '@/ui/primitives'
import { BrandMark, BrandWordmark } from './Brand'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'

interface AppShellProps {
  current: RouteId
  onCreate: () => void
  badges: Partial<Record<RouteId, number>>
  children: ReactNode
}

export function AppShell({ current, onCreate, badges, children }: AppShellProps) {
  const { storageError, dismissStorageError } = useStore()

  return (
    <div className="flex min-h-dvh">
      <Sidebar current={current} onCreate={onCreate} badges={badges} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Cabecera solo de móvil: en escritorio la identidad vive en el lateral. */}
        <header
          className={cx(
            'lg:hidden sticky top-0 z-20 h-14 px-4 flex items-center justify-between gap-3',
            'bg-canvas/92 backdrop-blur-md border-b border-hairline',
          )}
        >
          <a href={hrefFor('inicio')} className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <BrandWordmark />
          </a>
          <ThemeToggle />
        </header>

        {storageError && (
          <div
            role="alert"
            className="flex items-start gap-3 px-4 sm:px-6 py-3 bg-danger-quiet border-b border-danger/25"
          >
            <TriangleAlert className="size-4 text-danger shrink-0 mt-0.5" />
            <p className="text-[0.8125rem] text-ink-2 flex-1 min-w-0">{storageError}</p>
            <IconButton label="Descartar aviso" size="sm" onClick={dismissStorageError}>
              <X className="size-4" />
            </IconButton>
          </div>
        )}

        <main
          id="contenido"
          className={cx(
            'flex-1 min-w-0',
            // Hueco inferior en móvil para que la barra fija no tape contenido.
            'pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-16',
          )}
        >
          {children}
        </main>
      </div>

      <MobileNav current={current} onCreate={onCreate} badges={badges} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cabecera de página
// ---------------------------------------------------------------------------

interface PageProps {
  children: ReactNode
  className?: string
}

/** Contenedor de ancho controlado. El texto no debe cruzar toda una pantalla ancha. */
export function Page({ children, className }: PageProps) {
  return (
    <div className={cx('mx-auto w-full max-w-[1180px] px-5 sm:px-8 py-7 sm:py-10', className)}>
      {children}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** Fila de filtros o pestañas bajo el título. */
  toolbar?: ReactNode
}

export function PageHeader({ title, subtitle, actions, toolbar }: PageHeaderProps) {
  return (
    <header className="mb-7 sm:mb-9">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="display text-[1.75rem] sm:text-[2.125rem] leading-[1.1] tracking-[-0.025em]">
            {title}
          </h1>
          {subtitle && <p className="text-[0.875rem] text-ink-3 mt-1.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {toolbar && <div className="mt-6">{toolbar}</div>}
    </header>
  )
}
