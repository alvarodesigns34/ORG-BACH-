import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m as motion } from 'motion/react'
import {
  CalendarPlus,
  ChevronLeft,
  GraduationCap,
  ListChecks,
  NotebookPen,
  PanelLeft,
  Plus,
  Sparkle,
  type LucideIcon,
} from 'lucide-react'

import { hrefFor } from '@/router'
import { useSettings } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { Menu } from '@/ui/Menu'
import { exitFast, haptic, spring } from '@/ui/motion'
import { cx } from '@/ui/primitives'
import { toggleSidebar, useSidebarPrefs } from './sidebarState'

// ---------------------------------------------------------------------------
// Acciones globales
// ---------------------------------------------------------------------------

/** Lo que se puede crear desde cualquier pantalla con el botón «+». */
export type CreateKind = 'tarea' | 'examen' | 'nota' | 'evento'

interface Chrome {
  /** Abre el editor de lo que se pida; sin argumento, una tarea. */
  openCreate: (kind?: CreateKind) => void
  /** Abre el asistente; con «voice», empieza a dictar directamente. */
  openAssistant: (mode?: 'text' | 'voice') => void
  /** Hay asignaturas: exámenes y notas necesitan una. */
  hasSubjects: boolean
}

const ChromeContext = createContext<Chrome>({
  openCreate: () => {},
  openAssistant: () => {},
  hasSubjects: false,
})

export function ChromeProvider({ value, children }: { value: Chrome; children: ReactNode }) {
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useChrome(): Chrome {
  return useContext(ChromeContext)
}

export const CREATE_ITEMS: {
  kind: CreateKind
  label: string
  icon: LucideIcon
  tint: string
  needsSubject?: boolean
  /** Atajo de teclado (ver `shortcuts.tsx`). */
  key?: string
}[] = [
  { kind: 'tarea', label: 'Tarea', icon: ListChecks, tint: '#5e5ce6', key: 'C' },
  { kind: 'examen', label: 'Examen', icon: NotebookPen, tint: '#ff453a', needsSubject: true, key: 'E' },
  { kind: 'nota', label: 'Nota', icon: GraduationCap, tint: '#bf5af2', needsSubject: true, key: 'G' },
  { kind: 'evento', label: 'Evento', icon: CalendarPlus, tint: '#ff9f0a', key: 'V' },
]

/**
 * «+» de la barra de herramientas: un botón de cristal tintado (la acción
 * principal) que abre un menú que brota de él, como en las apps de iPadOS 26.
 */
export function CreateMenu({ tinted = true }: { tinted?: boolean }) {
  const { openCreate, hasSubjects } = useChrome()
  return (
    <Menu
      label="Crear"
      width={220}
      items={CREATE_ITEMS.map((item) => ({
        id: item.kind,
        label: item.label,
        hint: item.key,
        disabled: item.needsSubject && !hasSubjects,
        icon: <item.icon className="size-[18px]" strokeWidth={2.1} style={{ color: item.tint }} />,
        onSelect: () => openCreate(item.kind),
      }))}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          onClick={() => {
            haptic()
            props.onClick()
          }}
          aria-label="Crear"
          aria-haspopup="menu"
          title="Crear"
          className={cx(
            'pressable grid place-items-center size-11 rounded-full',
            tinted ? 'glass-tinted text-white' : 'glass-btn text-ink',
          )}
        >
          <Plus
            className={cx(
              'size-[22px] transition-transform duration-300 ease-[var(--spring)]',
              props['aria-expanded'] && 'rotate-45',
            )}
            strokeWidth={2.4}
          />
        </button>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Luz ambiente
// ---------------------------------------------------------------------------

/**
 * Tiñe la luz ambiente (lo que refracta el cristal) con el color del
 * contexto: la asignatura que toca ahora, la de la ficha abierta… Al salir de
 * la pantalla vuelve al acento. La transición la hace el CSS (`--amb`).
 */
export function useAmbient(color: string | null | undefined): void {
  useEffect(() => {
    if (!color) return
    const root = document.documentElement
    root.style.setProperty('--amb', color)
    return () => {
      root.style.removeProperty('--amb')
    }
  }, [color])
}

// ---------------------------------------------------------------------------
// Desplazamiento
// ---------------------------------------------------------------------------

/** Alto de la barra superior del móvil, sin contar la zona segura. */
export const TOP_BAR = 48

/**
 * ¿Ha pasado el elemento por debajo de la barra superior?
 *
 * Se mide contra la posición real de la barra (zona segura + su alto), que en
 * un iPhone con Dynamic Island no es la misma que en un iPad.
 */
export function useScrolledPast(ref: RefObject<HTMLElement | null>): {
  past: boolean
  scrolled: boolean
} {
  const [state, setState] = useState({ past: false, scrolled: false })
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const node = ref.current
      const safeTop =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0
      const scrolled = window.scrollY > 2
      const past = !!node && scrolled && node.getBoundingClientRect().bottom < safeTop + TOP_BAR
      setState((prev) =>
        prev.past === past && prev.scrolled === scrolled ? prev : { past, scrolled },
      )
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
  return state
}

// ---------------------------------------------------------------------------
// Barra superior (iPhone y iPad en vertical)
// ---------------------------------------------------------------------------

export interface BackLink {
  href: string
  label: string
}

/**
 * Barra superior, al estilo de iOS 26: no es una franja con línea, son
 * botones de cristal que flotan sobre el contenido, y el contenido se
 * desenfoca y se disuelve al pasar por debajo (`.edge-top`).
 *
 * - A la izquierda, la vuelta atrás cuando la hay.
 * - En el centro, el título pequeño, que aparece cuando el grande sale de la
 *   pantalla.
 * - A la derecha, el asistente y el avatar (Ajustes).
 *
 * Va en un portal: la entrada animada de cada sección usa `transform`, y un
 * elemento fijo dentro de un ancestro transformado se mueve con él.
 */
export function TopBar({
  title,
  collapsed,
  scrolled,
  back,
  actions,
}: {
  title: string
  collapsed: boolean
  scrolled: boolean
  back?: BackLink
  /** Acciones de la pantalla: en el iPad van en la barra de herramientas. */
  actions?: ReactNode
}) {
  return createPortal(
    <>
      <PadToolbar
        title={title}
        collapsed={collapsed}
        scrolled={scrolled}
        back={back}
        actions={actions}
      />
      <div aria-hidden className="edge-top lg:hidden" style={{ opacity: scrolled ? 1 : 0 }} />
      <div aria-hidden className="edge-top-blur lg:hidden" style={{ opacity: scrolled ? 1 : 0 }} />
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 pt-[env(safe-area-inset-top)] pointer-events-none">
        <div
          className="relative flex items-center justify-between gap-2 px-[max(0.75rem,env(safe-area-inset-left))]"
          style={{ height: TOP_BAR }}
        >
          {back ? (
            <a
              href={back.href}
              aria-label={`Volver a ${back.label}`}
              className="chrome-controls pressable liquid pointer-events-auto grid place-items-center size-10 rounded-full text-ink"
            >
              <ChevronLeft className="relative z-[2] size-[22px] -ml-0.5" strokeWidth={2.4} />
            </a>
          ) : (
            <span />
          )}

          <AnimatePresence>
            {collapsed && (
              <motion.p
                aria-hidden
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 6, filter: 'blur(4px)', transition: exitFast }}
                transition={spring.snappy}
                className="absolute inset-x-28 text-center text-[1.0625rem] font-semibold tracking-[-0.012em] truncate"
              >
                {title}
              </motion.p>
            )}
          </AnimatePresence>

          <ChromeActions className="chrome-controls pointer-events-auto" compact={collapsed} />
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * Barra de herramientas del iPad en horizontal y del ordenador (iPadOS 26):
 * sin franja ni línea, solo botones de cristal que flotan sobre el contenido,
 * con el título pequeño en el centro cuando el grande sale de la pantalla.
 *
 * - A la izquierda, mostrar la barra lateral (si está oculta) y volver.
 * - A la derecha, el asistente (si la barra lateral está oculta) y «+».
 */
function PadToolbar({
  title,
  collapsed,
  scrolled,
  back,
  actions,
}: {
  title: string
  collapsed: boolean
  scrolled: boolean
  back?: BackLink
  actions?: ReactNode
}) {
  const { hidden } = useSidebarPrefs()
  const { openAssistant } = useChrome()
  return (
    <>
      <div aria-hidden className="edge-top-lg hidden lg:block" style={{ opacity: scrolled ? 1 : 0 }} />
      <div
        aria-hidden
        className="edge-top-lg-blur hidden lg:block"
        style={{ opacity: scrolled ? 1 : 0 }}
      />
      <div className="app-toolbar hidden lg:block fixed top-0 right-0 z-40 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
        <div className="relative flex items-center justify-between gap-2 h-11 pl-3 pr-[max(0.75rem,env(safe-area-inset-right))]">
          <div className="chrome-controls flex items-center gap-2">
            <AnimatePresence initial={false}>
              {hidden && (
                <motion.button
                  key="sidebar"
                  type="button"
                  initial={{ opacity: 0, scale: 0.5, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: spring.bouncy }}
                  exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)', transition: exitFast }}
                  onClick={() => {
                    haptic()
                    toggleSidebar(false)
                  }}
                  aria-label="Mostrar la barra lateral"
                  title="Mostrar la barra lateral"
                  className="glass-btn pointer-events-auto grid place-items-center size-11 rounded-full text-ink"
                >
                  <PanelLeft className="size-[20px]" strokeWidth={2} />
                </motion.button>
              )}
            </AnimatePresence>
            {back && (
              <a
                href={back.href}
                aria-label={`Volver a ${back.label}`}
                className="glass-btn pressable pointer-events-auto flex items-center h-11 pl-2.5 pr-4 rounded-full text-ink text-[0.9375rem] font-semibold"
              >
                <ChevronLeft className="size-[22px]" strokeWidth={2.4} />
                <span className="truncate max-w-[14rem]">{back.label}</span>
              </a>
            )}
          </div>

          <AnimatePresence>
            {collapsed && (
              <motion.p
                aria-hidden
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 6, filter: 'blur(4px)', transition: exitFast }}
                transition={spring.snappy}
                className="absolute inset-x-56 text-center text-[1.0625rem] font-semibold tracking-[-0.012em] truncate"
              >
                {title}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="chrome-controls pointer-events-auto flex items-center gap-2">
            <AnimatePresence initial={false}>
              {hidden && (
                <motion.button
                  key="assistant"
                  type="button"
                  initial={{ opacity: 0, scale: 0.5, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: spring.bouncy }}
                  exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)', transition: exitFast }}
                  onClick={() => {
                    haptic()
                    openAssistant()
                  }}
                  aria-label="Asistente: escribe o habla"
                  title="Asistente"
                  className="glass-btn grid place-items-center size-11 rounded-full text-accent"
                >
                  <AssistantIcon className="size-[20px]" />
                </motion.button>
              )}
            </AnimatePresence>
            {actions}
            {/* Si la pantalla ya tiene su acción principal (tintada), el «+»
                es de cristal claro: una sola acción tintada por barra. */}
            <CreateMenu tinted={!actions} />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Icono del asistente: un solo destello de trazo fino, en el color de la app.
 * Sin fondo ni degradado, como el resto de iconos de la interfaz.
 */
export function AssistantIcon({ className }: { className?: string }) {
  return <Sparkle className={className} strokeWidth={1.9} aria-hidden />
}

/**
 * Asistente y avatar, arriba a la derecha. Crear va abajo, junto al pulgar.
 *
 * El asistente es una cápsula con nombre, no un micrófono suelto: se le
 * escribe o se le habla. Cuando el título pequeño ocupa el centro de la barra,
 * la cápsula se encoge a su icono para dejarle sitio.
 */
export function ChromeActions({
  className,
  compact,
}: {
  className?: string
  /** Solo el icono (el título pequeño está a la vista). */
  compact?: boolean
}) {
  const { openAssistant } = useChrome()
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => {
          haptic()
          openAssistant()
        }}
        aria-label="Asistente: escribe o habla"
        className={cx(
          'pressable liquid relative flex items-center h-10 rounded-full text-accent',
          'transition-[padding] duration-300 ease-[var(--spring)]',
          compact ? 'px-0' : 'pl-0 pr-3.5',
        )}
      >
        <span className="relative z-[2] grid place-items-center size-10 shrink-0">
          <AssistantIcon className="size-[19px]" />
        </span>
        <span
          aria-hidden
          className={cx(
            'relative z-[2] overflow-hidden whitespace-nowrap text-[0.9375rem] font-semibold',
            'transition-[max-width,opacity,margin] duration-300 ease-[var(--spring)]',
            compact ? 'max-w-0 opacity-0 ml-0' : 'max-w-[6.5rem] opacity-100 -ml-1',
          )}
        >
          Asistente
        </span>
      </button>
      <AccountAvatar size={40} />
    </div>
  )
}

/**
 * Avatar con la inicial: lleva a Ajustes, como el de la App Store o Salud.
 * Un punto indica, sin texto, si la sincronización necesita atención.
 */
export function AccountAvatar({
  size = 36,
  decorative,
}: {
  size?: number
  /** Dentro de otro enlace: se pinta sin ser enlace él mismo. */
  decorative?: boolean
}) {
  const settings = useSettings()
  const sync = useSync()
  const initial = (settings.userName.trim()[0] ?? '·').toUpperCase()
  const dot =
    sync.phase === 'error' || sync.phase === 'needs-choice'
      ? 'bg-danger'
      : sync.phase === 'offline' && sync.pending > 0
        ? 'bg-warn'
        : null
  const label =
    dot === 'bg-danger'
      ? 'Ajustes y cuenta (la sincronización necesita atención)'
      : dot
        ? 'Ajustes y cuenta (cambios pendientes de subir)'
        : 'Ajustes y cuenta'

  const Tag = decorative ? 'span' : 'a'
  return (
    <Tag
      {...(decorative
        ? { 'aria-hidden': true }
        : { href: hrefFor('ajustes'), 'aria-label': label })}
      className="pressable relative grid place-items-center rounded-full text-white font-semibold shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_0_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.18)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        // El de los contactos de iOS: degradado gris con luz arriba.
        background: 'linear-gradient(180deg, #a9a9b2 0%, #7c7c86 100%)',
      }}
    >
      {initial}
      {dot && (
        <span
          aria-hidden
          className={cx('absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2 ring-canvas', dot)}
        />
      )}
    </Tag>
  )
}
