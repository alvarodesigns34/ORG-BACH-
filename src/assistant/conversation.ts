/**
 * Conversación con el asistente: lo que se guarda en el dispositivo y lo que
 * se le manda al modelo como memoria de la charla.
 *
 * El modelo no recuerda nada entre peticiones: la continuidad («muévelo al
 * viernes», «sí, hazlo») sale de reenviarle los últimos mensajes. Los suyos
 * van acompañados de lo que la app aplicó DE VERDAD, con los ids, para que
 * pueda editar justo eso y no algo parecido.
 */

import type { AppliedItem, UndoPlan } from './actions.ts'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Epoch ms. */
  at: number
  /** Mensaje dictado por voz (el texto es la transcripción). */
  voice?: boolean
  applied?: AppliedItem[]
  skipped?: string[]
  undo?: UndoPlan | null
  undone?: boolean
  /** Respuesta de error (no se manda al modelo). */
  error?: boolean
  /** Mensaje del alumno que no llegó a responderse. */
  failed?: boolean
}

/** Mensajes que se reenvían como memoria: de sobra para seguir un tema. */
export const HISTORY_TURNS = 16

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export function historyForModel(messages: ChatMessage[], limit = HISTORY_TURNS): HistoryTurn[] {
  const turns: HistoryTurn[] = []
  for (const m of messages) {
    if (m.error || m.failed || !m.text.trim()) continue
    if (m.role === 'user') {
      turns.push({ role: 'user', content: m.text })
      continue
    }
    const notes: string[] = []
    if (m.applied?.length)
      notes.push(`[Hecho en la app: ${m.applied.map((a) => a.memo).join('; ')}]`)
    if (m.undone)
      notes.push('[El alumno pulsó «Deshacer»: todo lo anterior se revirtió y ya no existe.]')
    if (m.skipped?.length) notes.push(`[No se pudo aplicar: ${m.skipped.join(' ')}]`)
    turns.push({ role: 'assistant', content: [m.text, ...notes].join('\n') })
  }
  return turns.slice(-limit)
}

/**
 * Varias conversaciones guardadas en el dispositivo, una de ellas abierta.
 *
 * Al abrir el asistente se empieza una conversación nueva si la abierta lleva
 * más de FRESH_AFTER_MS sin mensajes: lo normal es venir a por otra cosa. Las
 * anteriores quedan en el historial y se pueden retomar.
 */
export interface Conversation {
  id: string
  /** «libre»: charla de cualquier tema, sin datos del curso. */
  mode?: 'libre'
  /** Epoch ms del primer mensaje. */
  startedAt: number
  /** Epoch ms del último mensaje. */
  updatedAt: number
  messages: ChatMessage[]
}

export interface ConversationStore {
  /** La abierta; null = una nueva, vacía, que aún no se ha guardado. */
  currentId: string | null
  /** De la más reciente a la más antigua. */
  conversations: Conversation[]
}

export const EMPTY_STORE: ConversationStore = { currentId: null, conversations: [] }

/** Pasado este tiempo sin mensajes, abrir el asistente empieza otra conversación. */
export const FRESH_AFTER_MS = 15 * 60_000
/** Mensajes que se conservan de cada conversación. */
const KEEP = 80
/** Conversaciones que se conservan en el historial. */
const KEEP_CONVERSATIONS = 30

const STORE = 'bachillerato-os:assistant-v2'
/** Formato anterior: una sola conversación. Se migra la primera vez. */
const LEGACY_STORE = 'bachillerato-os:assistant'

export function currentConversation(store: ConversationStore): Conversation | null {
  return store.conversations.find((c) => c.id === store.currentId) ?? null
}

/** Cambia los mensajes de la conversación abierta (y la crea si es nueva). */
export function updateCurrent(
  store: ConversationStore,
  next: ChatMessage[] | ((list: ChatMessage[]) => ChatMessage[]),
  makeId: () => string,
  now = Date.now(),
  /** Modo de la conversación, si hay que crearla. */
  mode?: 'libre',
): ConversationStore {
  const current = currentConversation(store)
  const before = current?.messages ?? []
  const messages = typeof next === 'function' ? next(before) : next
  if (messages === before) return store
  if (!current) {
    if (messages.length === 0) return store
    const created: Conversation = {
      id: makeId(),
      ...(mode ? { mode } : {}),
      startedAt: messages[0]?.at ?? now,
      updatedAt: messages.at(-1)?.at ?? now,
      messages,
    }
    return {
      currentId: created.id,
      conversations: [created, ...store.conversations].slice(0, KEEP_CONVERSATIONS),
    }
  }
  if (messages.length === 0) {
    return {
      currentId: null,
      conversations: store.conversations.filter((c) => c.id !== current.id),
    }
  }
  const updated: Conversation = {
    ...current,
    messages,
    updatedAt: Math.max(current.updatedAt, messages.at(-1)?.at ?? now),
  }
  // La que se usa sube arriba del historial.
  return {
    currentId: current.id,
    conversations: [updated, ...store.conversations.filter((c) => c.id !== current.id)],
  }
}

/** ¿Hay que empezar una conversación nueva al abrir el asistente? */
export function shouldStartFresh(store: ConversationStore, now = Date.now()): boolean {
  const current = currentConversation(store)
  if (!current || current.messages.length === 0) return false
  return now - current.updatedAt > FRESH_AFTER_MS
}

/** Deja abierta una conversación nueva; la anterior queda en el historial. */
export function startNew(store: ConversationStore): ConversationStore {
  return store.currentId === null ? store : { ...store, currentId: null }
}

export function openConversation(store: ConversationStore, id: string): ConversationStore {
  return store.conversations.some((c) => c.id === id) ? { ...store, currentId: id } : store
}

export function deleteConversation(store: ConversationStore, id: string): ConversationStore {
  return {
    currentId: store.currentId === id ? null : store.currentId,
    conversations: store.conversations.filter((c) => c.id !== id),
  }
}

/** Título para el historial: lo primero que pediste. */
export function conversationTitle(conversation: Conversation): string {
  const first = conversation.messages.find((m) => m.role === 'user' && m.text.trim())
  const text = (first?.text ?? 'Conversación').replace(/\s+/g, ' ').trim()
  return text.length > 70 ? `${text.slice(0, 69).trimEnd()}…` : text
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const m = value as Partial<ChatMessage>
  return (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && typeof m.id === 'string'
}

function cleanMessages(raw: unknown): ChatMessage[] {
  return Array.isArray(raw) ? raw.filter(isMessage) : []
}

export function parseStore(raw: unknown): ConversationStore {
  if (!raw || typeof raw !== 'object') return EMPTY_STORE
  const data = raw as { currentId?: unknown; conversations?: unknown }
  const conversations: Conversation[] = []
  for (const c of Array.isArray(data.conversations) ? data.conversations : []) {
    if (!c || typeof c !== 'object') continue
    const { id, startedAt, updatedAt, messages, mode } = c as Partial<Conversation>
    const list = cleanMessages(messages)
    if (typeof id !== 'string' || list.length === 0) continue
    const first = list[0].at
    const last = list.at(-1)!.at
    conversations.push({
      id,
      ...(mode === 'libre' ? { mode } : {}),
      startedAt: typeof startedAt === 'number' ? startedAt : typeof first === 'number' ? first : 0,
      updatedAt: typeof updatedAt === 'number' ? updatedAt : typeof last === 'number' ? last : 0,
      messages: list,
    })
  }
  conversations.sort((a, b) => b.updatedAt - a.updatedAt)
  const currentId =
    typeof data.currentId === 'string' && conversations.some((c) => c.id === data.currentId)
      ? data.currentId
      : null
  return { currentId, conversations: conversations.slice(0, KEEP_CONVERSATIONS) }
}

/** Convierte la conversación única del formato anterior. */
export function migrateLegacy(raw: unknown, makeId: () => string): ConversationStore {
  const messages = cleanMessages((raw as { messages?: unknown } | null)?.messages)
  if (messages.length === 0) return EMPTY_STORE
  const id = makeId()
  return {
    currentId: id,
    conversations: [
      {
        id,
        startedAt: messages[0].at ?? 0,
        updatedAt: messages.at(-1)!.at ?? 0,
        messages,
      },
    ],
  }
}

export function loadConversations(account: string, makeId: () => string): ConversationStore {
  try {
    const raw = localStorage.getItem(`${STORE}:${account}`)
    if (raw) return parseStore(JSON.parse(raw))
    const legacy = localStorage.getItem(`${LEGACY_STORE}:${account}`)
    return legacy ? migrateLegacy(JSON.parse(legacy), makeId) : EMPTY_STORE
  } catch {
    return EMPTY_STORE
  }
}

export function saveConversations(account: string, store: ConversationStore): void {
  try {
    const conversations = store.conversations
      .map((c) => ({ ...c, messages: c.messages.filter((m) => !m.error).slice(-KEEP) }))
      .filter((c) => c.messages.length > 0)
    if (conversations.length === 0) {
      localStorage.removeItem(`${STORE}:${account}`)
    } else {
      const currentId = conversations.some((c) => c.id === store.currentId) ? store.currentId : null
      localStorage.setItem(`${STORE}:${account}`, JSON.stringify({ currentId, conversations }))
    }
    // El formato anterior ya está migrado: no se deja una copia que quede vieja.
    localStorage.removeItem(`${LEGACY_STORE}:${account}`)
  } catch {
    // Sin almacenamiento (modo privado, cuota): la charla vive solo en memoria.
  }
}
