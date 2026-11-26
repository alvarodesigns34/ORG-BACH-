import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m as motion, useDragControls, useReducedMotion } from 'motion/react'

import { spring, useMediaQuery } from '@/ui/motion'
import { lockScroll } from '@/ui/scrollLock'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type SurfaceLayout = 'phone' | 'float' | 'split'

export interface SurfaceApi {
  layout: SurfaceLayout
  /** Teclado virtual abierto (iPhone/iPad sin teclado físico). */
  keyboard: boolean
  /** Empieza a arrastrar la hoja hacia abajo (solo iPhone). */
  startDrag: (event: ReactPointerEvent) => void
}

interface Viewport {
  height: number
  top: number
  keyboard: boolean
}

function readViewport(): Viewport {
  const vv = window.visualViewport
  if (!vv) return { height: window.innerHeight, top: 0, keyboard: false }
  const occluded = window.innerHeight - vv.height
  return { height: vv.height, top: vv.offsetTop, keyboard: occluded > 80 }
}

/**
 * Superficie del asistente.
 *
 * En el iPhone es una hoja casi a pantalla completa que se baja con el dedo
 * desde arriba. En el iPad, una ventana flotante grande (con la barra de
 * conversaciones a la izquierda a partir de 900 px).
 *
 * Se ajusta a la parte VISIBLE de la pantalla (visualViewport): cuando sale
 * el teclado, la hoja encoge y la barra de escribir queda justo encima de él,
 * sin taparse ni dar saltos.
 */
export function AssistantSurface({
  open,
  onClose,
  onEscape,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Esc: lo primero que haya abierto encima (modo voz, cajón); si no, cerrar. */
  onEscape?: () => boolean
  label: string
  children: (api: SurfaceApi) => ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const floating = useMediaQuery('(min-width: 640px)')
  const split = useMediaQuery('(min-width: 900px)')
  const layout: SurfaceLayout = split ? 'split' : floating ? 'float' : 'phone'
  const reduce = useReducedMotion()
  const dragControls = useDragControls()
  const [viewport, setViewport] = useState<Viewport>(() =>
    typeof window === 'undefined' ? { height: 800, top: 0, keyboard: false } : readViewport(),
  )

  useEffect(() => (open ? lockScroll() : undefined), [open])

  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setViewport(readViewport()))
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Foco: dentro al abrir (el campo de texto solo con ratón/teclado; en
  // táctil abriría el teclado sin pedirlo) y de vuelta al cerrar.
  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    const node = panel.current
    const fine = window.matchMedia('(pointer: fine)').matches
    const preferred = fine ? node?.querySelector<HTMLElement>('[data-autofocus]') : null
    ;(preferred ?? node)?.focus({ preventScroll: true })
    return () => restoreFocus.current?.focus({ preventScroll: true })
  }, [open])

  // Esc y tabulador atrapado dentro.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (!onEscape?.()) onClose()
        return
      }
      if (event.key !== 'Tab') return
      const node = panel.current
      if (!node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, onEscape])

  // Los gestos de dentro (cajón, filas) son del asistente: el «volver desde
  // el borde» de la app no debe dispararse por debajo.
  // Se corta en `document`, después de que React (que escucha en el body,
  // donde vive el portal) haya repartido el evento a los de dentro.
  useEffect(() => {
    if (!open) return
    const stop = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) event.stopPropagation()
    }
    document.addEventListener('pointerdown', stop)
    return () => document.removeEventListener('pointerdown', stop)
  }, [open])

  const phone = layout === 'phone'
  const gap = 20
  const floatHeight = Math.min(split ? 900 : 860, viewport.height - gap * 2)
  const style = phone
    ? {
        left: 0,
        right: 0,
        top: `calc(${viewport.top}px + max(env(safe-area-inset-top), 12px) + 6px)`,
        height: `calc(${viewport.height}px - max(env(safe-area-inset-top), 12px) - 6px)`,
      }
    : {
        left: '50%',
        top: viewport.top + (viewport.height - floatHeight) / 2,
        height: floatHeight,
        width: split ? 'min(1180px, calc(100vw - 40px))' : 'min(720px, calc(100vw - 40px))',
        marginLeft: split ? 'calc(min(1180px, calc(100vw - 40px)) / -2)' : 'calc(min(720px, calc(100vw - 40px)) / -2)',
      }

  const hidden = reduce ? { opacity: 0 } : phone ? { y: '100%' } : { opacity: 0, scale: 0.92, y: 24 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="asst" className="fixed inset-0 z-50" exit={{ pointerEvents: 'none' }}>
          <motion.div
            className="modal-scrim absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            data-layout={layout}
            className={phone ? 'asst-surface rounded-t-[30px]' : 'asst-surface rounded-[34px]'}
            style={style}
            initial={hidden}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ ...hidden, transition: phone ? { ...spring.smooth, bounce: 0 } : { duration: 0.18 } }}
            transition={phone ? spring.smooth : { type: 'spring', visualDuration: 0.46, bounce: 0.22 }}
            drag={phone && !reduce ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 1 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 140 || (info.offset.y > 30 && info.velocity.y > 560)) onClose()
            }}
          >
            {children({
              layout,
              keyboard: viewport.keyboard,
              startDrag: (event) => {
                if (!phone || (event.target as HTMLElement).closest('button, a, input, textarea')) return
                dragControls.start(event)
              },
            })}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
