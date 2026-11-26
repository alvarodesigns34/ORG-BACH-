import { m as motion } from 'motion/react'
import { ArrowUp, Mic, Square, X } from 'lucide-react'

import { spring } from '@/ui/motion'

export type VoiceState = 'starting' | 'listening' | 'thinking' | 'speaking' | 'error'

const STATUS: Record<VoiceState, string> = {
  starting: 'Un segundo…',
  listening: 'Te escucho',
  thinking: 'Pensando…',
  speaking: 'Hablando',
  error: 'No ha salido bien',
}

const HINT: Record<VoiceState, string> = {
  starting: '',
  listening: 'Habla con normalidad; cuando pares, lo envío solo.',
  thinking: '',
  speaking: 'Toca para cortar y hablar tú.',
  error: 'Toca el micro para intentarlo otra vez.',
}

/**
 * Modo voz: una conversación hablada, manos libres, como el modo voz de
 * ChatGPT. Escucha, envía al callarte, responde en voz alta y vuelve a
 * escuchar. Lo que se hace en la app queda igual en la conversación escrita.
 */
export function VoiceMode({
  state,
  level,
  heard,
  reply,
  seconds,
  onPrimary,
  onClose,
}: {
  state: VoiceState
  level: number
  heard: string
  reply: string
  seconds: number
  /** Botón central: enviar ya / cortar la voz / reintentar. */
  onPrimary: () => void
  onClose: () => void
}) {
  const listening = state === 'listening'
  const scale = listening ? 1 + Math.min(0.45, level * 0.9) : state === 'speaking' ? 1.06 : 1
  return (
    <motion.div
      className="asst-voice absolute inset-0 z-30 flex flex-col items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      role="dialog"
      aria-label="Modo voz"
    >
      <div className="w-full flex items-center justify-between px-5 pt-5">
        <span className="text-[0.8125rem] font-semibold text-white/60 tabular-nums">
          {listening ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''}
        </span>
        <span className="text-[0.8125rem] font-semibold text-white/60">Modo voz</span>
        <span className="w-8" />
      </div>

      <div className="flex-1 w-full flex flex-col items-center justify-center gap-10 px-8">
        <div className="relative size-44 sm:size-52">
          {state === 'speaking' && (
            <>
              <span className="asst-voice-ring" />
              <span className="asst-voice-ring" />
              <span className="asst-voice-ring" />
            </>
          )}
          <motion.span
            className="absolute inset-0"
            animate={{ scale }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, mass: 0.6 }}
          >
            <span className={state === 'thinking' || state === 'starting' ? 'asst-orb asst-orb-think block size-full' : 'asst-orb block size-full'} />
          </motion.span>
        </div>
        <div className="flex flex-col items-center gap-3 text-center max-w-[34ch] min-h-[7.5rem]" aria-live="polite">
          <p className="text-[1.375rem] font-semibold tracking-[-0.01em]">{STATUS[state]}</p>
          {state === 'speaking' || state === 'error' ? (
            <p className="text-[1rem] leading-[1.45] text-white/75 line-clamp-4">{reply}</p>
          ) : heard && state === 'thinking' ? (
            <p className="text-[1rem] leading-[1.45] text-white/60 italic line-clamp-3">«{heard}»</p>
          ) : (
            <p className="text-[0.9375rem] text-white/55">{HINT[state]}</p>
          )}
        </div>
      </div>

      <div className="w-full flex items-center justify-center gap-10 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-4">
        <motion.button
          type="button"
          onClick={onClose}
          aria-label="Salir del modo voz"
          whileTap={{ scale: 0.88 }}
          transition={spring.snappy}
          className="asst-voice-btn grid place-items-center size-16 rounded-full"
        >
          <X className="size-7" strokeWidth={2.3} />
        </motion.button>
        <motion.button
          type="button"
          onClick={onPrimary}
          disabled={state === 'thinking' || state === 'starting'}
          aria-label={
            listening ? 'Enviar ya' : state === 'speaking' ? 'Cortar y hablar' : 'Volver a escuchar'
          }
          whileTap={{ scale: 0.88 }}
          transition={spring.snappy}
          className="grid place-items-center size-16 rounded-full bg-white text-[#0b0d12] disabled:opacity-40 shadow-[0_10px_30px_-8px_rgb(255_255_255/0.4)]"
        >
          {listening ? (
            <ArrowUp className="size-7" strokeWidth={2.6} />
          ) : state === 'speaking' ? (
            <Square className="size-5 fill-current" />
          ) : (
            <Mic className="size-7" strokeWidth={2.3} />
          )}
        </motion.button>
      </div>
    </motion.div>
  )
}
