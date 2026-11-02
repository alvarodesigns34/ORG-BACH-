import { useRef, type ReactNode } from 'react'
import { TriangleAlert, X } from 'lucide-react'

import { useStore } from '@/state/StoreProvider'
import { type RouteId } from '@/router'
import { IconButton, cx } from '@/ui/primitives'
import { TopBar, useScrolledPast, type BackLink } from './chrome'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  current: RouteId
  onCreate: () => void
  badges: Partial<Record<RouteId, number>>
  children: ReactNode
}

/**
 * Aviso del almacenamiento, en su propia franja.
 *
 * Vive fuera de `AppShell` porque el caso que más importa —los datos guardados
 * no se pueden leer— deja la aplicación en estado vacío, y con el estado vacío
 * se pinta el alta en lugar del shell. Si el aviso viviera solo aquí dentro,
 * el único momento en que hay algo grave que contar sería justo el momento en
 * que nadie lo vería.
 */
export function StorageBanner() {
  const { storageNotice, dismissStorageNotice } = useStore()
  if (!storageNotice) return null

  const isError = storageNotice.level === 'error'

  return (
    <div
      // 'alert' interrumpe al lector de pantalla; 'status' espera a que termine
      // lo que estaba leyendo. Un fallo de guardado merece lo primero; unos
      // registros descartados al abrir, no.
      role={isError ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-3 px-4 sm:px-6 py-3 border-b',
        isError ? 'bg-danger-quiet border-danger/25' : 'bg-warn-quiet border-warn/25',
      )}
    >
      <TriangleAlert
        className={cx('size-4 shrink-0 mt-0.5', isError ? 'text-danger' : 'text-warn')}
      />
      <p className="text-[0.8125rem] text-ink-2 flex-1 min-w-0">{storageNotice.text}</p>
      <IconButton label="Descartar aviso" size="sm" onClick={dismissStorageNotice}>
        <X className="size-4" />
      </IconButton>
    </div>
  )
}

export function AppShell({ current, onCreate, badges, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar current={current} onCreate={onCreate} badges={badges} />

      <div className="flex-1 min-w-0 flex flex-col">
        <StorageBanner />

        <main
          id="contenido"
          className={cx(
            'flex-1 min-w-0',
            'pt-[env(safe-area-inset-top)] lg:pt-0',
            // Hueco inferior en móvil para que la barra de pestañas no tape nada.
            'pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-16',
          )}
        >
          {/* La clave reinicia la animación de entrada en cada sección. */}
          <div key={current} className="animate-[rise_380ms_var(--ease-out)_both]">
            {children}
          </div>
        </main>
      </div>

      <MobileNav current={current} badges={badges} />
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
    <div
      className={cx(
        'mx-auto w-full max-w-[1180px]',
        // En móvil, el hueco de arriba es el de la barra superior fija.
        'px-[max(1rem,env(safe-area-inset-left))] sm:px-8 pt-[3.25rem] lg:pt-10 pb-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  /** Línea pequeña sobre el título (fecha, contexto). */
  eyebrow?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Fila de filtros o pestañas bajo el título. */
  toolbar?: ReactNode
  /** Vuelta atrás en la barra superior («‹ Asignaturas»). */
  back?: BackLink
  /** Título de la barra compacta, si no es el mismo (p. ej. «Inicio»). */
  compactTitle?: string
}

/**
 * Título grande al estilo de iOS. Al desplazarse, se resume en la barra
 * superior (ver `TopBar`), que también lleva «+» y el acceso a Ajustes.
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  toolbar,
  back,
  compactTitle,
}: PageHeaderProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { past, scrolled } = useScrolledPast(heading)
  return (
    <header className="mb-6 sm:mb-8">
      <TopBar title={compactTitle ?? title} collapsed={past} scrolled={scrolled} back={back} />
      {back && (
        <a
          href={back.href}
          className="max-lg:hidden inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent hover:underline underline-offset-4 mb-4"
        >
          ‹ {back.label}
        </a>
      )}
      {eyebrow && (
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-ink-3 mb-1">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 ref={heading} className="display text-[2.125rem] sm:text-[2.5rem] leading-[1.08]">
            {title}
          </h1>
          {subtitle && <div className="text-[0.9375rem] text-ink-3 mt-1">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {toolbar && <div className="mt-5">{toolbar}</div>}
    </header>
  )
}
