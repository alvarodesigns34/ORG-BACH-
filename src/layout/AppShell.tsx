import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { m as motion, useScroll, useTransform } from 'motion/react'
import { TriangleAlert, X } from 'lucide-react'

import { useStore } from '@/state/StoreProvider'
import { type RouteId } from '@/router'
import { IconButton, cx } from '@/ui/primitives'
import { TopBar, useScrolledPast, type BackLink } from './chrome'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { NAV_ITEMS } from './navigation'
import { useEdgeSwipeBack } from './edgeSwipe'

interface AppShellProps {
  current: RouteId
  /** Cambia al entrar en otra pantalla (también en una ficha dentro de la sección). */
  screenKey: string
  /**
   * Vuelve a donde estaba al regresar a esta pantalla. Falso cuando se llega
   * por un enlace con destino (una alerta, «Ver todas»): ahí toca empezar arriba.
   */
  restoreScroll?: boolean
  badges: Partial<Record<RouteId, number>>
  /** En una ficha: adónde lleva el gesto de volver desde el borde. */
  backHref?: string
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

/**
 * Memoria de desplazamiento por pantalla, como las pestañas de iOS: al volver
 * a Tareas sigues donde lo dejaste. Una pantalla nueva (o con destino
 * concreto) empieza arriba: heredar el desplazamiento de la anterior haría
 * parecer que se ha cargado a medias.
 *
 * Quien se desplaza es la ventana, no `#contenido`.
 */
function useScrollMemory(key: string, restore: boolean) {
  const positions = useRef(new Map<string, number>())
  const current = useRef(key)

  useEffect(() => {
    const onScroll = () => positions.current.set(current.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Antes de pintar: sin parpadeo de la pantalla nueva en la posición vieja.
  useLayoutEffect(() => {
    current.current = key
    const target = (restore ? positions.current.get(key) : undefined) ?? 0
    window.scrollTo({ top: target })
    if (target === 0) return

    // Parte del contenido termina de medirse en los fotogramas siguientes
    // (listas animadas): si aún no había sitio para llegar, se reintenta
    // unos pocos fotogramas, salvo que el dedo o la rueda tomen el control.
    let frames = 0
    let frame = 0
    const giveUp = () => cancelAnimationFrame(frame)
    const retry = () => {
      if (Math.abs(window.scrollY - target) <= 1 || ++frames > 20) return
      window.scrollTo({ top: target })
      frame = requestAnimationFrame(retry)
    }
    frame = requestAnimationFrame(retry)
    window.addEventListener('wheel', giveUp, { once: true, passive: true })
    window.addEventListener('touchstart', giveUp, { once: true, passive: true })
    return () => {
      giveUp()
      window.removeEventListener('wheel', giveUp)
      window.removeEventListener('touchstart', giveUp)
    }
  }, [key, restore])
}

export function AppShell({
  current,
  screenKey,
  restoreScroll = true,
  badges,
  backHref,
  children,
}: AppShellProps) {
  useScrollMemory(screenKey, restoreScroll)
  const main = useRef<HTMLElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  useEdgeSwipeBack(screen, backHref, screenKey)
  const immersive = current === 'estudio'
  useEffect(() => {
    const title = NAV_ITEMS.find(({ id }) => id === current)?.label
    document.title = current === 'inicio' || !title ? 'Órbita' : `${title} · Órbita`
  }, [current])
  useLayoutEffect(() => {
    if (immersive || document.activeElement === document.body) main.current?.focus({ preventScroll: true })
  }, [screenKey, immersive])
  return (
    <div className="relative isolate min-h-dvh">
      <a
        href="#contenido"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault()
          main.current?.focus()
        }}
      >
        Saltar al contenido
      </a>
      {/* Luz ambiente con el color del contexto: lo que refracta el cristal. */}
      <div aria-hidden className="ambient" />
      <div inert={immersive}><Sidebar current={current} badges={badges} /></div>

      <div className="app-content min-w-0 flex flex-col min-h-dvh">
        <div inert={immersive}><StorageBanner /></div>

        <main
          id="contenido"
          ref={main}
          tabIndex={-1}
          className={cx(
            'flex-1 min-w-0 outline-none',
            'pt-[env(safe-area-inset-top)] lg:pt-0',
            // Hueco inferior para que la barra flotante no tape nada.
            'pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-16',
          )}
        >
          {/* La clave remonta la pantalla y con ello su entrada en cascada
              (ver `.page-enter`). */}
          <div key={screenKey} ref={screen}>{children}</div>
        </main>
      </div>

      <div inert={immersive}><MobileNav current={current} badges={badges} /></div>
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
        'page-enter mx-auto w-full max-w-[1180px]',
        // En móvil, el hueco de arriba es el de la barra superior flotante.
        'px-[max(1.25rem,env(safe-area-inset-left))] sm:px-8 pt-[3.75rem] lg:pt-[4.75rem] pb-6',
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
  /** Título aún mayor, para la portada (Inicio). */
  large?: boolean
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
  large,
}: PageHeaderProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { past, scrolled } = useScrolledPast(heading)
  // Al tirar hacia abajo en lo alto (el rebote elástico de iOS), el título
  // grande crece un poco, como en las apps del sistema.
  const { scrollY } = useScroll()
  const stretch = useTransform(scrollY, [-140, 0], [1.14, 1], { clamp: true })
  return (
    <header className="mb-6 sm:mb-8">
      <TopBar
        title={compactTitle ?? title}
        collapsed={past}
        scrolled={scrolled}
        back={back}
        actions={actions}
      />
      {eyebrow && (
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-ink-3 mb-1">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <motion.h1
            ref={heading}
            style={{ scale: stretch, transformOrigin: 'left bottom' }}
            className={cx(
              'display leading-[1.06]',
              large
                ? 'text-[2.25rem] sm:text-[3rem] tracking-[-0.035em]'
                : 'text-[2.125rem] sm:text-[2.5rem] tracking-[-0.03em]',
            )}
          >
            {title}
          </motion.h1>
          {subtitle && <div className="text-[0.9375rem] text-ink-3 mt-1">{subtitle}</div>}
        </div>
        {/* En el iPad en horizontal las acciones suben a la barra de
            herramientas flotante, junto al «+». */}
        {actions && <div className="lg:hidden flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {toolbar && <div className="mt-5">{toolbar}</div>}
    </header>
  )
}
