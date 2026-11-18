/**
 * Conversaciones del asistente: cuándo se empieza una nueva, el historial y
 * la migración desde el formato de una sola conversación.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  conversationTitle,
  currentConversation,
  deleteConversation,
  EMPTY_STORE,
  FRESH_AFTER_MS,
  migrateLegacy,
  openConversation,
  parseStore,
  shouldStartFresh,
  startNew,
  updateCurrent,
  type ChatMessage,
} from '../src/assistant/conversation.ts'

let n = 0
const id = () => `c${++n}`
const msg = (role: 'user' | 'assistant', text: string, at: number): ChatMessage => ({
  id: `m${++n}`,
  role,
  text,
  at,
})

describe('conversaciones del asistente', () => {
  it('el primer mensaje crea la conversación y la deja abierta', () => {
    const store = updateCurrent(EMPTY_STORE, (list) => [...list, msg('user', 'Hola', 1000)], id)
    assert.equal(store.conversations.length, 1)
    assert.equal(currentConversation(store)?.messages.length, 1)
    assert.equal(currentConversation(store)?.updatedAt, 1000)
  })

  it('una lista vacía en una conversación nueva no crea nada', () => {
    assert.equal(updateCurrent(EMPTY_STORE, [], id), EMPTY_STORE)
  })

  it('empezar una nueva conserva la anterior en el historial', () => {
    let store = updateCurrent(EMPTY_STORE, [msg('user', 'Examen de mates', 1000)], id)
    const first = store.currentId
    store = startNew(store)
    assert.equal(store.currentId, null)
    store = updateCurrent(store, [msg('user', 'Otra cosa', 2000)], id)
    assert.equal(store.conversations.length, 2)
    assert.notEqual(store.currentId, first)
    // Retomar la anterior la sube arriba al escribir en ella.
    store = openConversation(store, first!)
    store = updateCurrent(store, (list) => [...list, msg('assistant', 'Vale', 3000)], id)
    assert.equal(store.conversations[0].id, first)
    assert.equal(store.conversations[0].updatedAt, 3000)
  })

  it('pasado el plazo sin mensajes, abrir empieza una nueva', () => {
    const store = updateCurrent(EMPTY_STORE, [msg('user', 'Hola', 1000)], id)
    assert.equal(shouldStartFresh(store, 1000 + FRESH_AFTER_MS - 1), false)
    assert.equal(shouldStartFresh(store, 1000 + FRESH_AFTER_MS + 1), true)
    assert.equal(shouldStartFresh(EMPTY_STORE, 10 ** 12), false)
  })

  it('borrar la abierta deja una nueva', () => {
    let store = updateCurrent(EMPTY_STORE, [msg('user', 'Hola', 1000)], id)
    store = deleteConversation(store, store.currentId!)
    assert.deepEqual(store, EMPTY_STORE)
  })

  it('migra la conversación única del formato anterior', () => {
    const legacy = { messages: [msg('user', 'Apunta un examen', 1000), msg('assistant', 'Hecho', 2000)] }
    const store = migrateLegacy(legacy, id)
    assert.equal(store.conversations.length, 1)
    assert.equal(store.currentId, store.conversations[0].id)
    assert.equal(store.conversations[0].updatedAt, 2000)
    assert.deepEqual(migrateLegacy(null, id), EMPTY_STORE)
  })

  it('descarta lo que no tiene forma de conversación al leer', () => {
    const store = parseStore({
      currentId: 'no-existe',
      conversations: [
        { id: 'a', messages: [msg('user', 'Uno', 5)] },
        { id: 'b', messages: [] },
        { messages: [msg('user', 'Sin id', 6)] },
        'basura',
      ],
    })
    assert.equal(store.conversations.length, 1)
    assert.equal(store.currentId, null)
  })

  it('el título es lo primero que pediste, recortado', () => {
    const long = 'x'.repeat(100)
    let store = updateCurrent(EMPTY_STORE, [msg('user', long, 1)], id)
    assert.ok(conversationTitle(currentConversation(store)!).length <= 70)
    store = updateCurrent(EMPTY_STORE, [msg('user', '  Pon   45 min ', 1)], id)
    assert.equal(conversationTitle(currentConversation(store)!), 'Pon 45 min')
  })
})
