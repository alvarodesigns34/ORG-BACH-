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

const STORE = 'bachillerato-os:assistant'
/** Lo que se conserva en el dispositivo (la vista muestra todo esto). */
const KEEP = 80

export function loadConversation(account: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${STORE}:${account}`)
    const parsed = raw ? (JSON.parse(raw) as { messages?: unknown }) : null
    return Array.isArray(parsed?.messages) ? (parsed.messages as ChatMessage[]) : []
  } catch {
    return []
  }
}

export function saveConversation(account: string, messages: ChatMessage[]): void {
  try {
    const kept = messages.filter((m) => !m.error).slice(-KEEP)
    if (kept.length === 0) localStorage.removeItem(`${STORE}:${account}`)
    else localStorage.setItem(`${STORE}:${account}`, JSON.stringify({ messages: kept }))
  } catch {
    // Sin almacenamiento (modo privado, cuota): la charla vive solo en memoria.
  }
}
