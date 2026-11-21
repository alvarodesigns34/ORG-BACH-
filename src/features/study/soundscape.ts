/**
 * Ambientes sonoros del modo estudio.
 *
 * Son grabaciones reales (de dominio público; autores en `SOUND_CREDITS`),
 * preparadas para sonar bien en los altavoces del iPad: tramos limpios de
 * voces y ruidos ajenos, bucles sin costura de 2 a 3 minutos, el mismo
 * volumen percibido en todos y los graves reforzados con armónicos para que
 * el trueno o el motor se oigan aunque el altavoz no llegue a esas
 * frecuencias. Se descargan la primera vez que se usan (2–3 MB cada uno) y
 * quedan en caché para usarlos sin conexión.
 *
 * Los ruidos marrón y rosa se generan aquí: son ruido puro, no hay nada que
 * grabar. También las ondas (ver «Ondas»), que suenan por encima del ambiente.
 *
 * Cambiar de ambiente funde uno en otro. Safari solo permite arrancar el
 * audio dentro de un toque: `unlockAudio()` en el gesto.
 *
 * Además del ambiente, aquí viven los avisos de megafonía (una grabación real
 * de cabina) y el audio «portador»: un `<audio>` mudo en bucle que le da al
 * sistema algo que enseñar en la pantalla de bloqueo (ver `mediaSession.ts`).
 */

export type SoundId =
  | 'cabina'
  | 'lluvia'
  | 'tormenta'
  | 'olas'
  | 'viento'
  | 'chimenea'
  | 'marron'
  | 'rosa'

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: 'cabina', label: 'Cabina' },
  { id: 'lluvia', label: 'Lluvia' },
  { id: 'tormenta', label: 'Tormenta' },
  { id: 'olas', label: 'Olas' },
  { id: 'viento', label: 'Viento' },
  { id: 'chimenea', label: 'Chimenea' },
  { id: 'marron', label: 'Ruido marrón' },
  { id: 'rosa', label: 'Ruido rosa' },
]

let ctx: AudioContext | null = null
let master: GainNode | null = null
let current: { id: SoundId; gain: GainNode; stop: () => void } | null = null
/** Ambiente pedido (puede estar aún descargándose). */
let wanted: SoundId | null = null
let volume = 0.7

function context(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = volumeGain(volume)
  master.connect(limiter(ctx)).connect(ctx.destination)
  watchInterruptions(ctx)
  return ctx
}

/**
 * En iPad el audio se «interrumpe» al cambiar de app, bloquear la pantalla o
 * recibir una llamada, y no vuelve solo. Al volver a la app se reanuda; si
 * Safari exige un toque, el primero que haya lo reanuda.
 */
function watchInterruptions(c: AudioContext) {
  const revive = () => {
    if ((current || wanted || carrierWanted) && c.state !== 'running' && c.state !== 'closed') {
      void c.resume().catch(() => {})
    }
    if (carrierWanted && carrier?.paused) void carrier.play().catch(() => {})
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revive()
  })
  window.addEventListener('pageshow', revive)
  window.addEventListener('pointerdown', revive, { capture: true, passive: true })
  c.addEventListener('statechange', () => {
    if (document.visibilityState === 'visible') revive()
  })
}

/**
 * Limitador al final: deja subir el nivel sin que ningún pico (un trueno, la
 * cresta de una ola) sature. Rápido y casi sin rodilla, como el de un móvil.
 */
function limiter(c: BaseAudioContext): DynamicsCompressorNode {
  const l = c.createDynamicsCompressor()
  l.threshold.value = -6
  l.knee.value = 2
  l.ratio.value = 20
  l.attack.value = 0.003
  l.release.value = 0.25
  return l
}

/**
 * Del control (0–1) a ganancia: curva como la del volumen de iOS, que sube
 * despacio abajo y deja margen arriba. Al 70 % suena a nivel de conversación
 * en los altavoces del iPad; al máximo, con fuerza pero sin saturar.
 */
function volumeGain(v: number): number {
  return 1.5 * Math.pow(Math.min(1, Math.max(0, v)), 1.6)
}

export function unlockAudio(): void {
  ignoreSilentSwitch()
  const c = context()
  if (c && c.state === 'suspended') void c.resume()
}

/**
 * Cómo convive el audio de la app con el resto del sistema (iPhone y iPad):
 *
 * - `playback`: como una app de música. Suena aunque el interruptor esté en
 *   silencio, sigue con la pantalla bloqueada y aparece en la pantalla de
 *   bloqueo, pero corta lo que estuviera sonando en otras apps.
 * - `ambient`: se mezcla con la música de otras apps y respeta el modo
 *   silencio; se para al bloquear. Es lo correcto cuando eliges «Silencio»:
 *   los avisos suenan por encima de tu música en vez de pararla.
 */
export type AudioMode = 'playback' | 'ambient'
let audioMode: AudioMode = 'playback'

export function setAudioMode(mode: AudioMode): void {
  audioMode = mode
  applyAudioMode()
}

function applyAudioMode(): boolean {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return false
  try {
    session.type = audioMode
    return true
  } catch {
    return false
  }
}

let silentLoop: HTMLAudioElement | null = null

/**
 * En iPhone y iPad, el audio web es por defecto «de ambiente»: el modo
 * silencio lo apaga. Para estudiar con sonido, se pide la categoría de
 * reproducción (como una app de música):
 *
 * - Safari 16.4+: `navigator.audioSession.type = 'playback'`.
 * - Versiones anteriores: el truco conocido de reproducir en bucle un audio
 *   HTML silencioso, que cambia la sesión de audio de la página entera.
 *
 * Tiene que llamarse dentro de un toque.
 */
function ignoreSilentSwitch(): void {
  if (applyAudioMode() || audioMode !== 'playback') return
  if (silentLoop || !/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)) return
  silentLoop = new Audio(silentWav())
  silentLoop.loop = true
  silentLoop.setAttribute('playsinline', '')
  void silentLoop.play().catch(() => {
    silentLoop = null
  })
}

// ---------------------------------------------------------------------------
// Audio portador (pantalla de bloqueo)
// ---------------------------------------------------------------------------

let carrier: HTMLAudioElement | null = null
let carrierUrl: string | null = null
let carrierWanted = false
const carrierListeners = new Set<() => void>()

/**
 * El sistema solo enseña la tarjeta «Ahora suena» (pantalla de bloqueo,
 * Centro de control) si hay un elemento multimedia reproduciéndose; el
 * ambiente sale por Web Audio, que no cuenta. Este `<audio>` reproduce medio
 * minuto de silencio en bucle: no se oye, pero ancla la tarjeta y mantiene
 * viva la página con la pantalla bloqueada, que es lo que deja que la escala
 * termine y el aviso de aterrizaje suene a su hora.
 *
 * Tiene que arrancar dentro de un toque.
 */
export function startCarrier(): void {
  carrierWanted = true
  if (typeof Audio === 'undefined') return
  if (!carrier) {
    carrierUrl = URL.createObjectURL(new Blob([silentWavBytes(30)], { type: 'audio/wav' }))
    carrier = new Audio(carrierUrl)
    carrier.loop = true
    carrier.preload = 'auto'
    carrier.setAttribute('playsinline', '')
    carrier.addEventListener('playing', () => carrierListeners.forEach((fn) => fn()))
  }
  if (carrier.paused) void carrier.play().catch(() => {})
}

export function stopCarrier(): void {
  carrierWanted = false
  if (!carrier) return
  carrier.pause()
  try {
    carrier.currentTime = 0
  } catch {
    // Aún sin datos: no hay posición que reiniciar.
  }
}

export function carrierPlaying(): boolean {
  return !!carrier && !carrier.paused
}

/** Avisa cada vez que el portador empieza a sonar (también tras una interrupción). */
export function onCarrierPlaying(fn: () => void): () => void {
  carrierListeners.add(fn)
  return () => carrierListeners.delete(fn)
}

/** Silencio en WAV (8 kHz, 8 bits, mono). */
function silentWavBytes(seconds: number): Uint8Array<ArrayBuffer> {
  const samples = Math.floor(8000 * seconds)
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples))
  const view = new DataView(bytes.buffer)
  const text = (at: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  return bytes
}

/** Medio segundo de silencio, como data URI. */
function silentWav(): string {
  let binary = ''
  for (const b of silentWavBytes(0.5)) binary += String.fromCharCode(b)
  return `data:audio/wav;base64,${btoa(binary)}`
}

export function audioRunning(): boolean {
  return !!ctx && ctx.state === 'running'
}

// ---------------------------------------------------------------------------
// Grabaciones
// ---------------------------------------------------------------------------

type Recorded = Exclude<SoundId, 'marron' | 'rosa'>

/**
 * Cada archivo lleva medio segundo de margen a cada lado copiado del otro
 * extremo del bucle: aunque el decodificador AAC añada o quite su retardo
 * inicial, `loopStart`/`loopEnd` caen sobre audio continuo y no hay salto.
 */
const PAD = 0.5
const LOOP: Record<Recorded, number> = {
  cabina: 108.75,
  lluvia: 113.5,
  tormenta: 180.75,
  olas: 162.75,
  viento: 135.75,
  chimenea: 140.65,
}

export const SOUND_CREDITS: { id: Recorded; what: string; author: string }[] = [
  { id: 'cabina', what: 'Cabina de un Airbus A319 en vuelo', author: 'svenx' },
  { id: 'lluvia', what: 'Lluvia en el bosque de Sherwood', author: 'rcarlberg' },
  { id: 'tormenta', what: 'Tormenta de verano en el sur de Francia', author: 'Felix Blume' },
  { id: 'olas', what: 'Olas en Caleta Portales (Chile)', author: 'Felix Blume' },
  { id: 'viento', what: 'Viento fuerte entre árboles en Abbotsbury', author: 'Diva Contemporary' },
  { id: 'chimenea', what: 'Fuego crepitando en Dartington', author: 'TonyW' },
]

const decoded = new Map<Recorded, AudioBuffer>()
const pending = new Map<Recorded, Promise<AudioBuffer | null>>()

function soundUrl(id: Recorded) {
  return `${import.meta.env.BASE_URL}sounds/${id}.m4a`
}

function load(c: BaseAudioContext, id: Recorded): Promise<AudioBuffer | null> {
  const ready = decoded.get(id)
  if (ready) return Promise.resolve(ready)
  let p = pending.get(id)
  if (!p) {
    p = fetch(soundUrl(id))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.arrayBuffer()
      })
      .then(
        (data) =>
          // Forma con callbacks: la de promesa no existe en Safari antiguo.
          new Promise<AudioBuffer>((resolve, reject) => c.decodeAudioData(data, resolve, reject)),
      )
      .then((b) => {
        // Solo se guarda el decodificado de un contexto real (los de prueba
        // offline pueden tener otra frecuencia de muestreo).
        if (c === ctx) {
          // Un ambiente decodificado ocupa ~70 MB: se guardan como mucho dos.
          if (decoded.size >= 2) {
            for (const k of decoded.keys()) {
              if (k !== current?.id && k !== wanted) {
                decoded.delete(k)
                break
              }
            }
          }
          decoded.set(id, b)
        }
        return b
      })
      .catch(() => null)
      .finally(() => pending.delete(id))
    pending.set(id, p)
  }
  return p
}

/** Descarga y decodifica por adelantado (al elegir asiento) para que el ambiente entre a la vez que el despegue. */
export function preloadSound(id: SoundId | 'ninguno'): void {
  if (id === 'ninguno' || id === 'marron' || id === 'rosa') return
  const c = context()
  if (c) void load(c, id)
}

function playRecording(
  c: BaseAudioContext,
  b: AudioBuffer,
  id: Recorded,
  out: AudioNode,
  /** Posición en el archivo (s); por defecto, un punto al azar del bucle. */
  at?: number,
) {
  const src = c.createBufferSource()
  src.buffer = b
  src.loop = true
  const len = Math.min(LOOP[id], b.duration - 2 * PAD)
  src.loopStart = PAD
  src.loopEnd = PAD + len
  src.connect(out)
  // Cada vez desde un punto distinto: nunca se oye «el mismo principio».
  const from = at === undefined ? PAD + Math.random() * len : PAD + ((((at - PAD) % len) + len) % len)
  src.start(0, from)
  return () => stopNode(src)
}

// ---------------------------------------------------------------------------
// Ruido marrón (generado)
// ---------------------------------------------------------------------------

function brownInto(data: Float32Array, gain = 3.5) {
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * gain
  }
}

let brownBuffer: AudioBuffer | null = null

/** Ruido continuo que se repite sin costura: la cola se funde con el principio. */
function brown(c: BaseAudioContext, seconds = 9): AudioBuffer {
  if (brownBuffer && brownBuffer.sampleRate === c.sampleRate) return brownBuffer
  const rate = c.sampleRate
  const n = Math.floor(rate * seconds)
  const fade = Math.floor(rate * 0.5)
  const b = c.createBuffer(2, n, rate)
  for (let ch = 0; ch < 2; ch++) {
    const out = b.getChannelData(ch)
    const raw = new Float32Array(n + fade)
    brownInto(raw)
    for (let i = 0; i < n; i++) out[i] = raw[i]
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      out[i] = raw[n + i] * Math.cos((k * Math.PI) / 2) + raw[i] * Math.sin((k * Math.PI) / 2)
    }
  }
  if (c === ctx) brownBuffer = b
  return b
}

function playBrown(c: BaseAudioContext, out: AudioNode) {
  const src = c.createBufferSource()
  src.buffer = brown(c)
  src.loop = true
  src.start(0, Math.random() * src.buffer.duration)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  lp.Q.value = 0.5
  src.connect(lp).connect(out)
  return () => stopNode(src)
}

// ---------------------------------------------------------------------------
// Ruido rosa (generado)
// ---------------------------------------------------------------------------

/**
 * Ruido rosa por el filtro de Paul Kellet: la misma energía en cada octava.
 * Más brillante que el marrón (se parece a la lluvia constante o a una
 * cascada lejana) y menos áspero que el blanco.
 */
function pinkInto(data: Float32Array) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
}

let pinkBuffer: AudioBuffer | null = null

function pink(c: BaseAudioContext, seconds = 9): AudioBuffer {
  if (pinkBuffer && pinkBuffer.sampleRate === c.sampleRate) return pinkBuffer
  const rate = c.sampleRate
  const n = Math.floor(rate * seconds)
  const fade = Math.floor(rate * 0.5)
  const b = c.createBuffer(2, n, rate)
  for (let ch = 0; ch < 2; ch++) {
    const out = b.getChannelData(ch)
    const raw = new Float32Array(n + fade)
    pinkInto(raw)
    for (let i = 0; i < n; i++) out[i] = raw[i]
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      out[i] = raw[n + i] * Math.cos((k * Math.PI) / 2) + raw[i] * Math.sin((k * Math.PI) / 2)
    }
  }
  if (c === ctx) pinkBuffer = b
  return b
}

function playPink(c: BaseAudioContext, out: AudioNode) {
  const src = c.createBufferSource()
  src.buffer = pink(c)
  src.loop = true
  src.start(0, Math.random() * src.buffer.duration)
  // Se recortan los agudos más finos: en el altavoz del iPad sonarían a siseo.
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 7000
  lp.Q.value = 0.4
  src.connect(lp).connect(out)
  return () => stopNode(src)
}

// ---------------------------------------------------------------------------
// Ondas (generadas): capa que suena por encima del ambiente
// ---------------------------------------------------------------------------

import { WAVES, waveSpec, type WaveId, type WaveMode } from './waves'

export { WAVES, waveSpec, type WaveId, type WaveMode }

/**
 * Binaural: un tono puro en cada oído, separados `beat` Hz. La «onda» no
 * suena en el aire: la percibe el cerebro al juntar los dos oídos, así que
 * solo funciona con auriculares.
 */
function playBinaural(c: BaseAudioContext, id: WaveId, out: AudioNode) {
  const { beat, carrier } = waveSpec(id)
  const merger = c.createChannelMerger(2)
  const left = c.createOscillator()
  const right = c.createOscillator()
  left.frequency.value = carrier - beat / 2
  right.frequency.value = carrier + beat / 2
  left.connect(merger, 0, 0)
  right.connect(merger, 0, 1)
  merger.connect(out)
  left.start()
  right.start()
  return () => {
    stopNode(left)
    stopNode(right)
    merger.disconnect()
  }
}

/** De un seno (-1…1) a pulsos suaves (0…1): sube y baja sin chasquidos. */
function pulseCurve(): Float32Array<ArrayBuffer> {
  const n = 1024
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.pow((x + 1) / 2, 2.2)
  }
  return curve
}

/**
 * Isocrónico: el tono se enciende y apaga `beat` veces por segundo. Se oye
 * como un latido claro y funciona también por el altavoz.
 */
function playIsochronic(c: BaseAudioContext, id: WaveId, out: AudioNode) {
  const { beat, carrier } = waveSpec(id)
  const tone = c.createOscillator()
  tone.frequency.value = carrier
  const amp = c.createGain()
  amp.gain.value = 0
  const lfo = c.createOscillator()
  lfo.frequency.value = beat
  const shaper = c.createWaveShaper()
  shaper.curve = pulseCurve()
  lfo.connect(shaper).connect(amp.gain)
  tone.connect(amp).connect(out)
  tone.start()
  lfo.start()
  return () => {
    stopNode(tone)
    stopNode(lfo)
    shaper.disconnect()
    amp.disconnect()
  }
}

/** Nivel de las ondas a intensidad máxima: siempre por debajo del ambiente. */
// Medido con renderWaves: a igual ganancia, el binaural (tono continuo) da
// ~1,75 veces el nivel eficaz del isocrónico (pulsos). Se igualan aquí.
const WAVE_TRIM: Record<WaveMode, number> = { isocronico: 0.22, binaural: 0.125 }

let waves: { key: string; gain: GainNode; stop: () => void; mode: WaveMode } | null = null
let waveLevel = 0.5

function waveGain(mode: WaveMode, level = waveLevel) {
  return WAVE_TRIM[mode] * Math.pow(Math.min(1, Math.max(0, level)), 1.5) * (ducked ? 0.15 : 1)
}

/** Pone a sonar (o cambia) la capa de ondas. Dentro de un toque, como el ambiente. */
export function playWaves(id: WaveId, mode: WaveMode, level = waveLevel): void {
  waveLevel = level
  const c = context()
  if (!c || !master) return
  const key = `${id}:${mode}`
  if (waves?.key === key) {
    setWaveLevel(level)
    return
  }
  stopWaves()
  const g = c.createGain()
  g.gain.value = 0
  g.connect(master)
  const halt = mode === 'binaural' ? playBinaural(c, id, g) : playIsochronic(c, id, g)
  const t = c.currentTime
  g.gain.setValueAtTime(0.0001, t)
  // Entrada lenta: un tono que aparece de golpe sobresalta.
  g.gain.setTargetAtTime(waveGain(mode), t, 0.6)
  waves = { key, gain: g, stop: halt, mode }
  notify()
}

export function stopWaves(): void {
  if (!waves) return
  const { gain: g, stop } = waves
  waves = null
  if (ctx) {
    const t = ctx.currentTime
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(g.gain.value, t)
    g.gain.linearRampToValueAtTime(0, t + FADE_OUT)
  }
  window.setTimeout(() => {
    stop()
    g.disconnect()
  }, FADE_OUT * 1000 + 100)
  notify()
}

export function setWaveLevel(level: number): void {
  waveLevel = Math.min(1, Math.max(0, level))
  if (!ctx || !waves) return
  const t = ctx.currentTime
  waves.gain.gain.cancelScheduledValues(t)
  waves.gain.gain.setValueAtTime(waves.gain.gain.value, t)
  waves.gain.gain.linearRampToValueAtTime(waveGain(waves.mode), t + 0.15)
}

export function playingWaves(): string | null {
  return waves?.key ?? null
}

function stopNode(node: AudioScheduledSourceNode) {
  try {
    node.stop()
  } catch {
    // Ya parado.
  }
  node.disconnect()
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/** Salida del ambiente anterior al cambiar: se cruza con la entrada del nuevo. */
const FADE_OUT = 0.8

/**
 * Ajuste de nivel por ambiente. Las grabaciones ya vienen igualadas (mitad
 * sonoridad completa, mitad lo que da un altavoz pequeño, que pierde los
 * graves por debajo de ~200 Hz); aquí solo se cuadra el conjunto y el ruido
 * marrón con ellas, para que cambiar de ambiente no dé saltos de volumen.
 */
const TRIM: Record<SoundId, number> = {
  cabina: 1.17,
  lluvia: 2.2,
  tormenta: 1.4,
  olas: 1.5,
  viento: 3.7,
  // El fuego es casi todo chasquidos: con menos nivel medio ya suena presente.
  chimenea: 1.5,
  marron: 0.82,
  rosa: 0.62,
}

type Listener = () => void
const listeners = new Set<Listener>()
/** Avisa cuando cambia qué ambiente suena o se está cargando. */
export function subscribeSound(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notify = () => listeners.forEach((fn) => fn())

/** El ambiente que se está descargando (para mostrarlo en el panel), o null. */
export function loadingSound(): SoundId | null {
  return wanted && current?.id !== wanted ? wanted : null
}

function start(c: AudioContext, id: SoundId, play: (out: AudioNode) => () => void) {
  if (!master) return
  fadeOutCurrent()
  const g = c.createGain()
  g.gain.value = 0
  g.connect(master)
  const halt = play(g)
  const t = c.currentTime
  // Entrada rápida pero suave (~0,7 s): curva exponencial, que el oído
  // percibe como inmediata, en vez de una rampa lineal larga que empieza
  // casi en silencio.
  g.gain.setValueAtTime(0.0001, t)
  g.gain.setTargetAtTime(TRIM[id] * (ducked ? 0.15 : 1), t, 0.18)
  current = { id, gain: g, stop: halt }
  notify()
}

/**
 * Arranque inmediato de una grabación aún no decodificada: se reproduce en
 * streaming con un `<audio>` conectado al mismo circuito (empieza en cuanto
 * llegan los primeros datos) y, cuando el búfer completo está listo, se pasa
 * a él con un fundido corto en el mismo punto. El búfer es el que permite el
 * bucle sin costura; el `<audio>` solo cubre esos primeros segundos.
 */
function playStreaming(c: AudioContext, id: Recorded, out: AudioNode): () => void {
  const len = LOOP[id]
  const startAt = PAD + Math.random() * len
  const el = new Audio()
  el.preload = 'auto'
  el.loop = true
  el.setAttribute('playsinline', '')
  el.src = `${soundUrl(id)}#t=${startAt.toFixed(2)}`
  const elGain = c.createGain()
  let srcNode: MediaElementAudioSourceNode | null = null
  try {
    srcNode = c.createMediaElementSource(el)
    srcNode.connect(elGain).connect(out)
    void el.play().catch(() => {
      // Sin gesto (p. ej. al despegar con retardo) Safari no deja: se espera al búfer.
      upgrade()
    })
  } catch {
    srcNode = null
  }
  let stopBuffer: (() => void) | null = null
  let done = false
  const release = () => {
    el.pause()
    el.removeAttribute('src')
    el.load()
    srcNode?.disconnect()
    elGain.disconnect()
  }
  // La descarga completa espera a que el streaming ya suene: si no, las dos
  // se reparten la conexión y el primer sonido tarda más.
  let upgrading = false
  function upgrade() {
    if (upgrading) return
    upgrading = true
    void load(c, id).then(swap)
  }
  if (!srcNode) upgrade()
  else {
    el.addEventListener('playing', () => window.setTimeout(upgrade, 400), { once: true })
    window.setTimeout(upgrade, 4000)
  }
  function swap(b: AudioBuffer | null) {
    if (done || !b) return
    const bufGain = c.createGain()
    bufGain.gain.value = 0
    bufGain.connect(out)
    const playing = srcNode && !el.paused && el.currentTime > 0
    stopBuffer = playRecording(c, b, id, bufGain, playing ? el.currentTime : undefined)
    const t = c.currentTime
    const X = playing ? 0.35 : 0.05
    bufGain.gain.setValueAtTime(0, t)
    bufGain.gain.linearRampToValueAtTime(1, t + X)
    elGain.gain.setValueAtTime(1, t)
    elGain.gain.linearRampToValueAtTime(0, t + X)
    window.setTimeout(release, X * 1000 + 80)
  }
  return () => {
    done = true
    stopBuffer?.()
    release()
  }
}

export function playSound(id: SoundId): void {
  const c = context()
  if (!c || !master) return
  if (current?.id === id) return
  wanted = id
  if (id === 'marron' || id === 'rosa') {
    start(c, id, (out) => (id === 'marron' ? playBrown(c, out) : playPink(c, out)))
    return
  }
  const ready = decoded.get(id)
  if (ready) start(c, id, (out) => playRecording(c, ready, id, out))
  else start(c, id, (out) => playStreaming(c, id, out))
}

function fadeOutCurrent() {
  if (!ctx || !current) return
  const { gain: g, stop } = current
  current = null
  const t = ctx.currentTime
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(0, t + FADE_OUT)
  window.setTimeout(() => {
    stop()
    g.disconnect()
  }, FADE_OUT * 1000 + 100)
}

export function stopSound(): void {
  wanted = null
  ducked = false
  fadeOutCurrent()
  notify()
}

export function playingSound(): SoundId | null {
  return current?.id ?? wanted
}

export function setVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next))
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(volumeGain(volume), t + 0.15)
}

let ducked = false

/** Atenúa (pausa, escala) o restaura el ambiente sin pararlo. */
export function duck(on: boolean): void {
  ducked = on
  if (ctx && waves) {
    const t = ctx.currentTime
    waves.gain.gain.cancelScheduledValues(t)
    waves.gain.gain.setValueAtTime(waves.gain.gain.value, t)
    waves.gain.gain.linearRampToValueAtTime(waveGain(waves.mode), t + 0.8)
  }
  if (!ctx || !current) return
  const t = ctx.currentTime
  current.gain.gain.cancelScheduledValues(t)
  current.gain.gain.setValueAtTime(current.gain.gain.value, t)
  current.gain.gain.linearRampToValueAtTime(TRIM[current.id] * (on ? 0.15 : 1), t + 0.8)
}

// ---------------------------------------------------------------------------
// Megafonía
// ---------------------------------------------------------------------------

/**
 * - `megafonia`: el «ding-dong» de dos notas antes de un anuncio de cabina.
 *   Suena al despegar y al aterrizar.
 * - `aviso`: una sola nota, la primera del mismo aviso. Marca el principio y
 *   el final de una escala.
 *
 * Los dos salen de la misma grabación real, hecha en la cabina de un Boeing
 * 737 antes de despegar (dominio público; ver `CHIME_CREDIT`), limpiada del
 * ruido de fondo. Si el archivo no se puede cargar (sin red la primera vez),
 * se sintetiza uno parecido para que el aviso no falte.
 */
export type ChimeId = 'megafonia' | 'aviso'

export const CHIME_CREDIT = {
  what: 'Aviso de cabina de un Boeing 737 en Poznań',
  author: 'maciej janasik',
}

const chimeBuffers = new Map<ChimeId, AudioBuffer>()
const chimePending = new Map<ChimeId, Promise<AudioBuffer | null>>()

function loadChime(c: AudioContext, id: ChimeId): Promise<AudioBuffer | null> {
  const ready = chimeBuffers.get(id)
  if (ready) return Promise.resolve(ready)
  let p = chimePending.get(id)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}sounds/${id}.m4a`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.arrayBuffer()
      })
      .then((data) => new Promise<AudioBuffer>((resolve, reject) => c.decodeAudioData(data, resolve, reject)))
      .then((b) => {
        chimeBuffers.set(id, b)
        return b
      })
      .catch(() => null)
      .finally(() => chimePending.delete(id))
    chimePending.set(id, p)
  }
  return p
}

/** Deja los avisos decodificados para que suenen en su instante exacto. */
export function preloadChimes(): void {
  const c = context()
  if (!c) return
  void loadChime(c, 'megafonia')
  void loadChime(c, 'aviso')
}

/** Nivel del aviso: sigue al volumen elegido, pero nunca desaparece del todo. */
function chimeGain(): number {
  return 0.55 * (0.45 + 0.55 * volume)
}

export function chime(id: ChimeId = 'megafonia'): void {
  const c = context()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => {})
  const ready = chimeBuffers.get(id)
  if (ready) {
    playChime(c, ready)
    return
  }
  void loadChime(c, id).then((b) => (b ? playChime(c, b) : synthChime(c, id)))
}

function playChime(c: AudioContext, b: AudioBuffer) {
  const out = c.createGain()
  out.gain.value = chimeGain()
  out.connect(c.destination)
  const src = c.createBufferSource()
  src.buffer = b
  src.connect(out)
  src.onended = () => out.disconnect()
  src.start()
}

/** Respaldo sintetizado: las mismas notas (re y si) con un poco de cola. */
function synthChime(c: AudioContext, id: ChimeId) {
  const out = c.createGain()
  out.gain.value = 0.6 * chimeGain()
  out.connect(c.destination)
  const tone = (freq: number, at: number) => {
    for (const [mult, amp] of [
      [1, 1],
      [2, 0.18],
      [3, 0.06],
    ] as const) {
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * mult
      const g = c.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(amp, at + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0008, at + 1.9)
      osc.connect(g).connect(out)
      osc.start(at)
      osc.stop(at + 2)
    }
  }
  const t = c.currentTime + 0.02
  tone(587.33, t)
  if (id === 'megafonia') tone(493.88, t + 0.9)
  window.setTimeout(() => out.disconnect(), 3200)
}

/**
 * Renderiza unos segundos de un ambiente sin altavoz (para comprobar niveles
 * en pruebas): devuelve el canal izquierdo.
 */
export async function renderSound(
  id: SoundId,
  seconds = 6,
  /** Con la cadena completa: ajuste del ambiente, volumen y limitador. */
  atVolume?: number,
): Promise<Float32Array> {
  const c = new OfflineAudioContext(2, Math.floor(48000 * seconds), 48000)
  const out = c.createGain()
  if (atVolume === undefined) {
    out.connect(c.destination)
  } else {
    out.gain.value = TRIM[id] * volumeGain(atVolume)
    out.connect(limiter(c)).connect(c.destination)
  }
  if (id === 'marron') playBrown(c, out)
  else if (id === 'rosa') playPink(c, out)
  else {
    const b = await load(c, id)
    if (!b) throw new Error('No se pudo cargar ' + id)
    playRecording(c, b, id, out)
  }
  const rendered = await c.startRendering()
  return rendered.getChannelData(0)
}

/**
 * Renderiza unos segundos de ondas sin altavoz (para comprobarlas en pruebas
 * del navegador): devuelve los dos canales con el nivel real de la capa.
 */
export async function renderWaves(
  id: WaveId,
  mode: WaveMode,
  seconds = 2,
  level = 1,
): Promise<[Float32Array, Float32Array]> {
  const c = new OfflineAudioContext(2, Math.floor(48000 * seconds), 48000)
  const out = c.createGain()
  out.gain.value = WAVE_TRIM[mode] * Math.pow(level, 1.5)
  out.connect(c.destination)
  if (mode === 'binaural') playBinaural(c, id, out)
  else playIsochronic(c, id, out)
  const rendered = await c.startRendering()
  return [rendered.getChannelData(0), rendered.getChannelData(1)]
}
