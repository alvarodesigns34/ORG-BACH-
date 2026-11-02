import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { TriangleAlert, X } from 'lucide-react'

import { useStore } from '@/state/StoreProvider'
import { type RouteId } from '@/router'
import { IconButton, cx } from '@/ui/primitives'
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
        {/* Material bajo la hora y el Dynamic Island: el contenido que pasa
            por debajo al desplazarse no se mezcla con los iconos del sistema. */}
        <div
          aria-hidden
          className="lg:hidden fixed top-0 inset-x-0 z-20 h-[env(safe-area-inset-top)] glass-bar"
        />

        <StorageBanner />

        <main
          id="contenido"
          className={cx(
            'flex-1 min-w-0',
            'pt-[env(safe-area-inset-top)] lg:pt-0',
            // Hueco inferior en móvil para que la barra flotante no tape nada.
            'pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-16',
          )}
        >
          {/* La clave reinicia la animación de entrada en cada sección. */}
          <div key={current} className="animate-[rise_380ms_var(--ease-out)_both]">
            {children}
          </div>
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
    <div
      className={cx(
        'mx-auto w-full max-w-[1180px]',
        'px-[max(1.125rem,env(safe-area-inset-left))] sm:px-8 pt-5 sm:pt-10 pb-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Alto de la barra compacta, sin contar la zona segura. */
const COMPACT_BAR = 44

/**
 * ¿Ha pasado el elemento por debajo de la barra compacta?
 *
 * Se mide contra la posición real de la barra (zona segura + 44 px), que en
 * un iPhone con Dynamic Island no es la misma que en un Android o un iPad.
 */
export function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const node = ref.current
      if (!node) return
      const safeTop =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0
      const next = window.scrollY > 4 && node.getBoundingClientRect().bottom < safeTop + COMPACT_BAR
      setPast((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ref])
  return past
}

/**
 * Barra superior compacta del móvil.
 *
 * Aparece cuando el título grande sale de la pantalla, como en las apps de
 * iOS: el alumno siempre sabe dónde está sin que el título ocupe sitio.
 * Es decorativa para lectores de pantalla: el `h1` real sigue en la página.
 */
export function CompactTitleBar({ title, visible }: { title: string; visible: boolean }) {
  return (
    <div
      aria-hidden
      className={cx(
        'lg:hidden fixed top-0 inset-x-0 z-20 pointer-events-none',
        'pt-[env(safe-area-inset-top)] glass-bar border-b',
        'transition-[opacity,border-color] duration-300',
        visible ? 'opacity-100 border-hairline' : 'opacity-0 border-transparent',
      )}
    >
      <p
        className={cx(
          'h-11 grid place-items-center px-16 text-[1.0625rem] font-semibold tracking-[-0.02em] truncate',
          'transition-transform duration-500 ease-[var(--spring)]',
          visible ? 'translate-y-0' : 'translate-y-2',
        )}
      >
        {title}
      </p>
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
  const heading = useRef<HTMLHeadingElement>(null)
  const collapsed = useScrolledPast(heading)
  return (
    <header className="mb-6 sm:mb-8">
      <CompactTitleBar title={title} visible={collapsed} />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 ref={heading} className="display text-[2.125rem] sm:text-[2.5rem] leading-[1.08]">
            {title}
          </h1>
          {subtitle && <p className="text-[0.9375rem] text-ink-3 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {toolbar && <div className="mt-5">{toolbar}</div>}
    </header>
  )
}
