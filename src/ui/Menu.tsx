import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m as motion } from 'motion/react'
import { Check } from 'lucide-react'

import { exitFast, haptic } from './motion'
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
  /** Atajo de teclado que se muestra a la derecha («C»). */
  hint?: string
  disabled?: boolean
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
  width?: number
}

function nextEnabled(items: MenuItem[], start: number, step: 1 | -1): number {
  const len = items.length
  if (len === 0) return -1
  for (let offset = 1; offset <= len; offset++) {
    const idx = (start + step * offset + len * 2) % len
    if (!items[idx]?.disabled) return idx
  }
  return -1
}

/**
 * Menú contextual ligero.
 *
 * Se dibuja en un portal y se posiciona respecto al disparador, para que no lo
 * recorte el `overflow` de una lista. Navegable con flechas, Inicio/Fin y Esc.
 */
export function Menu({ trigger, items, label, align = 'end', width = 232 }: MenuProps) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{
    top: number
    left: number
    origin: string
  } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const estimatedHeight =
      items.length * 44 + items.filter((i) => i.separated).length * 13 + 12

    // Si no cabe debajo, se despliega hacia arriba; y nunca se sale por los lados.
    const below = window.innerHeight - rect.bottom
    const up = below < estimatedHeight + 8
    const top = up ? rect.top - estimatedHeight - 8 : rect.bottom + 8
    const rawLeft = align === 'end' ? rect.right - width : rect.left
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8))
    // El menú brota del botón (iOS 26): crece desde el punto del disparador.
    const originX = Math.max(0, Math.min(width, rect.left + rect.width / 2 - left))
    const origin = `${originX}px ${up ? '100%' : '0%'}`

    setPosition({ top: Math.max(8, top), left, origin })
    const initial = items.findIndex((i) => i.selected && !i.disabled)
    setActiveIndex(initial >= 0 ? initial : Math.max(0, items.findIndex((i) => !i.disabled)))
  }, [open, items, align, width])

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

  const choose = (item: MenuItem | undefined) => {
    if (!item || item.disabled) return
    haptic()
    item.onSelect()
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((i) => {
          const next = nextEnabled(items, i, 1)
          return next >= 0 ? next : i
        })
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((i) => {
          const prev = nextEnabled(items, i, -1)
          return prev >= 0 ? prev : i
        })
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(() => Math.max(0, items.findIndex((item) => !item.disabled)))
        break
      case 'End': {
        event.preventDefault()
        let last = -1
        for (let idx = items.length - 1; idx >= 0; idx--) {
          if (!items[idx]?.disabled) {
            last = idx
            break
          }
        }
        if (last >= 0) setActiveIndex(last)
        break
      }
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(items[activeIndex])
        break
    }
  }

  const activeItem = items[activeIndex]
  const activeDomId =
    activeItem && !activeItem.disabled ? `${menuId}-item-${activeItem.id}` : undefined

  return (
    <>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        ref: triggerRef,
      })}

      {createPortal(
        <AnimatePresence>
          {open && position && (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={label}
              aria-activedescendant={activeDomId}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              initial={{ opacity: 0, scale: 0.35, filter: 'blur(8px)' }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: 'blur(0px)',
                transition: { type: 'spring', visualDuration: 0.34, bounce: 0.22 },
              }}
              exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)', transition: exitFast }}
              style={{
                top: position.top,
                left: position.left,
                width,
                transformOrigin: position.origin,
              }}
              className="menu-panel liquid fixed z-50 p-1.5 rounded-[22px] outline-none"
            >
              <div className="relative z-[2]">
                {items.map((item, index) => (
                  <div key={item.id}>
                    {item.separated && (
                      <div className="mx-3 my-1.5 h-px bg-[var(--glass-edge)]" aria-hidden />
                    )}
                    <button
                      id={`${menuId}-item-${item.id}`}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => choose(item)}
                      onPointerEnter={() => !item.disabled && setActiveIndex(index)}
                      className={cx(
                        'w-full flex items-center gap-3 px-3 h-11 rounded-[14px] text-left',
                        'text-[0.9375rem] transition-colors duration-100 disabled:opacity-40',
                        item.destructive ? 'text-danger' : 'text-ink',
                        index === activeIndex &&
                          !item.disabled &&
                          (item.destructive ? 'bg-danger-quiet' : 'bg-[var(--glass-tint)]'),
                      )}
                    >
                      {item.icon && (
                        <span className="shrink-0 grid place-items-center w-5 text-ink-2">
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate flex-1">{item.label}</span>
                      {item.hint && (
                        <kbd className="text-[0.8125rem] font-medium text-ink-3 font-sans">
                          {item.hint}
                        </kbd>
                      )}
                      {item.selected && (
                        <Check
                          aria-hidden
                          className="size-4 text-accent shrink-0"
                          strokeWidth={2.6}
                        />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
