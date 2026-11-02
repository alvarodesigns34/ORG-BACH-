/**
 * Voz y llamada al asistente.
 *
 * Se graba con MediaRecorder, se convierte a WAV de 16 kHz mono y se manda a
 * Voxtral (Mistral), que lo entiende directamente: no hace falta un paso de
 * transcripción aparte. Funciona igual en iPhone (graba MP4/AAC) que en
 * Chrome (WebM/Opus).
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

/** Formato que acepta el navegador y su tipo MIME, por si no se puede pasar a WAV. */
function pickFormat(): { recorder?: string; fallbackMime: string } {
  const candidates: [string, string][] = [
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/webm', 'audio/webm'],
    ['audio/mp4', 'audio/m4a'],
    ['audio/aac', 'audio/aac'],
    ['audio/ogg;codecs=opus', 'audio/ogg'],
  ]
  for (const [recorder, mime] of candidates) {
    if (MediaRecorder.isTypeSupported?.(recorder)) return { recorder, fallbackMime: mime }
  }
  // Safari antiguo no implementa isTypeSupported: graba MP4 por defecto.
  return { fallbackMime: 'audio/m4a' }
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
            const ms = Date.now() - startedAt
            // Mistral recomienda WAV: se convierte aquí, venga el audio del
            // iPhone (MP4/AAC) o de Chrome (WebM/Opus). Si el navegador no
            // sabe decodificar su propia grabación, se manda tal cual.
            const wav = await toWav16k(blob).catch(() => null)
            resolve(
              wav
                ? { data: await toBase64(wav), mimeType: 'audio/wav', ms }
                : { data: await toBase64(blob), mimeType: format.fallbackMime, ms },
            )
          } catch (error) {
            reject(error)
          }
        }
        if (recorder.state !== 'inactive') recorder.stop()
      })
    },
  }
}

/** Frecuencia de muestreo del WAV enviado: de sobra para voz, y ligero. */
const WAV_RATE = 16_000

/** Decodifica la grabación y la reescribe como WAV PCM de 16 bits, mono, 16 kHz. */
async function toWav16k(blob: Blob): Promise<Blob> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const context = new Ctx()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.max(1, Math.ceil(decoded.duration * WAV_RATE))
    const offline = new OfflineAudioContext(1, frames, WAV_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), WAV_RATE)
  } finally {
    void context.close().catch(() => {})
  }
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true) // tamaño del bloque fmt
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // bytes por segundo
  view.setUint16(32, 2, true) // bytes por muestra
  view.setUint16(34, 16, true) // bits por muestra
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
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
  /** Lo que la IA ha entendido del audio, para que el alumno lo compruebe. */
  heard: string
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
    heard: body.heard ?? '',
    actions: Array.isArray(body.actions) ? body.actions : [],
    remaining: body.remaining,
  }
}
