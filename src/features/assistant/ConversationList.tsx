import { useMemo, useRef, useState } from 'react'
import { animate, m as motion, useMotionValue, useTransform } from 'motion/react'
import { MessageCircle, Search, SquarePen, Trash2, X } from 'lucide-react'

import {
  conversationPreview,
  conversationTitle,
  groupConversations,
  type Conversation,
} from '@/assistant/conversation'
import { haptic, spring, useCoarsePointer } from '@/ui/motion'
import { cx } from '@/ui/primitives'

const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const shortDay = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' })

function when(at: number, now = Date.now()): string {
  const date = new Date(at)
  const today = new Date(now)
  if (date.toDateString() === today.toDateString()) return timeFormat.format(date)
  if (now - at < 6 * 86_400_000) return weekday.format(date)
  return shortDay.format(date)
}

/**
 * Historial de conversaciones: la barra lateral del iPad y el cajón del
 * iPhone. Agrupado por fecha, con buscador, y cada fila se desliza a la
 * izquierda para borrarla (con «Deshacer»), como en Mensajes o Mail.
 */
export function ConversationList({
  conversations,
  currentId,
  freeAllowed,
  onOpen,
  onDelete,
  onNew,
  onClose,
}: {
  conversations: Conversation[]
  currentId: string | null
  freeAllowed: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onNew: (mode?: 'libre') => void
  /** Solo en el cajón del iPhone. */
  onClose?: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es')
    if (!q) return conversations
    return conversations.filter((c) =>
      c.messages.some((m) => m.text.toLocaleLowerCase('es').includes(q)),
    )
  }, [conversations, query])
  const groups = groupConversations(filtered)

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 pt-4 pb-2 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 pl-1">
          <h2 className="text-[1.375rem] font-bold tracking-[-0.015em]">Conversaciones</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNew()}
              aria-label="Nueva conversación"
              title="Nueva conversación"
              className="glass-btn pressable grid place-items-center size-10 rounded-full text-ink"
            >
              <SquarePen className="size-[18px]" strokeWidth={2.2} />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Volver a la conversación"
                className="glass-btn pressable grid place-items-center size-10 rounded-full text-ink"
              >
                <X className="size-[18px]" strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" strokeWidth={2.3} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar en las conversaciones"
            className="block w-full h-10 rounded-[12px] bg-fill pl-9 pr-3 text-[1rem] text-ink placeholder:text-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </label>
        {freeAllowed && (
          <button
            type="button"
            onClick={() => onNew('libre')}
            className="pressable flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-fill"
          >
            <span className="grid place-items-center size-8 rounded-full bg-accent-quiet text-accent shrink-0">
              <MessageCircle className="size-4" strokeWidth={2.3} />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold text-ink">Charla libre</span>
              <span className="block text-[0.75rem] text-ink-3">Sin los datos de tu curso</span>
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-6">
        {conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.875rem] text-ink-3">
            Aquí irán tus conversaciones. Se guardan solo en este dispositivo.
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.875rem] text-ink-3">Nada con «{query.trim()}».</p>
        ) : (
          groups.map((g) => (
            <section key={g.group} className="mt-3 first:mt-1">
              <h3 className="px-3 pb-1 text-[0.8125rem] font-semibold text-ink-3">{g.group}</h3>
              <ul className="flex flex-col">
                {g.items.map((c) => (
                  <Row
                    key={c.id}
                    conversation={c}
                    current={c.id === currentId}
                    onOpen={() => onOpen(c.id)}
                    onDelete={() => onDelete(c.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

const REVEAL = 84

function Row({
  conversation: c,
  current,
  onOpen,
  onDelete,
}: {
  conversation: Conversation
  current: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const coarse = useCoarsePointer()
  const x = useMotionValue(0)
  const dragged = useRef(false)
  const deleteOpacity = useTransform(x, [-REVEAL, -24, 0], [1, 0.4, 0])
  const close = () => void animate(x, 0, spring.snappy)

  return (
    <li className="asst-row relative rounded-[14px] overflow-hidden">
      {coarse && (
        <motion.button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onDelete}
          style={{ opacity: deleteOpacity }}
          className="absolute inset-y-0 right-0 w-[96px] flex items-center justify-end pr-5 bg-danger-fill text-white rounded-[14px]"
        >
          <Trash2 className="size-5" strokeWidth={2.3} />
        </motion.button>
      )}
      <motion.div
        style={{ x }}
        drag={coarse ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.55, right: 0.05 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          window.setTimeout(() => (dragged.current = false), 60)
          // Un tirón largo o rápido borra; uno corto deja ver el botón.
          if (info.offset.x < -170 || info.velocity.x < -900) {
            haptic()
            onDelete()
            return
          }
          if (info.offset.x < -REVEAL / 2) void animate(x, -REVEAL, spring.snappy)
          else close()
        }}
        className={cx('relative flex items-center rounded-[14px]', current ? 'asst-row-current' : 'bg-transparent')}
      >
        <button
          type="button"
          onClick={() => {
            if (dragged.current) return
            if (x.get() < -4) return close()
            onOpen()
          }}
          aria-current={current ? 'true' : undefined}
          className="pressable flex-1 min-w-0 text-left px-3 py-2.5 rounded-[14px] hover:bg-fill/60"
        >
          <span className="flex items-baseline gap-2">
            <span className="flex-1 min-w-0 truncate text-[0.9375rem] font-semibold text-ink">
              {conversationTitle(c)}
            </span>
            <span className="shrink-0 text-[0.75rem] text-ink-3 tabular-nums">{when(c.updatedAt)}</span>
          </span>
          <span className="block truncate text-[0.8125rem] text-ink-3 mt-0.5">
            {c.mode === 'libre' && <span className="text-accent font-medium">Charla libre · </span>}
            {conversationPreview(c)}
          </span>
        </button>
        {!coarse && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Borrar conversación"
            title="Borrar"
            className="asst-row-delete opacity-0 focus-visible:opacity-100 transition-opacity liquid-press grid place-items-center size-8 mr-1.5 rounded-full text-ink-3 hover:text-danger hover:bg-danger-quiet shrink-0"
          >
            <Trash2 className="size-4" strokeWidth={2.2} />
          </button>
        )}
      </motion.div>
    </li>
  )
}
