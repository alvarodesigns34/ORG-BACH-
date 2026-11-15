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
 * El ruido marrón sí se genera aquí: es ruido puro, no hay nada que grabar.
 *
 * Cambiar de ambiente funde uno en otro. Safari solo permite arrancar el
 * audio dentro de un toque: `unlockAudio()` en el gesto.
 */

export type SoundId =
  | 'cabina'
  | 'lluvia'
  | 'tormenta'
  | 'olas'
  | 'viento'
  | 'chimenea'
  | 'marron'

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: 'cabina', label: 'Cabina' },
  { id: 'lluvia', label: 'Lluvia' },
  { id: 'tormenta', label: 'Tormenta' },
  { id: 'olas', label: 'Olas' },
  { id: 'viento', label: 'Viento' },
  { id: 'chimenea', label: 'Chimenea' },
  { id: 'marron', label: 'Ruido marrón' },
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
    if ((current || wanted) && c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => {})
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
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) {
    try {
      session.type = 'playback'
      return
    } catch {
      // Sigue con el truco de abajo.
    }
  }
  if (silentLoop || !/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)) return
  silentLoop = new Audio(silentWav())
  silentLoop.loop = true
  silentLoop.setAttribute('playsinline', '')
  void silentLoop.play().catch(() => {
    silentLoop = null
  })
}

/** Medio segundo de silencio en WAV (8 kHz, 8 bits), como data URI. */
function silentWav(): string {
  const samples = 4000
  const bytes = new Uint8Array(44 + samples)
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
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `data:audio/wav;base64,${btoa(binary)}`
}

export function audioRunning(): boolean {
  return !!ctx && ctx.state === 'running'
}

// ---------------------------------------------------------------------------
// Grabaciones
// ---------------------------------------------------------------------------

type Recorded = Exclude<SoundId, 'marron'>

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
  if (id === 'ninguno' || id === 'marron') return
  const c = context()
  if (c) void load(c, id)
}

function playRecording(c: BaseAudioContext, b: AudioBuffer, id: Recorded, out: AudioNode) {
  const src = c.createBufferSource()
  src.buffer = b
  src.loop = true
  const len = Math.min(LOOP[id], b.duration - 2 * PAD)
  src.loopStart = PAD
  src.loopEnd = PAD + len
  src.connect(out)
  // Cada vez desde un punto distinto: nunca se oye «el mismo principio».
  src.start(0, PAD + Math.random() * len)
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

const FADE = 1.6

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

function start(c: AudioContext, id: SoundId, stop: (out: AudioNode) => () => void) {
  if (!master) return
  fadeOutCurrent()
  const g = c.createGain()
  g.gain.value = 0
  g.connect(master)
  const halt = stop(g)
  const t = c.currentTime
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(TRIM[id] * (ducked ? 0.15 : 1), t + FADE)
  current = { id, gain: g, stop: halt }
  notify()
}

export function playSound(id: SoundId): void {
  const c = context()
  if (!c || !master) return
  if (current?.id === id || wanted === id) return
  wanted = id
  if (id === 'marron') {
    start(c, id, (out) => playBrown(c, out))
    return
  }
  const ready = decoded.get(id)
  if (ready) {
    start(c, id, (out) => playRecording(c, ready, id, out))
    return
  }
  notify()
  void load(c, id).then((b) => {
    if (wanted !== id) return // Se eligió otro mientras se descargaba.
    if (!b) {
      wanted = current?.id ?? null
      notify()
      return
    }
    start(c, id, (out) => playRecording(c, b, id, out))
  })
}

function fadeOutCurrent() {
  if (!ctx || !current) return
  const { gain: g, stop } = current
  current = null
  const t = ctx.currentTime
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(0, t + FADE * 0.75)
  window.setTimeout(() => {
    stop()
    g.disconnect()
  }, FADE * 750 + 100)
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
  if (!ctx || !current) return
  const t = ctx.currentTime
  current.gain.gain.cancelScheduledValues(t)
  current.gain.gain.setValueAtTime(current.gain.gain.value, t)
  current.gain.gain.linearRampToValueAtTime(TRIM[current.id] * (on ? 0.15 : 1), t + 0.8)
}

/** «Ding-dong» de megafonía, con un poco de cola. */
export function chime(): void {
  const c = context()
  if (!c) return
  const out = c.createGain()
  out.gain.value = 0.32
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
  tone(659.25, t)
  tone(523.25, t + 0.62)
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
  else {
    const b = await load(c, id)
    if (!b) throw new Error('No se pudo cargar ' + id)
    playRecording(c, b, id, out)
  }
  const rendered = await c.startRendering()
  return rendered.getChannelData(0)
}
