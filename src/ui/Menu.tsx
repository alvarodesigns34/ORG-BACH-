import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cx } from './primitives'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  /** Marca la opción activa dentro de un grupo excluyente. */
  selected?: boolean
  destructive?: boolean
  /** Línea separadora encima de esta opción. */
  separated?: boolean
}

interface MenuProps {
  trigger: (props: {
    onClick: () => void
    'aria-expanded': boolean
    ref: React.Ref<HTMLButtonElement>
  }) => ReactNode
  items: MenuItem[]
  label: string
  align?: 'start' | 'end'
}

/**
 * Menú contextual ligero.
 *
 * Se dibuja en un portal y se posiciona respecto al disparador, para que no lo
 * recorte el `overflow` de una lista. Navegable con flechas, Inicio/Fin y Esc.
 */
export function Menu({ trigger, items, label, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const width = 216
    const estimatedHeight = items.length * 40 + 12

    // Si no cabe debajo, se despliega hacia arriba; y nunca se sale por los lados.
    const below = window.innerHeight - rect.bottom
    const top = below < estimatedHeight ? rect.top - estimatedHeight - 6 : rect.bottom + 6
    const rawLeft = align === 'end' ? rect.right - width : rect.left
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8))

    setPosition({ top: Math.max(8, top), left })
    setActiveIndex(
      Math.max(
        0,
        items.findIndex((i) => i.selected),
      ),
    )
  }, [open, items, align])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    // El menú se cierra si la página se desplaza de verdad: quedaría flotando
    // fuera de sitio. Pero no con cualquier evento `scroll`: el último de un
    // desplazamiento con inercia llega justo después del toque que abre el
    // menú, y lo cerraba al instante. Solo cuenta si el disparador se ha movido.
    const origin = triggerRef.current?.getBoundingClientRect()
    const onScroll = () => {
      const now = triggerRef.current?.getBoundingClientRect()
      if (!origin || !now) return setOpen(false)
      if (Math.abs(now.top - origin.top) > 12 || Math.abs(now.left - origin.left) > 12) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onScroll)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (open) menuRef.current?.focus({ preventScroll: true })
  }, [open, position])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % items.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + items.length) % items.length)
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(items.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        items[activeIndex]?.onSelect()
        close()
        break
    }
  }

  return (
    <>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        ref: triggerRef,
      })}

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{ top: position.top, left: position.left, width: 216 }}
            className={cx(
              'fixed z-50 py-1.5 rounded-[14px] outline-none animate-pop origin-top-right',
              'glass',
            )}
          >
            {items.map((item, index) => (
              <div key={item.id}>
                {item.separated && <div className="my-1.5 h-px bg-hairline" aria-hidden />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onSelect()
                    close()
                  }}
                  onPointerEnter={() => setActiveIndex(index)}
                  className={cx(
                    'w-full flex items-center gap-2.5 px-3.5 h-10 text-left',
                    'text-[0.875rem] transition-colors duration-100',
                    item.destructive ? 'text-danger' : 'text-ink',
                    index === activeIndex && (item.destructive ? 'bg-danger-quiet' : 'bg-fill'),
                  )}
                >
                  {item.icon && <span className="shrink-0 text-ink-3">{item.icon}</span>}
                  <span className="truncate flex-1">{item.label}</span>
                  {item.selected && (
                    <span aria-hidden className="size-1.5 rounded-full bg-accent shrink-0" />
                  )}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
