import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  BookOpen,
  CalendarDays,
  Check,
  CircleCheck,
  Copy,
  GraduationCap,
  ListChecks,
  ListTree,
  Mic,
  Pencil,
  Plane,
  RotateCcw,
  Square,
  Target,
  Trash2,
  TriangleAlert,
  Volume2,
} from 'lucide-react'

import type { AppliedKind } from '@/assistant/actions'
import type { ChatMessage } from '@/assistant/conversation'
import { cx } from '@/ui/primitives'

import { canSpeak, speak } from './speech'

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

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

/** Párrafos y listas «• » del texto plano que devuelve el modelo. */
export function blocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*(?:•|-|\*)\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      const last = out.at(-1)
      if (last?.kind === 'ul') last.items.push(bullet[1])
      else out.push({ kind: 'ul', items: [bullet[1]] })
    } else if (!line.trim()) {
      flush()
    } else {
      para.push(line)
    }
  }
  flush()
  return out
}

/** Texto con párrafos y viñetas; si es nuevo, aparece palabra a palabra. */
function RichText({ text, reveal }: { text: string; reveal: boolean }) {
  let w = 0
  const words = (s: string): ReactNode =>
    reveal
      ? s.split(/(\s+)/).map((part, i) =>
          /^\s+$/.test(part) || !part ? (
            part
          ) : (
            <span key={i} className="asst-word" style={{ '--w': w++ } as CSSProperties}>
              {part}
            </span>
          ),
        )
      : s
  return (
    <div className="flex flex-col gap-2.5 text-[1.0625rem] leading-[1.5] text-ink break-words">
      {blocks(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} className="whitespace-pre-line">
            {words(b.text)}
          </p>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5">
            {b.items.map((item, j) => (
              <li key={j} className="relative pl-5">
                <span aria-hidden className="absolute left-1 top-[0.68em] size-[6px] rounded-full bg-accent/70" />
                {words(item)}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

export function UserBubble({ message: m }: { message: ChatMessage }) {
  return (
    <div className="self-end max-w-[82%] asst-in origin-bottom-right">
      <p
        className={cx(
          'asst-me rounded-[22px] rounded-br-[8px] px-4 py-2.5 text-[1.0625rem] leading-[1.42] text-white whitespace-pre-line break-words',
          m.failed && 'opacity-55',
        )}
      >
        {m.voice && <Mic className="inline size-3.5 -mt-0.5 mr-1.5 opacity-80" aria-label="Por voz" />}
        {m.text || 'Mensaje de voz…'}
      </p>
    </div>
  )
}

export function ErrorMessage({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  return (
    <div role="alert" className="self-start max-w-[92%] asst-in origin-bottom-left flex flex-col items-start gap-2">
      <p className="flex gap-2 text-[0.9375rem] text-danger">
        <TriangleAlert className="size-4 shrink-0 mt-[3px]" />
        {message.text}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="glass-btn pressable inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[0.8125rem] font-semibold text-ink"
        >
          <RotateCcw className="size-4" strokeWidth={2.3} />
          Reintentar
        </button>
      )}
    </div>
  )
}

export function AssistantMessage({
  message: m,
  fresh,
  last,
  onUndo,
}: {
  message: ChatMessage
  /** Recién llegada: se revela palabra a palabra. */
  fresh: boolean
  /** La última de la conversación: sus acciones se ven siempre. */
  last: boolean
  onUndo: () => void
}) {
  const applied = m.applied ?? []
  return (
    <div className={cx('group self-stretch flex flex-col gap-2.5', fresh && 'animate-fade')}>
      <RichText text={m.text} reveal={fresh} />

      {applied.length > 0 && (
        <div className={cx('asst-card rounded-[20px] overflow-hidden transition-opacity max-w-[560px] asst-in', m.undone && 'opacity-55')}>
          <ul>
            {applied.map((item, i) => {
              const Icon = ICONS[item.kind] ?? ListChecks
              return (
                <li key={i} className={cx('flex items-center gap-3 px-3.5 py-2.5', i > 0 && 'inset-separator')}>
                  <span
                    className={cx(
                      'grid place-items-center size-8 rounded-full shrink-0',
                      item.kind === 'borrada' ? 'bg-danger-quiet text-danger' : 'bg-ok-quiet text-ok',
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.6875rem] font-semibold text-ink-3 uppercase tracking-[0.04em]">
                      {LABELS[item.kind] ?? 'Hecho'}
                    </span>
                    <span className={cx('block text-[0.9375rem] text-ink line-clamp-2', m.undone && 'line-through')}>
                      {item.text}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          {m.undo && (
            <div className="inset-separator-wide flex items-center justify-between px-3.5 py-1.5">
              <span className="text-[0.75rem] text-ink-3">{m.undone ? 'Deshecho' : 'Ya está en la app'}</span>
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
        <ul className="flex flex-col gap-1">
          {m.skipped!.map((s, i) => (
            <li key={i} className="flex gap-2 text-[0.875rem] text-warn">
              <TriangleAlert className="size-4 shrink-0 mt-0.5" />
              {s}
            </li>
          ))}
        </ul>
      )}

      <MessageTools text={m.text} visible={last} />
    </div>
  )
}

/** Copiar y leer en voz alta. Siempre en la última; en las demás, al pasar por encima. */
function MessageTools({ text, visible }: { text: string; visible: boolean }) {
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState<null | (() => void)>(null)
  const stopRef = useRef<null | (() => void)>(null)
  stopRef.current = speaking
  useEffect(() => () => stopRef.current?.(), [])
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Sin permiso de portapapeles: no pasa nada.
    }
  }
  const read = () => {
    if (speaking) {
      speaking()
      setSpeaking(null)
      return
    }
    const stop = speak(text, () => setSpeaking(null))
    setSpeaking(() => stop)
  }
  const tool =
    'liquid-press grid place-items-center size-8 rounded-full text-ink-3 hover:text-ink hover:bg-fill transition-colors'
  return (
    <div
      className={cx(
        '-ml-1.5 flex items-center gap-0.5 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <button type="button" onClick={() => void copy()} aria-label={copied ? 'Copiado' : 'Copiar'} title="Copiar" className={tool}>
        {copied ? <Check className="size-4 text-ok" strokeWidth={2.4} /> : <Copy className="size-[15px]" strokeWidth={2.1} />}
      </button>
      {canSpeak() && (
        <button
          type="button"
          onClick={read}
          aria-label={speaking ? 'Parar la lectura' : 'Leer en voz alta'}
          title={speaking ? 'Parar' : 'Leer en voz alta'}
          className={tool}
        >
          {speaking ? <Square className="size-3.5 fill-current" /> : <Volume2 className="size-4" strokeWidth={2.1} />}
        </button>
      )}
    </div>
  )
}

const SLOW = ['Pensando…', 'Mirando tu curso…', 'Un momento, que lo miro bien…']

/** «Pensando»: el orbe respira y el texto cambia si tarda. */
export function Thinking() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const a = window.setTimeout(() => setStep(1), 2600)
    const b = window.setTimeout(() => setStep(2), 7000)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  return (
    <div className="self-start flex items-center gap-2.5 py-1 animate-fade" role="status">
      <span className="asst-orb asst-orb-think size-[18px] shrink-0" aria-hidden />
      <span key={step} className="asst-shimmer text-[0.9375rem] font-medium animate-fade">
        {SLOW[step]}
      </span>
    </div>
  )
}

const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

export function stamp(at: number, now = Date.now()): string {
  const date = new Date(at)
  const today = new Date(now)
  const yesterday = new Date(now - 86_400_000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(date, today)) return `Hoy, ${timeFormat.format(date)}`
  if (same(date, yesterday)) return `Ayer, ${timeFormat.format(date)}`
  const day = dayFormat.format(date)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${timeFormat.format(date)}`
}

/** Hora entre mensajes, como en Mensajes: al empezar y tras una pausa larga. */
export function DayStamp({ at }: { at: number }) {
  return <p className="self-center text-[0.75rem] font-medium text-ink-3 tabular-nums py-1">{stamp(at)}</p>
}
