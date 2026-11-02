import {
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
  CircleCheck,
  GraduationCap,
  ListChecks,
  ListTree,
  Mic,
  Pencil,
  RotateCcw,
  Sparkles,
  SquarePen,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'

import {
  applyAssistantActions,
  applyUndo,
  buildContext,
  isEmptyPlan,
  planUndo,
  type AppliedKind,
} from '@/assistant/actions'
import {
  askAssistant,
  canRecord,
  MAX_RECORDING_MS,
  startRecording,
  type Recording,
} from '@/assistant/client'
import {
  historyForModel,
  loadConversation,
  saveConversation,
  type ChatMessage,
} from '@/assistant/conversation'
import { newId } from '@/domain/id'
import { hrefFor } from '@/router'
import { useStore } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { Modal } from '@/ui/Modal'
import { Button, IconButton, cx } from '@/ui/primitives'

type Phase = 'idle' | 'recording' | 'thinking'

const SUGGESTIONS: { group: string; items: string[] }[] = [
  {
    group: 'Apuntar',
    items: [
      'Examen de Biología el jueves, entra el tema 3',
      'He sacado un 8 en Física, valía un 40 %',
      'Ejercicios 4 y 5 de Mates para mañana',
    ],
  },
  {
    group: 'Preguntar',
    items: [
      '¿Qué tengo esta semana?',
      '¿Qué nota necesito en Mates para sacar un 7?',
      'Hazme un plan de repaso para mi próximo examen',
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
  estudio: Timer,
  editada: Pencil,
  borrada: Trash2,
  subtareas: ListTree,
  objetivo: Target,
}

const LABELS: Record<AppliedKind, string> = {
  tarea: 'Tarea',
  completada: 'Completada',
  reabierta: 'Reabierta',
  examen: 'Examen',
  nota: 'Nota',
  evento: 'Evento',
  asignatura: 'Asignatura',
  estudio: 'Estudio',
  editada: 'Cambiado',
  borrada: 'Borrado',
  subtareas: 'Pasos',
  objetivo: 'Objetivo',
}

type Input = { text?: string; audio?: { data: string; mimeType: string } }

/**
 * Asistente: una conversación. Dices o escribes lo que quieres y la app lo
 * hace, o te responde con tus propios datos; y puedes seguir hablando del
 * mismo tema («muévelo al viernes») sin empezar de cero.
 *
 * La IA solo propone acciones; se aplican con la misma lógica que la interfaz
 * y cada respuesta se puede deshacer por separado. La charla se guarda en el
 * dispositivo hasta que empiezas una nueva.
 */
export function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, today, replaceAndSave } = useStore()
  const sync = useSync()
  const account = sync.email ?? ''
  const signedIn = !!sync.email

  const latest = useRef(data)
  latest.current = data

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    account ? loadConversation(account) : [],
  )
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const [loadedFor, setLoadedFor] = useState(account)
  if (loadedFor !== account) {
    // Cambio de cuenta: cada una tiene su propia conversación.
    setLoadedFor(account)
    setMessages(account ? loadConversation(account) : [])
  }
  useEffect(() => {
    if (account) saveConversation(account, messages)
  }, [account, messages])

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

  const send = async (input: Input) => {
    if (phase === 'thinking') return
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
        context: buildContext(latest.current, today),
        history,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      // Se aplica sobre el estado MÁS reciente: pudo cambiar mientras pensaba.
      const current = latest.current
      const result = applyAssistantActions(current, answer.actions, today)
      const plan = planUndo(current, result.data)
      if (!isEmptyPlan(plan)) replaceAndSave(result.data)
      setMessages((list) => [
        ...list.map((m) =>
          m.id === userId && input.audio ? { ...m, text: answer.heard || 'Mensaje de voz' } : m,
        ),
        {
          id: newId('msg'),
          role: 'assistant',
          text:
            answer.reply ||
            (result.applied.length > 0 ? 'Hecho.' : 'No he encontrado nada que hacer con eso.'),
          at: Date.now(),
          applied: result.applied,
          skipped: result.skipped,
          undo: isEmptyPlan(plan) ? null : plan,
        },
      ])
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
      if (pending.current === controller) pending.current = null
      setPhase('idle')
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
    replaceAndSave(applyUndo(latest.current, message.undo))
    patchMessage(message.id, { undone: true })
  }

  const newConversation = () => {
    pending.current?.abort()
    recording.current?.cancel()
    recording.current = null
    setPhase('idle')
    setMessages([])
    setText('')
    field.current?.focus()
  }

  const seconds = Math.floor(elapsed / 1000)
  const lastFailed = messages.at(-1)?.error === true

  if (!signedIn) {
    return (
      <Modal open={open} onClose={onClose} title="Asistente" size="sm">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <span className="grid place-items-center size-16 rounded-full bg-accent-quiet text-accent">
            <Sparkles className="size-7" />
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
      headerAction={
        messages.length > 0 && (
          <IconButton
            label="Nueva conversación"
            size="sm"
            variant="secondary"
            onClick={newConversation}
          >
            <SquarePen className="size-[17px]" strokeWidth={2.2} />
          </IconButton>
        )
      }
      footer={
        <div className="w-full">
          {phase === 'recording' ? (
            <div className="flex items-center gap-2 h-12 rounded-full bg-fill pl-1.5 pr-1.5">
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
                  className="block w-full resize-none rounded-[22px] bg-fill pl-4 pr-12 py-[0.7rem] text-[1rem] leading-[1.4] text-ink placeholder:text-ink-3 outline-none focus:ring-4 focus:ring-accent/15"
                />
                <button
                  type="button"
                  onClick={submitText}
                  aria-label="Enviar"
                  disabled={!text.trim() || phase === 'thinking'}
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
                  disabled={phase === 'thinking'}
                  aria-label="Dictar por voz"
                  className="pressable grid place-items-center size-12 rounded-full bg-accent-fill text-white shrink-0 shadow-[0_6px_18px_rgb(0_0_0/0.14)] disabled:opacity-50"
                >
                  <Mic className="size-[22px]" strokeWidth={2.3} />
                </button>
              )}
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 min-h-[46dvh]" aria-live="polite">
        {messages.length === 0 ? (
          <Welcome onPick={(t) => void send({ text: t })} />
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} onUndo={() => undo(m)} />)
        )}

        {phase === 'thinking' && (
          <div className="self-start flex items-center gap-1.5 rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-3.5 animate-fade">
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
    </Modal>
  )
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-5 pt-1 animate-fade">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center size-11 rounded-full bg-accent-quiet text-accent shrink-0">
          <Sparkles className="size-5" />
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
      <div className="self-end max-w-[85%] flex flex-col items-end gap-1 animate-rise">
        <p
          className={cx(
            'rounded-[20px] rounded-br-[6px] bg-accent-fill px-4 py-2.5 text-[0.9375rem] text-white whitespace-pre-line break-words',
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
    <div className="self-start w-full max-w-[92%] flex flex-col gap-2 animate-rise">
      <p className="self-start rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-2.5 text-[0.9375rem] text-ink whitespace-pre-line break-words">
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
