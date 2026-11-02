/**
 * Voz y llamada al asistente.
 *
 * Se graba el audio tal cual (MediaRecorder) y se manda a Gemini, que lo
 * entiende directamente: no hace falta un paso de transcripción aparte, y
 * funciona igual en iPhone (graba MP4/AAC) que en Chrome (WebM/Opus).
 */

import { SUPABASE_KEY, SUPABASE_URL } from '../sync/config.ts'
import { syncEngine } from '../sync/engine.ts'
import type { AssistantAction } from './actions.ts'

const ASSISTANT_URL = `${SUPABASE_URL}/functions/v1/assistant`
/** Tope de una grabación: más que suficiente para dictar varias cosas. */
export const MAX_RECORDING_MS = 45_000

export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

/** Formato que acepta el navegador y nombre que entiende Gemini. */
function pickFormat(): { recorder?: string; gemini: string } {
  const candidates: [string, string][] = [
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/webm', 'audio/webm'],
    ['audio/mp4', 'audio/m4a'],
    ['audio/aac', 'audio/aac'],
    ['audio/ogg;codecs=opus', 'audio/ogg'],
  ]
  for (const [recorder, gemini] of candidates) {
    if (MediaRecorder.isTypeSupported?.(recorder)) return { recorder, gemini }
  }
  // Safari antiguo no implementa isTypeSupported: graba MP4 por defecto.
  return { gemini: 'audio/m4a' }
}

export interface Recording {
  stop(): Promise<{ data: string; mimeType: string; ms: number }>
  cancel(): void
  /** Nivel de entrada 0–1, para animar la onda. */
  level(): number
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  })
  const format = pickFormat()
  const recorder = new MediaRecorder(
    stream,
    format.recorder ? { mimeType: format.recorder } : undefined,
  )
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  const startedAt = Date.now()
  recorder.start()

  // Medidor de nivel (opcional: si falla, la onda simplemente no se mueve).
  let analyser: AnalyserNode | null = null
  let context: AudioContext | null = null
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    context = new Ctx()
    analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
  } catch {
    analyser = null
  }
  const buffer = new Uint8Array(512)

  const release = () => {
    stream.getTracks().forEach((t) => t.stop())
    void context?.close().catch(() => {})
  }

  return {
    level() {
      if (!analyser) return 0
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (const v of buffer) {
        const x = (v - 128) / 128
        sum += x * x
      }
      return Math.min(1, Math.sqrt(sum / buffer.length) * 4)
    },
    cancel() {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            const type = recorder.mimeType || format.recorder || 'audio/mp4'
            const blob = new Blob(chunks, { type })
            resolve({
              data: await toBase64(blob),
              mimeType: format.gemini,
              ms: Date.now() - startedAt,
            })
          } catch (error) {
            reject(error)
          }
        }
        if (recorder.state !== 'inactive') recorder.stop()
      })
    },
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export interface AssistantReply {
  reply: string
  actions: AssistantAction[]
  remaining?: number
}

export async function askAssistant(input: {
  text?: string
  audio?: { data: string; mimeType: string }
  context: unknown
}): Promise<AssistantReply> {
  const token = await syncEngine.accessToken()
  if (!token) throw new Error('Inicia sesión en Ajustes para usar el asistente.')
  let res: Response
  try {
    res = await fetch(ASSISTANT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Sin conexión. El asistente necesita internet.')
  }
  const body = (await res.json().catch(() => ({}))) as Partial<AssistantReply> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? 'No se pudo hablar con la IA.')
  return {
    reply: body.reply ?? '',
    actions: Array.isArray(body.actions) ? body.actions : [],
    remaining: body.remaining,
  }
}
