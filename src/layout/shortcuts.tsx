import { useEffect, useRef, useState } from 'react'

import type { CreateKind } from '@/layout/chrome'
import { hrefFor, type RouteId } from '@/router'
import { Modal } from '@/ui/Modal'

/**
 * Atajos de teclado, pensados para el iPad con teclado (y el ordenador).
 *
 * Teclas sueltas, como en Mail o Calendario de Apple, y no combinaciones con
 * ⌘: en Safari y en la app instalada muchas ⌘+letra ya son del sistema (⌘N,
 * ⌘T, ⌘W) y la web no las recibe o no debe quitárselas. Las excepciones son
 * ⌘K (buscar, un estándar) y ⌘ mantenido, que enseña esta misma lista como
 * hace iPadOS con las apps nativas.
 *
 * No se disparan mientras se escribe en un campo ni con un diálogo abierto.
 */

const SECTIONS: { key: string; id: RouteId; label: string }[] = [
  { key: '1', id: 'inicio', label: 'Inicio' },
  { key: '2', id: 'tareas', label: 'Tareas' },
  { key: '3', id: 'calendario', label: 'Calendario' },
  { key: '4', id: 'estudio', label: 'Estudio' },
  { key: '5', id: 'asignaturas', label: 'Asignaturas' },
  { key: '6', id: 'notas', label: 'Notas' },
  { key: '7', id: 'examenes', label: 'Exámenes' },
  { key: '8', id: 'estadisticas', label: 'Estadísticas' },
  { key: '9', id: 'objetivos', label: 'Objetivos' },
  { key: ',', id: 'ajustes', label: 'Ajustes' },
]

const CREATE: Record<string, CreateKind> = { n: 'tarea', c: 'tarea', e: 'examen', g: 'nota', v: 'evento' }

export const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: 'Crear',
    items: [
      { keys: ['N', 'C'], label: 'Nueva tarea' },
      { keys: ['E'], label: 'Nuevo examen' },
      { keys: ['G'], label: 'Nueva nota' },
      { keys: ['V'], label: 'Nuevo evento' },
    ],
  },
  {
    title: 'Ir a',
    items: [
      ...SECTIONS.map((s) => ({ keys: [s.key === ',' ? '⌘ ,' : s.key], label: s.label })),
      { keys: ['/', '⌘ K'], label: 'Buscar tareas' },
    ],
  },
  {
    title: 'Estudio',
    items: [
      { keys: ['D'], label: 'Despegar 25 minutos (o volver al vuelo)' },
      { keys: ['Espacio'], label: 'Pausar o reanudar el vuelo' },
    ],
  },
  {
    title: 'Otros',
    items: [
      { keys: ['A'], label: 'Asistente' },
      { keys: ['?'], label: 'Esta lista' },
      { keys: ['⌘'], label: 'Mantener pulsado: esta lista' },
      { keys: ['Esc'], label: 'Cerrar' },
    ],
  },
]

/** El foco está en algo donde se escribe: las teclas son texto, no atajos. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  return !!el.closest(
    'input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]',
  )
}

const modalOpen = () => !!document.querySelector('[aria-modal="true"]')

/** Lleva a Tareas y pone el foco en su buscador. */
function focusSearch() {
  if (!window.location.hash.startsWith('#/tareas')) window.location.hash = '/tareas'
  let tries = 0
  const attempt = () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Buscar tareas"]')
    if (input) {
      input.focus()
      input.select()
    } else if (++tries < 30) requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

export function useKeyboardShortcuts({
  openCreate,
  openAssistant,
  flightActive,
}: {
  openCreate: (kind: CreateKind) => void
  openAssistant: () => void
  flightActive: boolean
}): { helpOpen: boolean; setHelpOpen: (open: boolean) => void } {
  const [helpOpen, setHelpOpen] = useState(false)
  const live = useRef({ openCreate, openAssistant, flightActive, helpOpen })
  live.current = { openCreate, openAssistant, flightActive, helpOpen }

  useEffect(() => {
    /** La lista abierta manteniendo ⌘: se cierra al soltar. */
    let heldTimer: number | null = null
    let openedByHold = false

    const cancelHold = () => {
      if (heldTimer) window.clearTimeout(heldTimer)
      heldTimer = null
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const { openCreate, openAssistant, flightActive } = live.current

      if (event.key === 'Meta' && !event.repeat) {
        cancelHold()
        if (!modalOpen()) {
          heldTimer = window.setTimeout(() => {
            heldTimer = null
            openedByHold = true
            setHelpOpen(true)
          }, 800)
        }
        return
      }
      // Cualquier otra tecla con ⌘ es una combinación, no «mantener ⌘».
      cancelHold()

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase()
        if (key === 'k' && !modalOpen()) {
          event.preventDefault()
          focusSearch()
        } else if (key === ',' && !modalOpen()) {
          event.preventDefault()
          window.location.hash = '/ajustes'
        }
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (typing(event.target) || modalOpen()) return

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === '?') {
        event.preventDefault()
        openedByHold = false
        setHelpOpen(true)
        return
      }
      if (key === '/') {
        event.preventDefault()
        focusSearch()
        return
      }
      const section = SECTIONS.find((s) => s.key === key && s.key !== ',')
      if (section) {
        event.preventDefault()
        window.location.hash = hrefFor(section.id).slice(1)
        return
      }
      if (CREATE[key]) {
        event.preventDefault()
        openCreate(CREATE[key])
        return
      }
      if (key === 'a') {
        event.preventDefault()
        openAssistant()
        return
      }
      if (key === 'd') {
        event.preventDefault()
        window.location.hash = (
          flightActive ? hrefFor('estudio') : hrefFor('estudio', { despegar: '25' })
        ).slice(1)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Meta') return
      cancelHold()
      if (openedByHold) {
        openedByHold = false
        setHelpOpen(false)
      }
    }
    const onBlur = () => {
      cancelHold()
      if (openedByHold) {
        openedByHold = false
        setHelpOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      cancelHold()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return { helpOpen, setHelpOpen }
}

/** Hoja con todos los atajos. */
export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Atajos de teclado" size="md">
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 pb-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-[0.75rem] font-semibold uppercase tracking-[0.04em] text-ink-3 mb-1.5">
              {group.title}
            </h3>
            <ul>
              {group.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3 py-1.5 text-[0.875rem]"
                >
                  <span className="text-ink-2">{item.label}</span>
                  <span className="flex gap-1 shrink-0">
                    {item.keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-7 h-7 px-2 inline-grid place-items-center rounded-[7px] bg-fill text-[0.75rem] font-semibold text-ink shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-[0.75rem] text-ink-3 mt-3">
        Las teclas sueltas no funcionan mientras escribes en un campo.
      </p>
    </Modal>
  )
}
