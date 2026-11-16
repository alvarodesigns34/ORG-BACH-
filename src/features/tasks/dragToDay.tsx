import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

import { haptic } from '@/ui/motion'

/**
 * Arrastrar una tarea a un día del calendario.
 *
 * Con eventos de puntero propios y no con el arrastre HTML: este funciona
 * igual con el dedo en el iPad, con el trackpad del teclado y con el ratón, y
 * permite dibujar la tarjeta flotante y resaltar el día de destino.
 *
 * Los días destino llevan `data-drop-day="YYYY-MM-DD"`. Se empieza desde el
 * asa (que tiene `touch-action: none` para que el dedo no desplace la página)
 * o, con ratón, desde cualquier punto de la fila tras mover unos píxeles.
 */

export interface DragState {
  taskId: string
  title: string
  color: string
  x: number
  y: number
  /** Día bajo el puntero, si lo hay. */
  over: string | null
}

const THRESHOLD = 5

function dayAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  return el?.closest<HTMLElement>('[data-drop-day]')?.dataset.dropDay ?? null
}

export function useDragToDay(onDrop: (taskId: string, day: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const pending = useRef<{ taskId: string; title: string; color: string; x: number; y: number; id: number } | null>(null)
  const dragging = useRef(false)
  /** El clic que sigue a soltar no debe abrir la tarea. */
  const suppressClick = useRef(false)
  const live = useRef(onDrop)
  live.current = onDrop

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const start = pending.current
      if (!start || e.pointerId !== start.id) return
      if (!dragging.current) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return
        dragging.current = true
        haptic()
      }
      e.preventDefault()
      const over = dayAt(e.clientX, e.clientY)
      setDrag((prev) => {
        if (prev?.over !== over && over) haptic()
        return { taskId: start.taskId, title: start.title, color: start.color, x: e.clientX, y: e.clientY, over }
      })
    }
    const end = (e: PointerEvent) => {
      const start = pending.current
      if (!start || e.pointerId !== start.id) return
      pending.current = null
      if (dragging.current) {
        dragging.current = false
        suppressClick.current = true
        window.setTimeout(() => (suppressClick.current = false), 0)
        const day = e.type === 'pointerup' ? dayAt(e.clientX, e.clientY) : null
        if (day) {
          haptic('success')
          live.current(start.taskId, day)
        }
      }
      setDrag(null)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pending.current) {
        pending.current = null
        dragging.current = false
        setDrag(null)
      }
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', key)
    }
  }, [])

  /** Para el `onPointerDown` del asa o de la fila. */
  const start = useCallback(
    (task: { id: string; title: string }, color: string) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      // Con el dedo solo desde el asa: la fila tiene que poder desplazarse.
      const fromHandle = !!(e.target as HTMLElement).closest('[data-drag-handle]')
      if (e.pointerType === 'touch' && !fromHandle) return
      pending.current = { taskId: task.id, title: task.title, color, x: e.clientX, y: e.clientY, id: e.pointerId }
      if (fromHandle) {
        try {
          ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
        } catch {
          // Sin captura que soltar.
        }
      }
    },
    [],
  )

  return { drag, start, suppressClick }
}

/** La tarea flotando bajo el dedo mientras se arrastra. */
export function DragGhost({ drag }: { drag: DragState | null }) {
  if (!drag) return null
  return createPortal(
    <div
      aria-hidden
      className="fixed z-[80] pointer-events-none -translate-x-1/2 -translate-y-[130%] flex items-center gap-2 max-w-[16rem] px-3.5 h-10 rounded-full bg-surface text-[0.875rem] font-semibold text-ink shadow-[0_12px_32px_rgb(0_0_0/0.22),0_0_0_0.5px_rgb(0_0_0/0.08)]"
      style={{ left: drag.x, top: drag.y }}
    >
      <span className="size-2 rounded-full shrink-0" style={{ background: drag.color }} />
      <span className="truncate">{drag.title}</span>
    </div>,
    document.body,
  )
}
