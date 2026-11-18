import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import {
  ArrowUp,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  CircleCheck,
  History,
  GraduationCap,
  ListChecks,
  ListTree,
  Mic,
  Pencil,
  Plane,
  RotateCcw,
  Sparkle,
  SquarePen,
  Target,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'

import {
  applyAssistantActions,
  applyUndo,
  buildContext,
  flightHref,
  isEmptyPlan,
  planUndo,
  type AppliedKind,
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
  saveConversations,
  shouldStartFresh,
  startNew,
  updateCurrent,
  type ChatMessage,
  type Conversation,
  type ConversationStore,
} from '@/assistant/conversation'
import { newId } from '@/domain/id'
import { hrefFor } from '@/router'
import { useStore } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { Modal } from '@/ui/Modal'
import { Button, IconButton, cx } from '@/ui/primitives'

type Phase = 'idle' | 'recording' | 'thinking'

const NO_MESSAGES: ChatMessage[] = []

const SUGGESTIONS: { group: string; items: string[] }[] = [
  {
    group: 'Apuntar',
    items: [
      'Examen de Biología el jueves, entra el tema 3',
      'He sacado un 8 en Física, valía un 40 %',
      'Ejercicios 4 y 5 de Mates para mañana',
      'Ponme 45 min de Mates con lluvia',
    ],
  },
  {
    group: 'Preguntar',
    items: [
      '¿Qué tengo esta semana?',
      '¿Qué nota necesito en Mates para sacar un 7?',
      'Hazme un plan de repaso para mi próximo examen',
      '¿Cuánto he estudiado esta semana?',
    ],
  },
]

const ICONS: Record<AppliedKind, typeof ListChecks> = {
  tarea: ListChecks,
  completada: CircleCheck,
  reabierta: RotateCcw,
  examen: CalendarDays,
  nota: GraduationCap,
  evento: CalendarDays,
  asignatura: BookOpen,
  editada: Pencil,
  borrada: Trash2,
  subtareas: ListTree,
  objetivo: Target,
  vuelo: Plane,
}

const LABELS: Record<AppliedKind, string> = {
  tarea: 'Tarea',
  completada: 'Completada',
  reabierta: 'Reabierta',
  examen: 'Examen',
  nota: 'Nota',
  evento: 'Evento',
  asignatura: 'Asignatura',
  editada: 'Cambiado',
  borrada: 'Borrado',
  subtareas: 'Pasos',
  objetivo: 'Objetivo',
  vuelo: 'Vuelo',
}

type Input = { text?: string; audio?: { data: string; mimeType: string } }

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
 * en el historial para retomarlas.
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

  const latest = useRef(data)
  latest.current = data

  const [store, setStore] = useState<ConversationStore>(() =>
    account ? loadConversations(account, () => newId('chat')) : EMPTY_STORE,
  )
  const current = currentConversation(store)
  const messages = current?.messages ?? NO_MESSAGES
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Charla libre: solo si el servidor la permite a esta cuenta. La respuesta
  // se recuerda para que el interruptor no aparezca de golpe al abrir.
  const [freeAllowed, setFreeAllowed] = useState(() => readFreeAllowed(account))
  /** Modo de la próxima conversación nueva (la abierta manda si la hay). */
  const [nextMode, setNextMode] = useState<'libre' | undefined>()
  const freeMode = (current ? current.mode : nextMode) === 'libre' && freeAllowed
  const modeRef = useRef(nextMode)
  modeRef.current = nextMode

  /** Cambia los mensajes de la conversación abierta (la crea si es nueva). */
  const setMessages = useCallback(
    (next: ChatMessage[] | ((list: ChatMessage[]) => ChatMessage[])) =>
      setStore((store) =>
        updateCurrent(store, next, () => newId('chat'), Date.now(), modeRef.current),
      ),
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
  const [showHistory, setShowHistory] = useState(false)

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
  const end = useRef<HTMLDivElement>(null)

  // Al cerrar: se corta cualquier grabación o petición en curso.
  useEffect(() => {
    if (open) return
    recording.current?.cancel()
    recording.current = null
    pending.current?.abort()
    pending.current = null
    setPhase('idle')
    setReview(null)
  }, [open])

  useEffect(() => () => { pending.current?.abort() }, [account])

  // Al abrir: si la conversación abierta lleva un rato parada, empieza una
  // nueva (la anterior queda en el historial).
  const wasOpen = useRef(false)
  useLayoutEffect(() => {
    if (open && !wasOpen.current && shouldStartFresh(store)) {
      // Conversación nueva, y en el modo normal: la charla libre se elige.
      setStore(startNew)
      setNextMode(undefined)
    }
    if (open && !wasOpen.current) setShowHistory(false)
    wasOpen.current = open
  }, [open])

  // Siempre a la vista lo último de la conversación.
  useLayoutEffect(() => {
    if (!open) return
    end.current?.scrollIntoView({
      block: 'end',
      behavior: messages.length > 1 ? 'smooth' : 'auto',
    })
  }, [open, messages.length, phase])

  // Onda y cronómetro mientras se graba; corte automático al llegar al tope.
  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    let frame = 0
    const tick = () => {
      const ms = Date.now() - started
      setElapsed(ms)
      setLevel(recording.current?.level() ?? 0)
      if (ms >= MAX_RECORDING_MS) {
        void stopAndSend()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // El campo de texto crece con lo escrito, hasta unas cinco líneas.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  const patchMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const commit = (answer: AssistantReply, result = applyAssistantActions(latest.current, answer.actions, today)) => {
    const plan = planUndo(latest.current, result.data)
    if (!isEmptyPlan(plan) && !replaceAndSave(result.data)) {
      throw new Error('Los cambios no se pudieron guardar. Tu curso actual sigue abierto.')
    }
    setMessages((list) => [...list, {
      id: newId('msg'),
      role: 'assistant',
      text: answer.reply || (result.applied.length ? 'Hecho.' : 'No he encontrado ningún cambio que aplicar.'),
      at: Date.now(),
      applied: result.applied,
      skipped: result.skipped,
      undo: isEmptyPlan(plan) ? null : plan,
    }])
    if (result.flight) {
      onClose()
      window.location.hash = flightHref(result.flight).slice(1)
    }
  }

  const send = async (input: Input) => {
    if (pending.current || (review && review.account === account)) return
    lastInput.current = input
    const userId = newId('msg')
    const history = historyForModel(messagesRef.current)
    setMessages((list) => [
      ...list,
      {
        id: userId,
        role: 'user',
        text: input.text ?? '',
        voice: !!input.audio,
        at: Date.now(),
      },
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
      const result = applyAssistantActions(current, answer.actions, today)
      const protectedAction = answer.actions.some(({ type }) =>
        type.startsWith('delete_') || type === 'update_exam' || type === 'update_grade',
      )
      if (result.applied.length > 1 || (result.applied.length > 0 && protectedAction)) {
        setReview({ answer, start: current, account, items: result.applied.map((item) => item.text) })
      } else {
        commit(answer, result)
      }
    } catch (e) {
      if (controller.signal.aborted) return
      patchMessage(userId, {
        failed: true,
        text: input.text ?? 'Mensaje de voz',
      })
      setMessages((list) => [
        ...list,
        {
          id: newId('msg'),
          role: 'assistant',
          error: true,
          text: e instanceof Error ? e.message : String(e),
          at: Date.now(),
        },
      ])
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

  const startVoice = async () => {
    try {
      recording.current = await startRecording()
      setElapsed(0)
      setPhase('recording')
    } catch {
      setMessages((list) => [
        ...list,
        {
          id: newId('msg'),
          role: 'assistant',
          error: true,
          text: 'No tengo acceso al micrófono. Dale permiso en los ajustes del navegador o escríbemelo.',
          at: Date.now(),
        },
      ])
    }
  }

  // Abierto desde el botón del micrófono: empieza a dictar directamente.
  const startedFor = useRef(0)
  useEffect(() => {
    if (!open || !start || start.at === startedFor.current) return
    startedFor.current = start.at
    if (start.mode === 'voice' && canRecord() && phase === 'idle' && !review) {
      setShowHistory(false)
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
    setPhase('idle')
    try {
      const audio = await rec.stop()
      if (audio.ms < 600) return // Un toque sin querer: no se manda nada.
      await send({ audio: { data: audio.data, mimeType: audio.mimeType } })
    } catch {
      setMessages((list) => [
        ...list,
        {
          id: newId('msg'),
          role: 'assistant',
          error: true,
          text: 'No se pudo grabar el audio.',
          at: Date.now(),
        },
      ])
    }
  }

  const undo = (message: ChatMessage) => {
    if (!message.undo || message.undone) return
    if (replaceAndSave(applyUndo(latest.current, message.undo))) patchMessage(message.id, { undone: true })
  }

  const stopEverything = () => {
    pending.current?.abort()
    recording.current?.cancel()
    recording.current = null
    setPhase('idle')
    setReview(null)
    lastInput.current = null
  }

  const setFreeMode = (on: boolean) => {
    if (on === freeMode) return
    stopEverything()
    // Cada conversación es de un modo: cambiarlo empieza otra.
    setStore(startNew)
    setNextMode(on ? 'libre' : undefined)
    setShowHistory(false)
    field.current?.focus()
  }

  const newConversation = () => {
    stopEverything()
    setStore(startNew)
    setShowHistory(false)
    setText('')
    field.current?.focus()
  }

  const resume = (id: string) => {
    if (id !== store.currentId) stopEverything()
    setStore((current) => openConversation(current, id))
    setShowHistory(false)
  }

  const remove = (id: string) => {
    if (id === store.currentId) stopEverything()
    setStore((current) => deleteConversation(current, id))
  }

  const pendingReview = review?.account === account ? review : null
  const reviewChanges = () => {
    if (!pendingReview) return
    const current = latest.current
    const result = applyAssistantActions(current, pendingReview.answer.actions, today)
    const items = result.applied.map((item) => item.text)
    if (pendingReview.start !== current && JSON.stringify(items) !== JSON.stringify(pendingReview.items)) {
      setReview({ ...pendingReview, start: current, items })
      return
    }
    try {
      commit(pendingReview.answer, result)
      setReview(null)
    } catch (error) {
      setMessages((list) => [...list, { id: newId('msg'), role: 'assistant', error: true, at: Date.now(), text: String(error) }])
    }
  }

  const seconds = Math.floor(elapsed / 1000)
  const lastFailed = messages.at(-1)?.error === true

  if (!signedIn) {
    return (
      <Modal open={open} onClose={onClose} title="Asistente" size="sm">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <span className="grid place-items-center size-16 rounded-full bg-accent-quiet text-accent">
            <Sparkle className="size-7" strokeWidth={1.9} />
          </span>
          <p className="text-[0.9375rem] text-ink-2 max-w-[32ch]">
            Dile qué apuntar o pregúntale por tu curso, y lo hace por ti. Para usarlo, inicia sesión
            en Ajustes: la IA trabaja en el servidor.
          </p>
          <Button
            variant="primary"
            onClick={() => (
              onClose(),
              (window.location.hash = hrefFor('ajustes', {
                seccion: 'cuenta',
              }).slice(1))
            )}
          >
            Ir a Ajustes
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Asistente"
      size="md"
      description={
        freeMode
          ? 'Charla libre: el asistente solo recibe esta conversación, no los datos de tu curso.'
          : 'Al enviar, el asistente recibe tu mensaje y el contexto necesario de tu curso.'
      }
      headerAction={
        <div className="flex items-center gap-2">
          {store.conversations.length > 0 && (
            <IconButton
              label={showHistory ? 'Volver a la conversación' : 'Conversaciones anteriores'}
              size="sm"
              variant="secondary"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? (
                <ChevronLeft className="size-[18px]" strokeWidth={2.4} />
              ) : (
                <History className="size-[17px]" strokeWidth={2.2} />
              )}
            </IconButton>
          )}
          {(messages.length > 0 || showHistory) && (
            <IconButton
              label="Nueva conversación"
              size="sm"
              variant="secondary"
              onClick={newConversation}
            >
              <SquarePen className="size-[17px]" strokeWidth={2.2} />
            </IconButton>
          )}
        </div>
      }
      footer={
        <div className="w-full">
          {phase === 'recording' ? (
            <div className="glass-btn flex items-center gap-2 h-12 rounded-full pl-1.5 pr-1.5">
              <IconButton label="Cancelar" size="sm" variant="ghost" onClick={cancelVoice}>
                <X className="size-5 text-ink-2" strokeWidth={2.4} />
              </IconButton>
              <span className="size-2 rounded-full bg-danger animate-pulse shrink-0" aria-hidden />
              <span className="text-[0.9375rem] tabular-nums text-ink-2 w-10" aria-live="off">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </span>
              <Wave level={level} />
              <button
                type="button"
                onClick={() => void stopAndSend()}
                aria-label="Enviar mensaje de voz"
                className="pressable grid place-items-center size-9 rounded-full bg-accent-fill text-white shrink-0"
              >
                <ArrowUp className="size-5" strokeWidth={2.6} />
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={field}
                  data-autofocus
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={messages.length ? 'Responde o pide otra cosa…' : 'Escribe o dicta…'}
                  aria-label="Mensaje para el asistente"
                  className="glass-btn block w-full resize-none rounded-[24px] pl-4 pr-12 py-[0.75rem] text-[1rem] leading-[1.4] text-ink placeholder:text-ink-3 outline-none"
                />
                <button
                  type="button"
                  onClick={submitText}
                  aria-label="Enviar"
                  disabled={!text.trim() || phase === 'thinking' || !!pendingReview}
                  className={cx(
                    'pressable absolute right-1.5 bottom-1.5 grid place-items-center size-9 rounded-full bg-accent-fill text-white',
                    'transition-[opacity,transform] duration-200',
                    text.trim()
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-75 pointer-events-none',
                    phase === 'thinking' && 'opacity-40',
                  )}
                >
                  <ArrowUp className="size-5" strokeWidth={2.6} />
                </button>
              </div>
              {canRecord() && (
                <button
                  type="button"
                  onClick={() => void startVoice()}
                  disabled={phase === 'thinking' || !!pendingReview}
                  aria-label="Dictar por voz"
                  className="glass-tinted pressable grid place-items-center size-12 rounded-full text-white shrink-0 disabled:opacity-50"
                >
                  <Mic className="size-[22px]" strokeWidth={2.3} />
                </button>
              )}
            </div>
          )}
        </div>
      }
    >
      {showHistory ? (
        <HistoryList
          conversations={store.conversations}
          currentId={store.currentId}
          onOpen={resume}
          onDelete={remove}
        />
      ) : (
      <div className="flex flex-col gap-3 min-h-[46dvh]" aria-live="polite">
        {freeAllowed && (
          <ModeSwitch free={freeMode} onChange={setFreeMode} disabled={phase === 'recording'} />
        )}
        {messages.length === 0 ? (
          freeMode ? <FreeWelcome /> : <Welcome onPick={(t) => void send({ text: t })} />
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} onUndo={() => undo(m)} />)
        )}

        {pendingReview && (
          <section className="rounded-2xl border border-hairline bg-raised p-4" aria-labelledby="revision-asistente">
            <h3 id="revision-asistente" className="font-semibold">Revisa los cambios propuestos</h3>
            {pendingReview.items.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 ps-4 text-sm text-ink-2">
                {pendingReview.items.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-2">Ya no hay cambios aplicables en tu curso.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setReview(null)}>Descartar</Button>
              <Button size="sm" variant="primary" onClick={reviewChanges} disabled={!pendingReview.items.length}>Aplicar cambios</Button>
            </div>
          </section>
        )}

        {phase === 'thinking' && (
          <div className="self-start flex items-center gap-1.5 rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-3.5 bubble-in origin-bottom-left">
            <span className="sr-only">Pensando…</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                style={{ '--i': i } as CSSProperties}
                className="size-2 rounded-full bg-ink-3 animate-typing"
              />
            ))}
          </div>
        )}

        {lastFailed && lastInput.current && phase === 'idle' && (
          <Button size="sm" onClick={retry} className="self-start">
            <RotateCcw className="size-4" />
            Reintentar
          </Button>
        )}
        <div ref={end} />
      </div>
      )}
    </Modal>
  )
}

const FREE_KEY = 'bachillerato-os:assistant-free'

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

/** Curso (con tus datos) o charla libre (cualquier tema, sin tus datos). */
function ModeSwitch({
  free,
  onChange,
  disabled,
}: {
  free: boolean
  onChange: (free: boolean) => void
  disabled?: boolean
}) {
  const options = [
    { free: false, label: 'Mi curso' },
    { free: true, label: 'Charla libre' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Modo del asistente"
      className="self-center grid grid-cols-2 p-[3px] rounded-full bg-fill text-[0.875rem] font-semibold"
    >
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={free === option.free}
          disabled={disabled}
          onClick={() => onChange(option.free)}
          className={cx(
            'pressable px-4 h-9 rounded-full transition-colors duration-200',
            free === option.free ? 'lens text-ink' : 'text-ink-3',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function FreeWelcome() {
  return (
    <div className="flex items-center gap-3 pt-1 animate-fade">
      <span className="grid place-items-center size-11 rounded-full bg-accent-quiet text-accent shrink-0">
        <Sparkle className="size-5" strokeWidth={1.9} />
      </span>
      <p className="text-[0.9375rem] text-ink-2">
        Pregúntame lo que quieras, de cualquier tema. En este modo no veo tus tareas, exámenes ni
        notas, y no cambio nada en la app.
      </p>
    </div>
  )
}

const dayFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

function when(at: number, now = Date.now()): string {
  const date = new Date(at)
  const today = new Date(now)
  const yesterday = new Date(now - 86_400_000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(date, today)) return `Hoy, ${timeFormat.format(date)}`
  if (same(date, yesterday)) return `Ayer, ${timeFormat.format(date)}`
  return dayFormat.format(date)
}

/** Conversaciones guardadas en este dispositivo, la más reciente arriba. */
function HistoryList({
  conversations,
  currentId,
  onOpen,
  onDelete,
}: {
  conversations: Conversation[]
  currentId: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2 min-h-[46dvh] animate-fade">
      <p className="text-[0.75rem] font-semibold text-ink-3 px-1">
        Conversaciones anteriores · se guardan solo en este dispositivo
      </p>
      <ul className="flex flex-col gap-1.5">
        {conversations.map((c) => {
          const replies = c.messages.filter((m) => m.role === 'user').length
          return (
            <li key={c.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                aria-current={c.id === currentId ? 'true' : undefined}
                className={cx(
                  'pressable flex-1 min-w-0 text-left rounded-[16px] px-3.5 py-2.5',
                  c.id === currentId ? 'bg-accent-quiet' : 'bg-fill',
                )}
              >
                <span className="block text-[0.9375rem] text-ink truncate">{conversationTitle(c)}</span>
                <span className="block text-[0.75rem] text-ink-3 tabular-nums">
                  {c.mode === 'libre' && 'Charla libre · '}
                  {when(c.updatedAt)} · {replies} {replies === 1 ? 'mensaje' : 'mensajes'}
                </span>
              </button>
              {confirming === c.id ? (
                <Button
                  size="sm"
                  variant="dangerFill"
                  onClick={() => {
                    setConfirming(null)
                    onDelete(c.id)
                  }}
                >
                  Borrar
                </Button>
              ) : (
                <IconButton
                  label="Borrar conversación"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(c.id)}
                >
                  <Trash2 className="size-[17px] text-ink-3" strokeWidth={2.2} />
                </IconButton>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-5 pt-1 animate-fade">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center size-11 rounded-full bg-accent-quiet text-accent shrink-0">
          <Sparkle className="size-5" strokeWidth={1.9} />
        </span>
        <p className="text-[0.9375rem] text-ink-2">
          Dime qué apuntar o pregúntame por tu curso. Puedes seguir hablando del mismo tema:
          «muévelo al viernes», «era un 7».
        </p>
      </div>
      {SUGGESTIONS.map((group) => (
        <div key={group.group}>
          <p className="text-[0.75rem] font-semibold text-ink-3 mb-2 px-1">{group.group}</p>
          <div className="flex flex-col items-start gap-2">
            {group.items.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onPick(item)}
                className="pressable text-left rounded-[16px] bg-fill px-3.5 py-2.5 text-[0.875rem] text-ink-2"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Bubble({ message: m, onUndo }: { message: ChatMessage; onUndo: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="self-end max-w-[85%] flex flex-col items-end gap-1 bubble-in origin-bottom-right">
        <p
          className={cx(
            'bubble-me rounded-[20px] rounded-br-[6px] px-4 py-2.5 text-[1rem] text-white whitespace-pre-line break-words',
            m.failed && 'opacity-60',
          )}
        >
          {m.voice && (
            <Mic className="inline size-3.5 -mt-0.5 mr-1.5 opacity-80" aria-label="Por voz" />
          )}
          {m.text || 'Mensaje de voz…'}
        </p>
      </div>
    )
  }

  if (m.error) {
    return (
      <p
        role="alert"
        className="self-start max-w-[90%] flex gap-2 rounded-[20px] rounded-bl-[6px] bg-danger-quiet px-4 py-2.5 text-[0.9375rem] text-danger animate-rise"
      >
        <TriangleAlert className="size-4 shrink-0 mt-[3px]" />
        {m.text}
      </p>
    )
  }

  const applied = m.applied ?? []
  return (
    <div className="self-start w-full max-w-[92%] flex flex-col gap-2 bubble-in origin-bottom-left">
      <p className="self-start rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-2.5 text-[1rem] text-ink whitespace-pre-line break-words">
        {m.text}
      </p>

      {applied.length > 0 && (
        <div className={cx('card overflow-hidden transition-opacity', m.undone && 'opacity-55')}>
          <ul>
            {applied.map((item, i) => {
              const Icon = ICONS[item.kind] ?? ListChecks
              return (
                <li
                  key={i}
                  className={cx(
                    'flex items-center gap-3 px-3.5 py-2.5',
                    i > 0 && 'inset-separator',
                  )}
                >
                  <span
                    className={cx(
                      'grid place-items-center size-7 rounded-full shrink-0',
                      item.kind === 'borrada'
                        ? 'bg-danger-quiet text-danger'
                        : 'bg-ok-quiet text-ok',
                    )}
                  >
                    <Icon className="size-[15px]" strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.6875rem] font-semibold text-ink-3 uppercase tracking-[0.04em]">
                      {LABELS[item.kind] ?? 'Hecho'}
                    </span>
                    <span
                      className={cx(
                        'block text-[0.875rem] text-ink line-clamp-2',
                        m.undone && 'line-through',
                      )}
                    >
                      {item.text}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          {m.undo && (
            <div className="inset-separator-wide flex items-center justify-between px-3.5 py-1.5">
              <span className="text-[0.75rem] text-ink-3">
                {m.undone ? 'Deshecho' : 'Ya está en la app'}
              </span>
              {!m.undone && (
                <button
                  type="button"
                  onClick={onUndo}
                  className="pressable h-8 px-2 -mr-2 rounded-full text-[0.8125rem] font-semibold text-accent"
                >
                  Deshacer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {(m.skipped ?? []).length > 0 && (
        <ul className="flex flex-col gap-1 px-1">
          {m.skipped!.map((s, i) => (
            <li key={i} className="flex gap-2 text-[0.8125rem] text-warn">
              <TriangleAlert className="size-4 shrink-0 mt-0.5" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Wave({ level }: { level: number }) {
  // Cinco barras que siguen el volumen: se ve que el micro te está oyendo.
  return (
    <span className="flex-1 flex items-center justify-center gap-[3px] h-6" aria-hidden>
      {[0.55, 0.8, 1, 0.8, 0.55, 0.7, 0.9, 0.7].map((k, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-accent transition-[height] duration-100"
          style={{
            height: `${Math.max(4, Math.min(24, 4 + level * 40 * k))}px`,
          }}
        />
      ))}
    </span>
  )
}
