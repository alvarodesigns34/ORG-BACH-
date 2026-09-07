import { useEffect, useId, useRef, type ReactNode } from 'react'
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
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  // Al abrir: recordar quién tenía el foco y llevarlo dentro del diálogo.
  useEffect(() => {
    if (!open) return
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
      const first =
        content.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        actions.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        node.querySelector<HTMLElement>(FOCUSABLE)
      // Sin nada enfocable, el propio panel recibe el foco para que las
      // teclas de navegación no se queden actuando sobre la página de detrás.
      ;(first ?? node).focus({ preventScroll: true })
    }

    return () => restoreFocus.current?.focus({ preventScroll: true })
  }, [open])

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

  if (!open) return null

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex sm:items-center justify-center items-end">
      <div
        className="absolute inset-0 animate-fade"
        style={{ background: 'var(--scrim)' }}
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full flex flex-col outline-none',
          'bg-surface border border-hairline shadow-lg',
          // Hoja anclada abajo en móvil, tarjeta centrada a partir de sm.
          'rounded-t-xl sm:rounded-xl',
          'max-h-[92dvh] sm:max-h-[86dvh]',
          'animate-pop',
          widths[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-hairline shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[1.0625rem] font-semibold tracking-[-0.015em]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-[0.8125rem] text-ink-3 mt-1">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Cerrar" size="sm" onClick={onClose} className="-mr-1.5 -mt-0.5">
            <X className="size-4" />
          </IconButton>
        </header>

        <div ref={content} className="overflow-y-auto px-5 sm:px-6 py-5 grow">
          {children}
        </div>

        {footer && (
          <footer
            ref={actions}
            className={cx(
              'flex items-center justify-end gap-2 px-5 sm:px-6 py-4 shrink-0',
              'border-t border-hairline bg-surface',
              // Respeta el área segura de los móviles con gesto inferior.
              'pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4',
              'rounded-b-none sm:rounded-b-xl',
            )}
          >
            {footer}
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
          <Button
            variant={destructive ? 'dangerFill' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[0.875rem] text-ink-2 leading-relaxed">{message}</p>
    </Modal>
  )
}
