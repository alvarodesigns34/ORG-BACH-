import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { cx } from './primitives'

interface ToastOptions {
  text: string
  /** Acción opcional, normalmente «Deshacer». */
  action?: { label: string; run: () => void }
  /** Milisegundos visible. Con acción, más tiempo para alcanzarla. */
  duration?: number
}

interface ToastState extends ToastOptions {
  id: number
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null)

/**
 * Avisos efímeros con «Deshacer».
 *
 * Sustituyen a los diálogos de confirmación en acciones reversibles: borrar
 * una tarea ocurre al instante y se puede deshacer durante unos segundos, como
 * en Mail o Recordatorios. Confirmar cada borrado entrena a pulsar «Sí» sin
 * leer; poder deshacer es más seguro y más rápido.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const counter = useRef(0)

  const dismiss = useCallback(() => {
    setLeaving(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setToast(null)
      setLeaving(false)
    }, 220)
  }, [])

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current)
      counter.current += 1
      setLeaving(false)
      setToast({ ...options, id: counter.current })
      timer.current = setTimeout(dismiss, options.duration ?? (options.action ? 5500 : 3000))
    },
    [dismiss],
  )

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div
          role="status"
          aria-live="polite"
          className={cx(
            'fixed z-40 inset-x-0 flex justify-center pointer-events-none px-4',
            // Encima de la barra flotante en móvil; abajo a la izquierda en escritorio.
            'bottom-[calc(5.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:justify-start lg:left-[288px]',
          )}
        >
          {toast && (
            <div
              key={toast.id}
              className={cx(
                'glass pointer-events-auto flex items-center gap-1 rounded-full pl-5 pr-1.5 h-12 max-w-full',
                'text-[0.9375rem] font-medium text-ink',
                leaving
                  ? 'opacity-0 translate-y-2 transition-[opacity,transform] duration-200'
                  : 'animate-toast',
              )}
            >
              <span className="truncate pr-2">{toast.text}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.run()
                    dismiss()
                  }}
                  className="pressable shrink-0 h-9 px-4 rounded-full font-semibold text-accent hover:bg-fill"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return show
}
