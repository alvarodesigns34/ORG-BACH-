import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  CalendarPlus,
  ChevronLeft,
  GraduationCap,
  ListChecks,
  Mic,
  NotebookPen,
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
  /** Abre el asistente de voz. */
  openAssistant: () => void
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

          <ChromeActions className="chrome-controls pointer-events-auto" />
        </div>
      </div>
    </>,
    document.body,
  )
}

/** Asistente y avatar, arriba a la derecha. Crear va abajo, junto al pulgar. */
export function ChromeActions({ className }: { className?: string }) {
  const { openAssistant } = useChrome()
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => {
          haptic()
          openAssistant()
        }}
        aria-label="Asistente"
        className="pressable liquid relative grid place-items-center size-10 rounded-full text-accent"
      >
        <Mic className="relative z-[2] size-[19px]" strokeWidth={2.3} />
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
      className="pressable relative grid place-items-center rounded-full text-white font-semibold shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_0_rgb(0_0_0/0.12),0_4px_14px_rgb(0_0_0/0.14)]"
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
