import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Button, IconButton, cx } from './primitives'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Cuántos diálogos hay abiertos. `inert` en #root solo se quita al cerrar el último. */
let openModals = 0

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Barra fija inferior con las acciones. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Acción extra en la cabecera, junto a «Cerrar» (p. ej. «Nueva conversación»). */
  headerAction?: ReactNode
}

/**
 * Diálogo modal.
 *
 * En escritorio aparece centrado; en móvil sube desde abajo como hoja, que es
 * donde llega el pulgar. Retiene el foco mientras está abierto y lo devuelve
 * al elemento que lo abrió al cerrarse.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  headerAction,
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  // Montado del panel: sigue montado durante la animación de salida (abajo).
  const [rendered, setRendered] = useState(open)

  // Al abrir: recordar quién tenía el foco y llevarlo dentro del diálogo.
  // Depende también de `rendered`: un diálogo que vive montado y cerrado (el
  // del asistente) no tiene panel en el primer render tras abrirse, y sin
  // esperar a que exista el foco se quedaba en la página de detrás.
  useEffect(() => {
    if (!open || !rendered) return
    restoreFocus.current = document.activeElement as HTMLElement | null

    const node = panel.current
    if (node) {
      // El orden importa. El botón de cerrar vive en la cabecera, así que es
      // el primer elemento enfocable del panel y se llevaba el foco siempre:
      // abrir «Nueva tarea» y empezar a escribir no escribía en ningún sitio,
      // y el `autoFocus` del primer campo no servía de nada porque este efecto
      // corre después. Se busca primero en el cuerpo (el primer campo del
      // formulario) y luego en las acciones (en una confirmación, «Cancelar»,
      // que es la salida segura). Cerrar queda como último recurso.
      // Un campo marcado con data-autofocus manda, pero solo con ratón: en
      // el móvil abriría el teclado cada vez que se abre la hoja.
      const preferred = window.matchMedia('(pointer: fine)').matches
        ? node.querySelector<HTMLElement>('[data-autofocus]')
        : null
      const first =
        preferred ??
        content.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        actions.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        node.querySelector<HTMLElement>(FOCUSABLE)
      // Sin nada enfocable, el propio panel recibe el foco para que las
      // teclas de navegación no se queden actuando sobre la página de detrás.
      ;(first ?? node).focus({ preventScroll: true })
    }

    return () => restoreFocus.current?.focus({ preventScroll: true })
  }, [open, rendered])

  // Bloquear el desplazamiento del fondo, compensando el ancho de la barra
  // para que la página no dé un salto lateral al abrirse.
  useEffect(() => {
    if (!open) return
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    const gap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
    const root = document.getElementById('root')
    openModals += 1
    root?.setAttribute('inert', '')
    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
      openModals -= 1
      if (openModals <= 0) {
        openModals = 0
        root?.removeAttribute('inert')
      }
    }
  }, [open])

  // Esc y el tabulador tienen que funcionar aunque el foco haya salido al
  // fondo. El listener va en `document`, no en el overlay.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const node = panel.current
      if (!node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
        if (el.hasAttribute('disabled')) return false
        return el.getClientRects().length > 0
      })
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  // --- Salida animada ----------------------------------------------------
  // Al cerrar, el panel sigue montado lo que dura su animación de salida, con
  // el último contenido que tuvo abierto: si se pintara con las props nuevas
  // (p. ej. `task = null`), el formulario parpadearía vacío mientras baja.
  const [closing, setClosing] = useState(false)
  const snapshot = useRef({ title, description, children, footer })
  if (open) snapshot.current = { title, description, children, footer }

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }
    if (!rendered) return
    setClosing(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(
      () => {
        setRendered(false)
        setClosing(false)
      },
      reduce ? 0 : 260,
    )
    return () => clearTimeout(id)
  }, [open, rendered])

  // --- Arrastrar para cerrar (hoja de móvil) ------------------------------
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null)
  const [dragY, setDragY] = useState(0)

  const onGrabStart = (event: React.PointerEvent) => {
    if (window.matchMedia('(min-width: 640px)').matches) return
    if ((event.target as HTMLElement).closest('button')) return
    drag.current = { startY: event.clientY, startT: performance.now(), dy: 0 }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  const onGrabMove = (event: React.PointerEvent) => {
    if (!drag.current) return
    const dy = Math.max(0, event.clientY - drag.current.startY)
    drag.current.dy = dy
    setDragY(dy)
  }
  const onGrabEnd = () => {
    const state = drag.current
    drag.current = null
    if (!state) return
    const velocity = state.dy / Math.max(1, performance.now() - state.startT)
    if (state.dy > 110 || (state.dy > 30 && velocity > 0.6)) onClose()
    else setDragY(0)
  }
  useEffect(() => {
    if (!open) setDragY(0)
  }, [open])

  if (!rendered) return null

  const view = open ? { title, description, children, footer } : snapshot.current
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-50 flex sm:items-center justify-center items-end',
        closing && 'pointer-events-none',
      )}
    >
      <div
        className={cx(
          'absolute inset-0 transition-opacity duration-300',
          closing ? 'opacity-0' : 'animate-fade',
        )}
        style={{ background: 'var(--scrim)' }}
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={view.description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full flex flex-col outline-none',
          'bg-surface shadow-lg',
          'rounded-t-[28px] sm:rounded-[28px] sm:mx-4',
          'max-h-[94dvh] sm:max-h-[86dvh]',
          closing
            ? 'translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0 transition-[transform,opacity] duration-[260ms] ease-[var(--ease-std)]'
            : dragY > 0
              ? ''
              : 'animate-sheet sm:animate-pop transition-transform duration-500 ease-[var(--spring)]',
          widths[size],
        )}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <header
          className="relative shrink-0 px-5 sm:px-6 pt-2 sm:pt-5 pb-3 touch-none sm:touch-auto"
          onPointerDown={onGrabStart}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabEnd}
          onPointerCancel={onGrabEnd}
        >
          {/* Tirador: indica que la hoja se puede bajar con el dedo. */}
          <div
            aria-hidden
            className="sm:hidden mx-auto mb-2.5 h-[5px] w-9 rounded-full bg-hairline-strong"
          />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 pt-1">
              <h2
                id={titleId}
                className="text-[1.25rem] font-bold tracking-[-0.022em] leading-tight"
              >
                {view.title}
              </h2>
              {view.description && (
                <p id={descId} className="text-[0.8125rem] text-ink-3 mt-1">
                  {view.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 -mr-1 shrink-0">
              {open && headerAction}
              <IconButton
                label="Cerrar"
                size="sm"
                variant="secondary"
                onClick={onClose}
                className="shrink-0"
              >
                <X className="size-[18px]" strokeWidth={2.4} />
              </IconButton>
            </div>
          </div>
        </header>

        <div
          ref={content}
          className="overflow-y-auto overscroll-contain px-5 sm:px-6 pt-2 pb-5 grow"
        >
          {view.children}
        </div>

        {view.footer && (
          <footer
            ref={actions}
            className={cx(
              'flex items-center justify-end gap-2 px-5 sm:px-6 pt-3 shrink-0',
              'border-t border-hairline',
              'pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-5',
            )}
          >
            {view.footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Confirmación
// ---------------------------------------------------------------------------

interface ConfirmProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
}

/** Se usa para todo lo que no se puede deshacer. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  destructive,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={destructive ? 'dangerFill' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[0.875rem] text-ink-2 leading-relaxed">{message}</p>
    </Modal>
  )
}
