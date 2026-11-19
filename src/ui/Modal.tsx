import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m as motion, useDragControls, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'

import { exitFast, spring, useMediaQuery } from './motion'
import { Button, IconButton, cx } from './primitives'
import { lockScroll } from './scrollLock'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
 * En el iPhone es una hoja que sube desde abajo, agarrada al dedo: se puede
 * arrastrar desde la cabecera y, al soltarla, un muelle decide con la
 * velocidad que lleva si se cierra o vuelve a su sitio. En pantallas anchas
 * (iPad, escritorio) aparece centrada.
 *
 * Retiene el foco mientras está abierta y lo devuelve al elemento que la
 * abrió. La salida la gestiona `AnimatePresence`, que conserva el último
 * contenido pintado mientras baja: si el formulario se rehiciera con las
 * props nuevas (p. ej. `task = null`), parpadearía vacío a media animación.
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
  const sheet = !useMediaQuery('(min-width: 640px)')
  const reduce = useReducedMotion()
  const dragControls = useDragControls()

  // Al abrir: recordar quién tenía el foco y llevarlo dentro del diálogo.
  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null

    const node = panel.current
    if (node) {
      // El orden importa. El botón de cerrar vive en la cabecera, así que es
      // el primer elemento enfocable del panel y se llevaba el foco siempre:
      // abrir «Nueva tarea» y empezar a escribir no escribía en ningún sitio.
      // Se busca primero en el cuerpo (el primer campo del formulario) y
      // luego en las acciones (en una confirmación, «Cancelar», que es la
      // salida segura). Cerrar queda como último recurso.
      // Un campo marcado con data-autofocus manda, pero solo con ratón: en
      // el móvil abriría el teclado cada vez que se abre la hoja.
      const fine = window.matchMedia('(pointer: fine)').matches
      const preferred = fine ? node.querySelector<HTMLElement>('[data-autofocus]') : null
      const first =
        preferred ??
        // En táctil el foco va al panel: enfocar un campo sube el teclado y
        // tapa media hoja antes de que el alumno haya decidido qué tocar.
        (fine ? content.current?.querySelector<HTMLElement>(FOCUSABLE) : null) ??
        (fine ? actions.current?.querySelector<HTMLElement>(FOCUSABLE) : null) ??
        (fine ? node.querySelector<HTMLElement>(FOCUSABLE) : null)
      // Sin nada enfocable, el propio panel recibe el foco para que las
      // teclas de navegación no se queden actuando sobre la página de detrás.
      ;(first ?? node).focus({ preventScroll: true })
    }

    return () => restoreFocus.current?.focus({ preventScroll: true })
  }, [open])

  // Bloquear el fondo (y dejarlo inerte) mientras esté abierto. El bloqueo
  // es compartido entre diálogos: ver scrollLock.ts.
  useEffect(() => (open ? lockScroll() : undefined), [open])

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

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }

  const hidden = reduce
    ? { opacity: 0 }
    : sheet
      ? { y: '100%' }
      : { opacity: 0, scale: 0.88, y: 36 }
  const shown = { opacity: 1, scale: 1, y: 0 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal"
          className="fixed inset-0 z-50 flex sm:items-center justify-center items-end"
          // Mientras baja ya no intercepta toques: se puede seguir usando la
          // página sin esperar a que termine la animación.
          exit={{ pointerEvents: 'none' }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ background: 'var(--scrim)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.22 } }}
            transition={{ duration: 0.28 }}
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cx(
              // Hoja de iOS 26: cristal denso que flota separado de los bordes
              // (también en el iPhone, con las esquinas concéntricas a las de
              // la pantalla) y deja adivinar la página atenuada de detrás.
              'sheet-glass relative w-full flex flex-col outline-none',
              'rounded-[34px] mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] sm:mb-0 sm:mx-4',
              'max-h-[calc(94dvh-env(safe-area-inset-bottom))] sm:max-h-[86dvh]',
              widths[size],
            )}
            initial={hidden}
            animate={shown}
            exit={{ ...hidden, transition: sheet ? { ...spring.smooth, bounce: 0 } : exitFast }}
            // En el iPad la hoja «brota» del centro con un muelle con algo de
            // rebote, como las hojas de formulario de iPadOS 26.
            transition={sheet ? spring.smooth : { type: 'spring', visualDuration: 0.44, bounce: 0.2 }}
            // Arrastre: solo en la hoja y solo desde la cabecera (el cuerpo
            // tiene su propio desplazamiento).
            drag={sheet && !reduce ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 1 }}
            onDragEnd={(_, info) => {
              // Cuenta lo lejos que se ha bajado y con qué velocidad se
              // suelta: un gesto corto pero decidido también cierra.
              if (info.offset.y > 120 || (info.offset.y > 24 && info.velocity.y > 520)) onClose()
            }}
          >
            {/* En la hoja, el fondo se prolonga por debajo para que el rebote
                del muelle no enseñe la página por el hueco inferior. */}
            <header
              className="relative z-[2] shrink-0 px-5 sm:px-6 pt-2 sm:pt-5 pb-3 touch-none sm:touch-auto"
              onPointerDown={(event) => {
                if (!sheet || (event.target as HTMLElement).closest('button, a, input')) return
                dragControls.start(event)
              }}
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
                    className="text-[1.375rem] font-bold tracking-[-0.015em] leading-tight"
                  >
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className="text-[0.8125rem] text-ink-3 mt-1">
                      {description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 -mr-1 shrink-0">
                  {headerAction}
                  <IconButton
                    label="Cerrar"
                    variant="secondary"
                    onClick={onClose}
                    className="shrink-0 !size-10"
                  >
                    <X className="size-[19px]" strokeWidth={2.4} />
                  </IconButton>
                </div>
              </div>
            </header>

            <div
              ref={content}
              className="relative z-[2] overflow-y-auto overscroll-contain px-5 sm:px-6 pt-2 pb-5 grow"
            >
              {children}
            </div>

            {footer && (
              <footer
                ref={actions}
                className={cx(
                  // Sin línea divisoria: el contenido se disuelve al pasar
                  // por debajo de las acciones (borde de desplazamiento).
                  'sheet-footer relative z-[2] flex items-center justify-end gap-2 px-5 sm:px-6 pt-3 shrink-0',
                  'pb-4 sm:pb-5',
                )}
              >
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
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
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'dangerFill' : 'primary'}
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[0.9375rem] text-ink-2 leading-relaxed">{message}</p>
    </Modal>
  )
}
