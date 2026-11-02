import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUp,
  BookOpen,
  CalendarDays,
  CircleCheck,
  CircleX,
  GraduationCap,
  ListChecks,
  Mic,
  Square,
  Timer,
  TriangleAlert,
} from 'lucide-react'

import {
  applyAssistantActions,
  applyUndo,
  buildContext,
  planUndo,
  type AppliedItem,
  type UndoPlan,
} from '@/assistant/actions'
import {
  askAssistant,
  canRecord,
  MAX_RECORDING_MS,
  startRecording,
  type Recording,
} from '@/assistant/client'
import { hrefFor } from '@/router'
import { useStore } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { Modal } from '@/ui/Modal'
import { Button, cx } from '@/ui/primitives'

type Phase = 'idle' | 'recording' | 'thinking' | 'done' | 'error'

const EXAMPLES = [
  'Añade «ejercicios del tema 4» para hoy',
  'Examen de Biología el jueves',
  'He sacado un 8 en el examen de Física, vale un 40 %',
  'He estudiado una hora de Historia',
]

const ICONS: Record<AppliedItem['kind'], typeof ListChecks> = {
  tarea: ListChecks,
  completada: CircleCheck,
  examen: CalendarDays,
  nota: GraduationCap,
  evento: CalendarDays,
  asignatura: BookOpen,
  estudio: Timer,
}

const LABELS: Record<AppliedItem['kind'], string> = {
  tarea: 'Tarea',
  completada: 'Completada',
  examen: 'Examen',
  nota: 'Nota',
  evento: 'Evento',
  asignatura: 'Asignatura',
  estudio: 'Estudio',
}

/**
 * Asistente: dices o escribes lo que quieres apuntar y la app lo hace.
 *
 * La IA solo propone acciones; se aplican con la misma lógica que la
 * interfaz y se pueden deshacer de golpe. Nada se guarda si no se entiende.
 */
export function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, today, replaceAndSave } = useStore()
  const sync = useSync()
  const latest = useRef(data)
  latest.current = data

  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [reply, setReply] = useState('')
  const [applied, setApplied] = useState<AppliedItem[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<UndoPlan | null>(null)
  const [undone, setUndone] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const recording = useRef<Recording | null>(null)

  const signedIn = !!sync.email

  const reset = () => {
    setPhase('idle')
    setReply('')
    setApplied([])
    setSkipped([])
    setError(null)
    setUndo(null)
    setUndone(false)
    setText('')
  }

  // Al cerrar: se corta cualquier grabación y se vuelve al principio.
  useEffect(() => {
    if (open) return
    recording.current?.cancel()
    recording.current = null
    const id = setTimeout(reset, 300)
    return () => clearTimeout(id)
  }, [open])

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

  const run = async (input: { text?: string; audio?: { data: string; mimeType: string } }) => {
    setPhase('thinking')
    setError(null)
    try {
      const before = latest.current
      const answer = await askAssistant({ ...input, context: buildContext(before, today) })
      // Se aplica sobre el estado MÁS reciente: pudo cambiar mientras pensaba.
      const current = latest.current
      const result = applyAssistantActions(current, answer.actions, today)
      if (result.applied.length > 0) {
        replaceAndSave(result.data)
        setUndo(planUndo(current, result.data))
      }
      setReply(
        answer.reply ||
          (result.applied.length > 0 ? 'Hecho.' : 'No he encontrado nada que apuntar.'),
      )
      setApplied(result.applied)
      setSkipped(result.skipped)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const startVoice = async () => {
    setError(null)
    try {
      recording.current = await startRecording()
      setElapsed(0)
      setPhase('recording')
    } catch {
      setError(
        'No tengo acceso al micrófono. Dale permiso en los ajustes del navegador o escríbelo.',
      )
      setPhase('error')
    }
  }

  const stopAndSend = async () => {
    const rec = recording.current
    recording.current = null
    if (!rec) return
    try {
      const audio = await rec.stop()
      if (audio.ms < 600) {
        setError('No te he oído. Mantén el micro un poco más y habla.')
        setPhase('error')
        return
      }
      await run({ audio: { data: audio.data, mimeType: audio.mimeType } })
    } catch {
      setError('No se pudo grabar el audio.')
      setPhase('error')
    }
  }

  const submitText = (event: FormEvent) => {
    event.preventDefault()
    if (text.trim()) void run({ text: text.trim() })
  }

  const doUndo = () => {
    if (!undo) return
    replaceAndSave(applyUndo(latest.current, undo))
    setUndone(true)
  }

  const seconds = Math.floor(elapsed / 1000)

  return (
    <Modal open={open} onClose={onClose} title="Asistente" size="sm">
      {!signedIn ? (
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <span className="grid place-items-center size-16 rounded-full bg-accent-quiet text-accent">
            <Mic className="size-7" />
          </span>
          <p className="text-[0.9375rem] text-ink-2 max-w-[32ch]">
            Dile qué apuntar y lo hace por ti. Para usarlo, inicia sesión en Ajustes: la IA trabaja
            en el servidor.
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
      ) : phase === 'done' ? (
        <div className="flex flex-col gap-4">
          <p className="self-start max-w-[90%] rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-2.5 text-[0.9375rem] text-ink">
            {reply}
          </p>

          {applied.length > 0 && (
            <ul className={cx('card overflow-hidden', undone && 'opacity-50')}>
              {applied.map((item, i) => {
                const Icon = ICONS[item.kind]
                return (
                  <li
                    key={i}
                    className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'inset-separator')}
                  >
                    <span className="grid place-items-center size-8 rounded-full bg-ok-quiet text-ok shrink-0">
                      <Icon className="size-4" strokeWidth={2.3} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.75rem] font-semibold text-ink-3">
                        {LABELS[item.kind]}
                      </span>
                      <span
                        className={cx(
                          'block text-[0.9375rem] text-ink truncate',
                          undone && 'line-through',
                        )}
                      >
                        {item.text}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {skipped.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {skipped.map((s, i) => (
                <li key={i} className="flex gap-2 text-[0.8125rem] text-warn">
                  <TriangleAlert className="size-4 shrink-0 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            {undo && !undone && <Button onClick={doUndo}>Deshacer</Button>}
            <Button variant="primary" onClick={reset} className="ml-auto">
              <Mic className="size-4" />
              Otra cosa
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 pt-2">
          {/* --- Micrófono --- */}
          <div className="relative grid place-items-center size-40">
            {phase === 'recording' && (
              <>
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-danger/15 transition-transform duration-100"
                  style={{ transform: `scale(${0.72 + level * 0.5})` }}
                />
                <span
                  aria-hidden
                  className="absolute inset-3 rounded-full bg-danger/20 animate-ping [animation-duration:1.6s]"
                />
              </>
            )}
            {phase === 'thinking' && (
              <span
                aria-hidden
                className="absolute inset-4 rounded-full border-[3px] border-accent/25 border-t-accent animate-spin"
              />
            )}
            <button
              type="button"
              disabled={phase === 'thinking' || !canRecord()}
              onClick={() => (phase === 'recording' ? void stopAndSend() : void startVoice())}
              aria-label={phase === 'recording' ? 'Terminar y enviar' : 'Hablar'}
              className={cx(
                'pressable relative grid place-items-center size-24 rounded-full text-white',
                'shadow-[0_12px_32px_rgb(0_0_0/0.18)] disabled:opacity-60',
                phase === 'recording' ? 'bg-danger' : 'bg-accent-fill',
              )}
            >
              {phase === 'recording' ? (
                <Square className="size-8 fill-current" />
              ) : (
                <Mic className="size-10" strokeWidth={2.2} />
              )}
            </button>
          </div>

          <p className="text-[0.9375rem] text-ink-2 text-center min-h-[1.5em]" aria-live="polite">
            {phase === 'recording'
              ? `Te escucho… ${seconds}s · toca para enviar`
              : phase === 'thinking'
                ? 'Pensando…'
                : canRecord()
                  ? 'Toca y dime qué apuntar'
                  : 'Escríbeme qué apuntar'}
          </p>

          {phase === 'error' && error && (
            <p
              role="alert"
              className="flex gap-2 text-[0.875rem] text-danger bg-danger-quiet rounded-[14px] px-3.5 py-2.5 w-full"
            >
              <CircleX className="size-4 shrink-0 mt-0.5" />
              {error}
            </p>
          )}

          {/* --- Texto --- */}
          <form onSubmit={submitText} className="relative w-full">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase === 'thinking' || phase === 'recording'}
              placeholder="O escríbelo aquí…"
              aria-label="Escribe lo que quieres apuntar"
              className="w-full h-12 rounded-full bg-fill pl-4 pr-12 text-[1rem] text-ink placeholder:text-ink-3 outline-none focus:ring-4 focus:ring-accent/15"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!text.trim() || phase === 'thinking'}
              className="pressable absolute right-1.5 top-1.5 grid place-items-center size-9 rounded-full bg-accent-fill text-white disabled:opacity-35"
            >
              <ArrowUp className="size-5" strokeWidth={2.6} />
            </button>
          </form>

          {phase === 'idle' && (
            <div className="w-full">
              <p className="text-[0.75rem] font-semibold text-ink-3 mb-2 px-1">Por ejemplo</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setText(example)}
                    className="pressable text-left rounded-[14px] bg-fill px-3 py-2 text-[0.8125rem] text-ink-2"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
