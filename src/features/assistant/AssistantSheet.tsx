import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  CalendarDays,
  GraduationCap,
  ListChecks,
  Mic,
  PanelLeft,
  Plane,
  Route,
  Sparkle,
  Square,
  SquarePen,
  X,
} from 'lucide-react'

import {
  applyAssistantActions,
  applyUndo,
  buildContext,
  flightHref,
  isEmptyPlan,
  planUndo,
  type PlaceResolver,
} from '@/assistant/actions'
import {
  askAssistant,
  canRecord,
  fetchFreeChatAllowed,
  MAX_RECORDING_MS,
  startRecording,
  type AssistantReply,
  type Recording,
} from '@/assistant/client'
import {
  conversationTitle,
  currentConversation,
  deleteConversation,
  EMPTY_STORE,
  historyForModel,
  loadConversations,
  openConversation,
  restoreConversation,
  saveConversations,
  shouldStartFresh,
  startNew,
  updateCurrent,
  type ChatMessage,
  type Conversation,
  type ConversationStore,
} from '@/assistant/conversation'
import { currentAirport, distanceKm, minutesFor } from '@/domain/flights'
import { newId } from '@/domain/id'
import { hrefFor } from '@/router'
import { useStore } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { Modal } from '@/ui/Modal'
import { haptic, scrollBehavior, spring } from '@/ui/motion'
import { Button, cx } from '@/ui/primitives'

import './assistant.css'
import { ConversationList } from './ConversationList'
import { AssistantMessage, DayStamp, ErrorMessage, Thinking, UserBubble } from './Messages'
import { primeSpeech, speak, stopSpeaking } from './speech'
import { AssistantSurface, type SurfaceApi } from './Surface'
import { VoiceMode, type VoiceState } from './VoiceMode'

type Phase = 'idle' | 'recording' | 'thinking'
type Input = { text?: string; audio?: { data: string; mimeType: string } }

const NO_MESSAGES: ChatMessage[] = []
/** Pausa entre mensajes a partir de la cual se pone la hora en medio. */
const STAMP_GAP_MS = 60 * 60_000

/** Sugerencias: las preguntas se envían; los ejemplos de «apuntar» se dejan escritos para retocarlos. */
const SUGGESTIONS = [
  { icon: CalendarDays, title: '¿Qué tengo esta semana?', text: '¿Qué tengo esta semana?', send: true },
  { icon: Route, title: 'Plan de repaso', text: 'Hazme un plan de repaso para mi próximo examen', send: true },
  { icon: GraduationCap, title: '¿Qué nota necesito?', text: '¿Qué nota necesito para llegar a mi objetivo?', send: true },
  { icon: Plane, title: 'Vuelo de 25 min', text: 'Prepárame un vuelo de 25 minutos', send: true },
  { icon: ListChecks, title: 'Apuntar algo', text: 'Apúntame ', send: false },
]

/**
 * Asistente: una conversación. Dices o escribes lo que quieres y la app lo
 * hace, o te responde con tus propios datos; y puedes seguir hablando del
 * mismo tema («muévelo al viernes») sin empezar de cero.
 *
 * La IA solo propone acciones; se aplican con la misma lógica que la interfaz
 * y cada respuesta se puede deshacer por separado.
 *
 * Las conversaciones se guardan en el dispositivo. Al abrirlo después de un
 * rato (FRESH_AFTER_MS sin mensajes) empieza una nueva; las anteriores quedan
 * en el historial (barra lateral en el iPad, cajón en el iPhone).
 */
export function AssistantSheet({
  open,
  onClose,
  start,
}: {
  open: boolean
  onClose: () => void
  /** Cómo se ha abierto: «voice» empieza a dictar nada más abrirse. */
  start?: { mode: 'text' | 'voice'; at: number }
}) {
  const { data, today, replaceAndSave } = useStore()
  const sync = useSync()
  const account = sync.email ?? ''
  const signedIn = !!sync.email
  const firstName = data.settings.userName.trim().split(/\s+/)[0] ?? ''

  const latest = useRef(data)
  latest.current = data

  // Destinos del modo estudio («vuelo a Tokio»): los aeropuertos se cargan al
  // abrir el asistente, aparte, para no engordar su arranque.
  const places = useRef<PlaceResolver | undefined>(undefined)
  useEffect(() => {
    if (!open || places.current) return
    void import('@/features/study/airports')
      .then(({ AIRPORT_BY_IATA, searchAirports }) => {
        places.current = (query) => {
          const from = AIRPORT_BY_IATA.get(currentAirport(latest.current.sessions))
          const to = searchAirports(query, 1)[0]
          if (!from || !to || to.iata === from.iata) return null
          return { iata: to.iata, city: to.city, from: from.city, minutes: minutesFor(distanceKm(from, to)) }
        }
      })
      .catch(() => {})
  }, [open])

  const [store, setStore] = useState<ConversationStore>(() =>
    account ? loadConversations(account, () => newId('chat')) : EMPTY_STORE,
  )
  const current = currentConversation(store)
  const messages = current?.messages ?? NO_MESSAGES
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Charla libre: solo si el servidor la permite a esta cuenta. La respuesta
  // se recuerda para que la opción no aparezca de golpe al abrir.
  const [freeAllowed, setFreeAllowed] = useState(() => readFreeAllowed(account))
  /** Modo de la próxima conversación nueva (la abierta manda si la hay). */
  const [nextMode, setNextMode] = useState<'libre' | undefined>()
  const freeMode = (current ? current.mode : nextMode) === 'libre' && freeAllowed
  const modeRef = useRef(nextMode)
  modeRef.current = nextMode

  /** Cambia los mensajes de la conversación abierta (la crea si es nueva). */
  const setMessages = useCallback(
    (next: ChatMessage[] | ((list: ChatMessage[]) => ChatMessage[])) =>
      setStore((store) => updateCurrent(store, next, () => newId('chat'), Date.now(), modeRef.current)),
    [],
  )
  const [loadedFor, setLoadedFor] = useState(account)
  if (loadedFor !== account) {
    // Cambio de cuenta: cada una tiene sus propias conversaciones.
    setLoadedFor(account)
    setStore(account ? loadConversations(account, () => newId('chat')) : EMPTY_STORE)
    setFreeAllowed(readFreeAllowed(account))
    setNextMode(undefined)
  }
  useEffect(() => {
    if (!open || !signedIn) return
    let live = true
    void fetchFreeChatAllowed().then((allowed) => {
      if (!live || allowed === null) return
      setFreeAllowed(allowed)
      writeFreeAllowed(account, allowed)
    })
    return () => {
      live = false
    }
  }, [open, signedIn, account])
  useEffect(() => {
    if (account) saveConversations(account, store)
  }, [account, store])

  /** Historial: cajón en iPhone/iPad vertical, barra lateral en iPad horizontal. */
  const [drawer, setDrawer] = useState(false)
  const [sideOpen, setSideOpen] = useState(() => readSide())
  const [deleted, setDeleted] = useState<Conversation | null>(null)

  const [review, setReview] = useState<{
    answer: AssistantReply
    start: typeof data
    account: string
    items: string[]
  } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const recording = useRef<Recording | null>(null)
  const pending = useRef<AbortController | null>(null)
  /** Lo último enviado, por si hay que reintentarlo (el audio no se guarda). */
  const lastInput = useRef<Input | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  /** Respuestas llegadas en esta sesión: se revelan palabra a palabra. */
  const fresh = useRef(new Set<string>())

  // Modo voz.
  const [voice, setVoiceState] = useState<VoiceState | null>(null)
  const voiceRef = useRef<VoiceState | null>(null)
  const setVoice = (next: VoiceState | null) => {
    voiceRef.current = next
    setVoiceState(next)
  }
  const [voiceReply, setVoiceReply] = useState('')
  const awaitingVoice = useRef(false)
  const stopSpeech = useRef<() => void>(() => {})

  // Al cerrar: se corta cualquier grabación, lectura o petición en curso.
  useEffect(() => {
    if (open) return
    recording.current?.cancel()
    recording.current = null
    pending.current?.abort()
    pending.current = null
    stopSpeech.current()
    stopSpeaking()
    setVoice(null)
    setPhase('idle')
    setReview(null)
    setDrawer(false)
  }, [open])

  useEffect(() => () => { pending.current?.abort() }, [account])

  // Al abrir: si la conversación abierta lleva un rato parada, empieza una
  // nueva (la anterior queda en el historial).
  const wasOpen = useRef(false)
  useLayoutEffect(() => {
    if (open && !wasOpen.current && shouldStartFresh(store)) {
      setStore(startNew)
      setNextMode(undefined)
    }
    wasOpen.current = open
  }, [open])

  // Onda y cronómetro mientras se graba; corte automático al llegar al tope.
  // En el modo voz, además, se envía solo al dejar de hablar.
  const stopAndSendRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    let frame = 0
    let floor = 0.05
    let speechFrames = 0
    let heardSpeech = false
    let quietSince = 0
    const tick = () => {
      const now = Date.now()
      const ms = now - started
      const lvl = recording.current?.level() ?? 0
      setElapsed(ms)
      setLevel(lvl)
      if (ms >= MAX_RECORDING_MS) {
        void stopAndSendRef.current()
        return
      }
      if (voiceRef.current === 'listening') {
        // Ruido de fondo: se adapta despacio hacia los valores bajos.
        if (lvl < floor * 1.4) floor = floor * 0.95 + lvl * 0.05
        const speaking = lvl > Math.max(0.16, floor * 2.6)
        const quiet = lvl < Math.max(0.09, floor * 1.7)
        if (speaking) {
          speechFrames += 1
          if (speechFrames > 8) heardSpeech = true
          quietSince = 0
        } else {
          speechFrames = Math.max(0, speechFrames - 1)
          if (heardSpeech && quiet) {
            quietSince ||= now
            if (now - quietSince > 1300) {
              void stopAndSendRef.current()
              return
            }
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  // El campo de texto crece con lo escrito, hasta unas seis líneas.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 156)}px`
  }, [text])

  const patchMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const pushAssistant = (message: Omit<ChatMessage, 'id' | 'role' | 'at'>) => {
    const id = newId('msg')
    fresh.current.add(id)
    setMessages((list) => [...list, { id, role: 'assistant', at: Date.now(), ...message }])
  }

  const commit = (answer: AssistantReply, result = applyAssistantActions(latest.current, answer.actions, today, places.current)) => {
    const plan = planUndo(latest.current, result.data)
    if (!isEmptyPlan(plan) && !replaceAndSave(result.data)) {
      throw new Error('Los cambios no se pudieron guardar. Tu curso actual sigue abierto.')
    }
    if (result.applied.length) haptic('success')
    pushAssistant({
      text: answer.reply || (result.applied.length ? 'Hecho.' : 'No he encontrado ningún cambio que aplicar.'),
      applied: result.applied,
      skipped: result.skipped,
      undo: isEmptyPlan(plan) ? null : plan,
    })
    if (result.flight) {
      onClose()
      window.location.hash = flightHref(result.flight).slice(1)
    }
  }

  const send = async (input: Input) => {
    if (pending.current || (review && review.account === account)) return
    lastInput.current = input
    if (voiceRef.current) awaitingVoice.current = true
    const userId = newId('msg')
    const history = historyForModel(messagesRef.current)
    setMessages((list) => [
      ...list,
      { id: userId, role: 'user', text: input.text ?? '', voice: !!input.audio, at: Date.now() },
    ])
    setPhase('thinking')
    const controller = new AbortController()
    pending.current = controller
    try {
      const answer = await askAssistant({
        ...input,
        ...(freeMode ? { mode: 'libre' as const } : { context: buildContext(latest.current, today) }),
        history,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (input.audio) patchMessage(userId, { text: answer.heard || 'Mensaje de voz' })
      const current = latest.current
      const result = applyAssistantActions(current, answer.actions, today, places.current)
      const protectedAction = answer.actions.some(
        ({ type }) => type.startsWith('delete_') || type === 'update_exam' || type === 'update_grade',
      )
      if (result.applied.length > 1 || (result.applied.length > 0 && protectedAction)) {
        setReview({ answer, start: current, account, items: result.applied.map((item) => item.text) })
      } else {
        commit(answer, result)
      }
    } catch (e) {
      if (controller.signal.aborted) return
      patchMessage(userId, { failed: true, text: input.text ?? 'Mensaje de voz' })
      pushAssistant({ error: true, text: e instanceof Error ? e.message : String(e) })
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setPhase('idle')
      }
    }
  }

  const retry = () => {
    const input = lastInput.current
    if (!input) return
    // Se quita el intento fallido (su mensaje y el error) y se reenvía.
    const copy = [...messagesRef.current]
    if (copy.at(-1)?.error) copy.pop()
    if (copy.at(-1)?.failed) copy.pop()
    messagesRef.current = copy
    setMessages(copy)
    void send(input)
  }

  const submitText = () => {
    const value = text.trim()
    if (!value || phase !== 'idle') return
    setText('')
    void send({ text: value })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Intro envía; Mayús+Intro hace salto de línea. Respeta el IME (acentos).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submitText()
    }
  }

  const startingVoice = useRef(false)
  const openRef = useRef(open)
  openRef.current = open

  /** Empieza a grabar. false si no hay micrófono o permiso. */
  const startVoice = async (): Promise<boolean> => {
    if (startingVoice.current || recording.current) return false
    startingVoice.current = true
    try {
      const rec = await startRecording()
      if (!openRef.current) {
        rec.cancel()
        return false
      }
      recording.current = rec
      setElapsed(0)
      setPhase('recording')
      return true
    } catch {
      lastInput.current = null
      const message = 'No tengo acceso al micrófono. Dale permiso en los ajustes del navegador o escríbemelo.'
      if (voiceRef.current) {
        setVoiceReply(message)
        setVoice('error')
      } else {
        pushAssistant({ error: true, text: message })
      }
      return false
    } finally {
      startingVoice.current = false
    }
  }

  // Abierto desde el botón del micrófono: empieza a dictar directamente.
  const startedFor = useRef(0)
  useEffect(() => {
    if (!open || !start || start.at === startedFor.current) return
    startedFor.current = start.at
    if (start.mode === 'voice' && canRecord() && phase === 'idle' && !review) {
      setDrawer(false)
      void startVoice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start])

  const cancelVoice = () => {
    recording.current?.cancel()
    recording.current = null
    setPhase('idle')
  }

  const stopAndSend = async () => {
    const rec = recording.current
    recording.current = null
    if (!rec) return
    // Pasar a «thinking» desde ya evita doble pulsación mientras se codifica el WAV.
    setPhase('thinking')
    if (voiceRef.current) setVoice('thinking')
    try {
      const audio = await rec.stop()
      if (!openRef.current) return
      if (audio.ms < 600) {
        setPhase('idle')
        // Un toque sin querer: no se manda nada (en el modo voz, se sigue escuchando).
        if (voiceRef.current) void listen()
        return
      }
      await send({ audio: { data: audio.data, mimeType: audio.mimeType } })
    } catch {
      lastInput.current = null
      setPhase('idle')
      if (voiceRef.current) {
        setVoiceReply('No se pudo grabar el audio.')
        setVoice('error')
      } else {
        pushAssistant({ error: true, text: 'No se pudo grabar el audio.' })
      }
    }
  }
  stopAndSendRef.current = stopAndSend

  // ---------------------------------------------------------------- Voz ----
  const listen = async () => {
    if (!voiceRef.current) return
    stopSpeech.current()
    setVoice('starting')
    if (await startVoice()) {
      if (voiceRef.current) setVoice('listening')
      else cancelVoice()
    }
  }

  const enterVoice = () => {
    if (!canRecord() || phase !== 'idle' || pendingReview) return
    primeSpeech()
    haptic()
    setDrawer(false)
    setVoiceReply('')
    setVoice('starting')
    void listen()
  }

  const exitVoice = () => {
    stopSpeech.current()
    stopSpeaking()
    awaitingVoice.current = false
    if (recording.current) cancelVoice()
    setVoice(null)
  }

  const voicePrimary = () => {
    const state = voiceRef.current
    if (state === 'listening') void stopAndSend()
    else if (state === 'speaking' || state === 'error') void listen()
  }

  // Al llegar la respuesta en el modo voz: se lee y se vuelve a escuchar.
  useEffect(() => {
    if (!voice || phase !== 'idle' || !awaitingVoice.current) return
    awaitingVoice.current = false
    if (review && review.account === account) {
      // Hay cambios que revisar: se sale para verlos en la conversación.
      exitVoice()
      return
    }
    const last = messagesRef.current.at(-1)
    if (!last || last.role !== 'assistant') return void listen()
    setVoiceReply(last.text)
    if (last.error) {
      setVoice('error')
      return
    }
    setVoice('speaking')
    stopSpeech.current = speak(last.text, () => {
      if (voiceRef.current === 'speaking') void listen()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voice, messages, review])

  // ------------------------------------------------------- Conversaciones ----
  const undo = (message: ChatMessage) => {
    if (!message.undo || message.undone) return
    if (replaceAndSave(applyUndo(latest.current, message.undo))) patchMessage(message.id, { undone: true })
  }

  const stopEverything = () => {
    pending.current?.abort()
    pending.current = null
    recording.current?.cancel()
    recording.current = null
    setPhase('idle')
    setReview(null)
    lastInput.current = null
  }

  const stopThinking = () => {
    pending.current?.abort()
    pending.current = null
    setPhase('idle')
  }

  const newConversation = (mode?: 'libre') => {
    stopEverything()
    setStore(startNew)
    setNextMode(mode === 'libre' ? 'libre' : undefined)
    setDrawer(false)
    setText('')
    if (window.matchMedia('(pointer: fine)').matches) field.current?.focus()
  }

  const setFreeMode = (on: boolean) => {
    if (on === freeMode) return
    // Cada conversación es de un modo: cambiarlo empieza otra.
    newConversation(on ? 'libre' : undefined)
  }

  const resume = (id: string) => {
    if (id !== store.currentId) stopEverything()
    setStore((current) => openConversation(current, id))
    setDrawer(false)
  }

  const remove = (id: string) => {
    if (id === store.currentId) stopEverything()
    const conversation = store.conversations.find((c) => c.id === id) ?? null
    setStore((current) => deleteConversation(current, id))
    setDeleted(conversation)
  }
  useEffect(() => {
    if (!deleted) return
    const t = window.setTimeout(() => setDeleted(null), 5000)
    return () => window.clearTimeout(t)
  }, [deleted])
  const restore = () => {
    if (!deleted) return
    setStore((current) => restoreConversation(current, deleted))
    setDeleted(null)
  }

  const pendingReview = review?.account === account ? review : null
  const reviewChanges = () => {
    if (!pendingReview) return
    const current = latest.current
    const result = applyAssistantActions(current, pendingReview.answer.actions, today, places.current)
    const items = result.applied.map((item) => item.text)
    if (pendingReview.start !== current && JSON.stringify(items) !== JSON.stringify(pendingReview.items)) {
      setReview({ ...pendingReview, start: current, items })
      return
    }
    try {
      commit(pendingReview.answer, result)
      setReview(null)
    } catch (error) {
      pushAssistant({ error: true, text: String(error) })
    }
  }

  const toggleSide = () =>
    setSideOpen((v) => {
      writeSide(!v)
      return !v
    })

  /** Esc: primero el modo voz, luego el cajón; si no, se cierra. */
  const onEscape = () => {
    if (voiceRef.current) {
      exitVoice()
      return true
    }
    if (drawer) {
      setDrawer(false)
      return true
    }
    return false
  }

  if (!signedIn) {
    return (
      <Modal open={open} onClose={onClose} title="Asistente" size="sm">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <span className="asst-orb size-16" aria-hidden />
          <p className="text-[0.9375rem] text-ink-2 max-w-[32ch]">
            Dile qué apuntar o pregúntale por tu curso, y lo hace por ti. Para usarlo, inicia sesión
            en Ajustes: la IA trabaja en el servidor.
          </p>
          <Button
            variant="primary"
            onClick={() => (
              onClose(),
              (window.location.hash = hrefFor('ajustes', { seccion: 'cuenta' }).slice(1))
            )}
          >
            Ir a Ajustes
          </Button>
        </div>
      </Modal>
    )
  }

  const list = (onCloseList?: () => void) => (
    <ConversationList
      conversations={store.conversations}
      currentId={store.currentId}
      freeAllowed={freeAllowed}
      onOpen={resume}
      onDelete={remove}
      onNew={newConversation}
      onClose={onCloseList}
    />
  )

  return (
    <AssistantSurface open={open} onClose={onClose} onEscape={onEscape} label="Asistente">
      {(api) => (
        <div className="relative flex w-full h-full min-h-0">
          {api.layout === 'split' && (
            <AnimatePresence initial={false}>
              {sideOpen && (
                <motion.aside
                  key="side"
                  className="asst-side shrink-0 h-full overflow-hidden"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 308, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={spring.smooth}
                  aria-label="Conversaciones"
                >
                  <div className="w-[308px] h-full">{list()}</div>
                </motion.aside>
              )}
            </AnimatePresence>
          )}

          <Chat
            api={api}
            title={current ? conversationTitle(current) : freeMode ? 'Charla libre' : 'Asistente'}
            subtitle={freeMode ? 'Sin los datos de tu curso' : undefined}
            messages={messages}
            fresh={fresh.current}
            conversationKey={store.currentId ?? 'nueva'}
            phase={phase}
            empty={
              <Welcome
                name={firstName}
                free={freeMode}
                freeAllowed={freeAllowed}
                onMode={setFreeMode}
                onPick={(s) => {
                  if (s.send) void send({ text: s.text })
                  else {
                    setText(s.text)
                    requestAnimationFrame(() => {
                      field.current?.focus()
                      field.current?.setSelectionRange(s.text.length, s.text.length)
                    })
                  }
                }}
              />
            }
            review={
              pendingReview && (
                <section className="asst-card asst-in rounded-[22px] p-4 max-w-[560px]" aria-labelledby="revision-asistente">
                  <h3 id="revision-asistente" className="text-[1rem] font-semibold">Antes de tocar nada, échale un ojo</h3>
                  {pendingReview.items.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5 text-[0.9375rem] text-ink-2">
                      {pendingReview.items.map((item, index) => (
                        <li key={index} className="relative pl-4">
                          <span aria-hidden className="absolute left-0.5 top-[0.6em] size-[5px] rounded-full bg-ink-3" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[0.9375rem] text-ink-2">Ya no hay cambios aplicables en tu curso.</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setReview(null)}>Descartar</Button>
                    <Button size="sm" className="flex-1" variant="primary" onClick={reviewChanges} disabled={!pendingReview.items.length}>
                      Aplicar
                    </Button>
                  </div>
                </section>
              )
            }
            onUndo={undo}
            onRetry={lastInput.current && phase === 'idle' ? retry : undefined}
            onList={() => (api.layout === 'split' ? toggleSide() : setDrawer(true))}
            listOpen={api.layout === 'split' ? sideOpen : drawer}
            onNew={() => newConversation()}
            onClose={onClose}
            onEdgeSwipe={api.layout === 'split' ? undefined : () => setDrawer(true)}
            deleted={!!deleted}
            onRestore={restore}
            composer={
              <Composer
                field={field}
                text={text}
                setText={setText}
                onKeyDown={onKeyDown}
                phase={voice ? 'idle' : phase}
                blocked={!!pendingReview}
                hasMessages={messages.length > 0}
                seconds={Math.floor(elapsed / 1000)}
                level={level}
                onSend={submitText}
                onStop={stopThinking}
                onDictate={() => void startVoice()}
                onCancelDictation={cancelVoice}
                onSendDictation={() => void stopAndSend()}
                onVoiceMode={enterVoice}
              />
            }
          />

          {/* Cajón de conversaciones (iPhone e iPad vertical). */}
          <AnimatePresence>
            {api.layout !== 'split' && drawer && (
              <>
                <motion.div
                  key="scrim"
                  className="absolute inset-0 z-20 bg-black/25"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setDrawer(false)}
                  onPanEnd={(_, info) => info.offset.x < -40 && setDrawer(false)}
                  aria-hidden
                />
                <motion.aside
                  key="drawer"
                  className="asst-drawer absolute inset-y-0 left-0 z-20 w-[min(340px,86%)]"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%', transition: { ...spring.smooth, bounce: 0 } }}
                  transition={spring.smooth}
                  aria-label="Conversaciones"
                >
                  {list(() => setDrawer(false))}
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {voice && (
              <VoiceMode
                key="voice"
                state={voice}
                level={level}
                heard=""
                reply={voiceReply}
                seconds={Math.floor(elapsed / 1000)}
                onPrimary={voicePrimary}
                onClose={exitVoice}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </AssistantSurface>
  )
}

// ---------------------------------------------------------------------------
// Conversación
// ---------------------------------------------------------------------------

function useHeight(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [height, setHeight] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return height
}

function Chat({
  api,
  title,
  subtitle,
  messages,
  fresh,
  conversationKey,
  phase,
  empty,
  review,
  composer,
  onUndo,
  onRetry,
  onList,
  listOpen,
  onNew,
  onClose,
  onEdgeSwipe,
  deleted,
  onRestore,
}: {
  api: SurfaceApi
  title: string
  subtitle?: string
  messages: ChatMessage[]
  fresh: Set<string>
  conversationKey: string
  phase: Phase
  empty: React.ReactNode
  review: React.ReactNode
  composer: React.ReactNode
  onUndo: (m: ChatMessage) => void
  onRetry?: () => void
  onList: () => void
  listOpen: boolean
  onNew: () => void
  onClose: () => void
  onEdgeSwipe?: () => void
  deleted: boolean
  onRestore: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const headerH = useHeight(header, 64)
  const dockH = useHeight(dock, 88)
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)
  const phone = api.layout === 'phone'

  const toBottom = (behavior: ScrollBehavior) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }

  // Al cambiar de conversación, directo al final; con mensajes nuevos, se
  // sigue bajando si ya estabas abajo (o si el mensaje es tuyo).
  const shownKey = useRef('')
  useLayoutEffect(() => {
    if (shownKey.current !== conversationKey) {
      shownKey.current = conversationKey
      toBottom('auto')
      return
    }
    if (atBottomRef.current || messages.at(-1)?.role === 'user') toBottom(scrollBehavior())
  }, [conversationKey, messages.length, phase, review])

  // El teclado encoge la hoja: lo último sigue a la vista.
  useEffect(() => {
    if (api.keyboard && atBottomRef.current) toBottom('auto')
  }, [api.keyboard, dockH])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    atBottomRef.current = near
    if (near !== atBottom) setAtBottom(near)
  }

  // Deslizar desde el borde izquierdo abre las conversaciones (como ChatGPT).
  const edge = useRef<{ x: number; y: number; id: number } | null>(null)
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!onEdgeSwipe || e.pointerType !== 'touch') return
    const left = e.currentTarget.getBoundingClientRect().left
    if (e.clientX - left > 28) return
    edge.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const start = edge.current
    if (!start || start.id !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = Math.abs(e.clientY - start.y)
    if (dy > 30 && dy > dx) edge.current = null
    else if (dx > 44) {
      edge.current = null
      haptic()
      onEdgeSwipe?.()
    }
  }

  const glassIcon = 'glass-btn pressable grid place-items-center size-10 rounded-full text-ink shrink-0'

  return (
    <section
      className="relative flex-1 min-w-0 h-full"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (edge.current = null)}
      onPointerCancel={() => (edge.current = null)}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        style={{ paddingTop: headerH + 4, paddingBottom: dockH + 8, touchAction: 'pan-y' }}
      >
        <div
          key={conversationKey}
          className={cx(
            'mx-auto w-full max-w-[780px] px-5 sm:px-8 flex flex-col gap-5 min-h-full animate-fade',
            messages.length === 0 && 'justify-center',
          )}
          aria-live="polite"
        >
          {messages.length === 0
            ? empty
            : messages.map((m, i) => {
                const prev = messages[i - 1]
                const showStamp = !prev || m.at - prev.at > STAMP_GAP_MS
                return (
                  <div key={m.id} className="contents">
                    {showStamp && <DayStamp at={m.at} />}
                    {m.role === 'user' ? (
                      <UserBubble message={m} />
                    ) : m.error ? (
                      <ErrorMessage message={m} onRetry={i === messages.length - 1 ? onRetry : undefined} />
                    ) : (
                      <AssistantMessage
                        message={m}
                        fresh={fresh.has(m.id)}
                        last={i === messages.length - 1}
                        onUndo={() => onUndo(m)}
                      />
                    )}
                  </div>
                )
              })}
          {review}
          {phase === 'thinking' && <Thinking />}
        </div>
      </div>

      {/* Barra superior de cristal: el contenido pasa por debajo. */}
      <header
        ref={header}
        className="asst-bar absolute inset-x-0 top-0 z-10 touch-none sm:touch-auto"
        onPointerDown={api.startDrag}
      >
        {phone && <div aria-hidden className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-hairline-strong" />}
        <div className={cx('flex items-center gap-2 px-3', phone ? 'h-14' : 'h-[68px] px-4')}>
          <button
            type="button"
            onClick={onList}
            aria-label={listOpen ? 'Ocultar conversaciones' : 'Conversaciones'}
            aria-expanded={listOpen}
            title="Conversaciones"
            className={glassIcon}
          >
            <PanelLeft className="size-[19px]" strokeWidth={2.1} />
          </button>
          <div className="flex-1 min-w-0 text-center px-1">
            <h2 className="truncate text-[1rem] font-semibold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="truncate text-[0.75rem] text-ink-3">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onNew}
            aria-label="Nueva conversación"
            title="Nueva conversación"
            className={glassIcon}
          >
            <SquarePen className="size-[18px]" strokeWidth={2.2} />
          </button>
          <button type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar" className={glassIcon}>
            <X className="size-[19px]" strokeWidth={2.4} />
          </button>
        </div>
      </header>

      {/* Abajo: avisos, «ir al final» y la barra de escribir. */}
      <div
        ref={dock}
        className="asst-dock absolute inset-x-0 bottom-0 z-10 px-3 sm:px-6 pt-8"
        style={{ paddingBottom: api.keyboard ? 8 : 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="relative mx-auto max-w-[780px]">
          <AnimatePresence>
            {!atBottom && messages.length > 0 && (
              <motion.button
                key="down"
                type="button"
                onClick={() => toBottom(scrollBehavior())}
                aria-label="Ir al final"
                initial={{ opacity: 0, scale: 0.6, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.6, y: 10 }}
                transition={spring.snappy}
                className="glass-btn absolute left-1/2 -ml-5 -top-14 grid place-items-center size-10 rounded-full text-ink"
              >
                <ArrowDown className="size-[18px]" strokeWidth={2.4} />
              </motion.button>
            )}
            {deleted && (
              <motion.div
                key="deleted"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={spring.snappy}
                className="glass-btn absolute inset-x-0 mx-auto -top-[60px] w-fit flex items-center gap-3 h-11 pl-4 pr-1.5 rounded-full text-[0.875rem] text-ink"
                role="status"
              >
                Conversación borrada
                <button type="button" onClick={onRestore} className="pressable h-8 px-3 rounded-full font-semibold text-accent">
                  Deshacer
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {composer}
          {!api.keyboard && (
            <p className="mt-2 text-center text-[0.6875rem] text-ink-3 truncate">
              Puede equivocarse. Lo que cambie en tu curso se puede deshacer.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Barra de escribir
// ---------------------------------------------------------------------------

function Composer({
  field,
  text,
  setText,
  onKeyDown,
  phase,
  blocked,
  hasMessages,
  seconds,
  level,
  onSend,
  onStop,
  onDictate,
  onCancelDictation,
  onSendDictation,
  onVoiceMode,
}: {
  field: RefObject<HTMLTextAreaElement | null>
  text: string
  setText: (t: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  phase: Phase
  blocked: boolean
  hasMessages: boolean
  seconds: number
  level: number
  onSend: () => void
  onStop: () => void
  onDictate: () => void
  onCancelDictation: () => void
  onSendDictation: () => void
  onVoiceMode: () => void
}) {
  const voiceOk = canRecord()
  const has = text.trim().length > 0

  if (phase === 'recording') {
    return (
      <div data-liquid="off" className="asst-composer flex items-center gap-2 h-[52px] rounded-full px-1.5">
        <button type="button" onClick={onCancelDictation} aria-label="Cancelar" className="liquid-press grid place-items-center size-10 rounded-full text-ink-2">
          <X className="size-5" strokeWidth={2.4} />
        </button>
        <span className="size-2 rounded-full bg-danger animate-pulse shrink-0" aria-hidden />
        <span className="text-[0.9375rem] tabular-nums text-ink-2 w-10" aria-live="off">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        <Wave level={level} />
        <button
          type="button"
          onClick={onSendDictation}
          aria-label="Enviar mensaje de voz"
          className="pressable grid place-items-center size-10 rounded-full bg-accent-fill text-white shrink-0"
        >
          <ArrowUp className="size-5" strokeWidth={2.6} />
        </button>
      </div>
    )
  }

  const action = phase === 'thinking' ? 'stop' : has ? 'send' : 'voice'
  return (
    <div data-liquid="off" className="asst-composer flex items-end gap-1 rounded-[26px] p-1.5 pl-1.5">
      {voiceOk && (
        <button
          type="button"
          onClick={onDictate}
          disabled={phase !== 'idle' || blocked}
          aria-label="Dictar por voz"
          title="Dictar"
          className="liquid-press grid place-items-center size-10 rounded-full text-ink-2 hover:text-ink shrink-0 disabled:opacity-40"
        >
          <Mic className="size-[20px]" strokeWidth={2.2} />
        </button>
      )}
      <textarea
        ref={field}
        data-autofocus
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="send"
        placeholder={hasMessages ? 'Responde o pide otra cosa' : 'Pregunta o pide lo que quieras'}
        aria-label="Mensaje para el asistente"
        className={cx(
          'flex-1 min-w-0 block resize-none bg-transparent outline-none py-[0.6rem] text-[1.0625rem] leading-[1.38] text-ink placeholder:text-ink-3',
          !voiceOk && 'pl-3',
        )}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {action === 'stop' ? (
          <motion.button
            key="stop"
            type="button"
            onClick={onStop}
            aria-label="Parar"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.bouncy}
            className="grid place-items-center size-10 rounded-full bg-ink text-canvas shrink-0"
          >
            <Square className="size-3.5 fill-current" />
          </motion.button>
        ) : action === 'send' ? (
          <motion.button
            key="send"
            type="button"
            onClick={onSend}
            disabled={blocked}
            aria-label="Enviar"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.bouncy}
            className="glass-tinted pressable grid place-items-center size-10 rounded-full text-white shrink-0 disabled:opacity-40"
          >
            <ArrowUp className="size-5" strokeWidth={2.6} />
          </motion.button>
        ) : voiceOk ? (
          <motion.button
            key="voice"
            type="button"
            onClick={onVoiceMode}
            disabled={blocked}
            aria-label="Modo voz"
            title="Modo voz: hablar con el asistente"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.bouncy}
            className="glass-tinted pressable grid place-items-center size-10 rounded-full text-white shrink-0 disabled:opacity-40"
          >
            <AudioLines className="size-5" strokeWidth={2.3} />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function Wave({ level }: { level: number }) {
  // Barras que siguen el volumen: se ve que el micro te está oyendo.
  return (
    <span className="flex-1 flex items-center justify-center gap-[3px] h-6" aria-hidden>
      {[0.5, 0.75, 1, 0.8, 0.55, 0.7, 0.95, 0.7, 0.5, 0.8, 0.6].map((k, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-accent transition-[height] duration-100"
          style={{ height: `${Math.max(4, Math.min(24, 4 + level * 40 * k))}px` }}
        />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Bienvenida
// ---------------------------------------------------------------------------

function greeting(name: string): string {
  const h = new Date().getHours()
  const base = h < 6 ? 'Hola' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
  return name ? `${base}, ${name}` : base
}

function Welcome({
  name,
  free,
  freeAllowed,
  onMode,
  onPick,
}: {
  name: string
  free: boolean
  freeAllowed: boolean
  onMode: (free: boolean) => void
  onPick: (s: (typeof SUGGESTIONS)[number]) => void
}) {
  return (
    <div className="flex flex-col items-center text-center gap-5 sm:gap-6 py-4 sm:py-6">
      <span className="asst-orb size-14 sm:size-16 asst-in" aria-hidden />
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[1.625rem] sm:text-[1.75rem] font-bold tracking-[-0.02em] leading-tight">{greeting(name)}</h3>
        <p className="text-[0.9375rem] sm:text-[1rem] text-ink-2 max-w-[36ch]">
          {free
            ? 'Charla libre: pregúntame lo que quieras. Aquí no veo tu curso ni toco nada de la app.'
            : 'Dime qué apunto, pregúntame por tu curso o pídeme un plan. También puedes hablarme.'}
        </p>
      </div>
      {freeAllowed && <ModeSwitch free={free} onChange={onMode} />}
      {!free && (
        <div className="w-full grid grid-cols-2 gap-2.5 max-w-[560px]">
          {SUGGESTIONS.slice(0, 4).map((s, i) => {
            const Icon = s.icon
            return (
              <button
                key={s.title}
                type="button"
                onClick={() => onPick(s)}
                style={{ animationDelay: `${80 + i * 50}ms` }}
                className="asst-chip asst-in pressable flex items-center sm:flex-col sm:items-start gap-2.5 sm:gap-2 rounded-[18px] sm:rounded-[20px] px-3 py-2.5 sm:p-3.5 text-left"
              >
                <Icon className="size-[18px] text-accent shrink-0" strokeWidth={2.2} />
                <span className="text-[0.875rem] sm:text-[0.9375rem] leading-snug text-ink">{s.title}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => onPick(SUGGESTIONS[4])}
            className="col-span-2 asst-chip asst-in pressable flex items-center justify-center gap-2 rounded-full h-11 px-3 text-[0.875rem] sm:text-[0.9375rem] text-ink-2"
            style={{ animationDelay: '300ms' }}
          >
            <Sparkle className="size-4 text-accent" strokeWidth={2.2} />
            Prueba: «examen de Historia el jueves»
          </button>
        </div>
      )}
    </div>
  )
}

/** Curso (con tus datos) o charla libre (cualquier tema, sin tus datos). */
function ModeSwitch({ free, onChange }: { free: boolean; onChange: (free: boolean) => void }) {
  const options = [
    { free: false, label: 'Con mi curso' },
    { free: true, label: 'Charla libre' },
  ]
  return (
    <div role="radiogroup" aria-label="Modo del asistente" className="segmented grid grid-cols-2 p-[3px] rounded-full text-[0.875rem] font-semibold">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={free === option.free}
          onClick={() => onChange(option.free)}
          className={cx('pressable px-4 h-9 rounded-full transition-colors duration-200', free === option.free ? 'lens text-ink' : 'text-ink-3')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preferencias en el dispositivo
// ---------------------------------------------------------------------------

const FREE_KEY = 'bachillerato-os:assistant-free'
const SIDE_KEY = 'bachillerato-os:assistant-side'

function readFreeAllowed(account: string): boolean {
  if (!account) return false
  try {
    return localStorage.getItem(`${FREE_KEY}:${account}`) === '1'
  } catch {
    return false
  }
}

function writeFreeAllowed(account: string, allowed: boolean) {
  try {
    if (allowed) localStorage.setItem(`${FREE_KEY}:${account}`, '1')
    else localStorage.removeItem(`${FREE_KEY}:${account}`)
  } catch {
    // Sin almacenamiento: se vuelve a preguntar al abrir.
  }
}

function readSide(): boolean {
  try {
    return localStorage.getItem(SIDE_KEY) !== '0'
  } catch {
    return true
  }
}

function writeSide(open: boolean) {
  try {
    localStorage.setItem(SIDE_KEY, open ? '1' : '0')
  } catch {
    // Sin almacenamiento: se queda como está hasta cerrar.
  }
}
