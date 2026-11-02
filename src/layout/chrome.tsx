import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, Mic, Plus } from 'lucide-react'

import { hrefFor } from '@/router'
import { useSettings } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { cx } from '@/ui/primitives'

// ---------------------------------------------------------------------------
// Acciones globales
// ---------------------------------------------------------------------------

interface Chrome {
  /** Abre «Nueva tarea» desde cualquier pantalla. */
  openCreate: () => void
  /** Abre el asistente de voz. */
  openAssistant: () => void
}

const ChromeContext = createContext<Chrome>({ openCreate: () => {}, openAssistant: () => {} })

export function ChromeProvider({ value, children }: { value: Chrome; children: ReactNode }) {
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useChrome(): Chrome {
  return useContext(ChromeContext)
}

/** Alto de la barra superior del móvil, sin contar la zona segura. */
export const TOP_BAR = 44

/**
 * ¿Ha pasado el elemento por debajo de la barra superior?
 *
 * Se mide contra la posición real de la barra (zona segura + 44 px), que en
 * un iPhone con Dynamic Island no es la misma que en un Android o un iPad.
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
// Barra superior (móvil)
// ---------------------------------------------------------------------------

export interface BackLink {
  href: string
  label: string
}

/**
 * Barra superior del móvil, como la de las apps de iOS.
 *
 * - Siempre arriba: «+» para crear y el avatar que abre Ajustes.
 * - Transparente mientras no hay nada debajo; con material translúcido y una
 *   línea fina en cuanto el contenido pasa por debajo.
 * - El título pequeño aparece cuando el grande sale de la pantalla.
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
    <div
      className={cx(
        'lg:hidden fixed top-0 inset-x-0 z-30',
        'pt-[env(safe-area-inset-top)] border-b transition-[background-color,border-color] duration-300',
        scrolled ? 'glass-bar border-hairline' : 'bg-canvas border-transparent',
      )}
    >
      <div
        className="relative flex items-center justify-between gap-2 px-[max(0.75rem,env(safe-area-inset-left))]"
        style={{ height: TOP_BAR }}
      >
        {back ? (
          <a
            href={back.href}
            className="pressable relative z-[1] -ml-1.5 flex items-center h-11 pr-2 text-[1.0625rem] text-accent min-w-0"
          >
            <ChevronLeft className="size-7 shrink-0 -mr-0.5" strokeWidth={2.4} />
            <span className="truncate max-w-[9rem]">{back.label}</span>
          </a>
        ) : (
          <span />
        )}

        <p
          aria-hidden
          className={cx(
            'absolute inset-x-28 text-center text-[1.0625rem] font-semibold tracking-[-0.02em] truncate',
            'transition-[opacity,transform] duration-300 ease-[var(--spring)] pointer-events-none',
            collapsed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5',
          )}
        >
          {title}
        </p>

        <ChromeActions className="relative z-[1]" />
      </div>
    </div>,
    document.body,
  )
}

/** «+» y avatar. En escritorio no hacen falta: están en la barra lateral. */
export function ChromeActions({ className }: { className?: string }) {
  const { openCreate, openAssistant } = useChrome()
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={openAssistant}
        aria-label="Asistente de voz"
        className="pressable grid place-items-center size-9 rounded-full bg-fill text-accent"
      >
        <Mic className="size-[19px]" strokeWidth={2.3} />
      </button>
      <button
        type="button"
        onClick={openCreate}
        aria-label="Nueva tarea"
        className="pressable grid place-items-center size-9 rounded-full bg-fill text-accent"
      >
        <Plus className="size-[22px]" strokeWidth={2.4} />
      </button>
      <AccountAvatar />
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
      className="pressable relative grid place-items-center rounded-full text-white font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        background: 'linear-gradient(180deg, #a1a1aa 0%, #77777f 100%)',
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
