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
  Mic,
  NotebookPen,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { hrefFor } from '@/router'
import { useSettings } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { exitFast, haptic, spring } from '@/ui/motion'
import { cx } from '@/ui/primitives'

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
}[] = [
  { kind: 'tarea', label: 'Tarea', icon: ListChecks, tint: '#5e5ce6' },
  { kind: 'examen', label: 'Examen', icon: NotebookPen, tint: '#ff453a', needsSubject: true },
  { kind: 'nota', label: 'Nota', icon: GraduationCap, tint: '#bf5af2', needsSubject: true },
  { kind: 'evento', label: 'Evento', icon: CalendarPlus, tint: '#ff9f0a' },
]

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
}: {
  title: string
  collapsed: boolean
  scrolled: boolean
  back?: BackLink
}) {
  return createPortal(
    <>
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
                className="absolute inset-x-28 text-center text-[1.0625rem] font-semibold tracking-[-0.02em] truncate"
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

/** Fondo del icono del asistente: el azul de la app con un brillo arriba. */
export const ASSISTANT_FILL =
  'linear-gradient(180deg, rgb(255 255 255 / 0.32), transparent 60%), linear-gradient(135deg, var(--c-accent-fill), #7d5cff)'

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
          compact ? 'px-[3px]' : 'pl-[3px] pr-3.5',
        )}
      >
        <span
          className="relative z-[2] grid place-items-center size-[34px] rounded-full text-white shrink-0"
          style={{ background: ASSISTANT_FILL }}
        >
          <Sparkles className="size-[17px]" strokeWidth={2.2} />
        </span>
        <span
          aria-hidden
          className={cx(
            'relative z-[2] overflow-hidden whitespace-nowrap text-[0.9375rem] font-semibold',
            'transition-[max-width,opacity,margin] duration-300 ease-[var(--spring)]',
            compact ? 'max-w-0 opacity-0 ml-0' : 'max-w-[6.5rem] opacity-100 ml-2',
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
 * Acceso al asistente en la barra lateral (iPad en horizontal y ordenador).
 * Parece un campo de texto, porque se le escribe; el micrófono de la derecha
 * lo abre ya dictando.
 */
export function AssistantLauncher() {
  const { openAssistant } = useChrome()
  return (
    <div className="relative flex items-center h-[3.25rem] rounded-[20px] bg-[var(--glass-tint)] shadow-[inset_0_0_0_0.5px_var(--glass-edge)]">
      <button
        type="button"
        onClick={() => openAssistant('text')}
        aria-label="Asistente: escríbele lo que quieras apuntar o preguntar"
        className="pressable flex-1 min-w-0 flex items-center gap-2.5 h-full pl-1.5 pr-1 rounded-[20px] text-left"
      >
        <span
          className="grid place-items-center size-10 rounded-[14px] text-white shrink-0 shadow-[0_4px_12px_rgb(94_92_230/0.28)]"
          style={{ background: ASSISTANT_FILL }}
        >
          <Sparkles className="size-[19px]" strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold text-ink leading-tight">
            Asistente
          </span>
          <span className="block text-[0.75rem] text-ink-3 truncate">Escribe o habla</span>
        </span>
        <kbd className="ml-auto text-[0.6875rem] font-semibold text-ink-3 tabular-nums rounded-[5px] bg-fill px-1.5 py-px">
          A
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => openAssistant('voice')}
        aria-label="Dictar al asistente"
        title="Dictar"
        className="pressable grid place-items-center size-10 mr-1.5 rounded-full bg-surface text-accent shrink-0 shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
      >
        <Mic className="size-[18px]" strokeWidth={2.3} />
      </button>
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
