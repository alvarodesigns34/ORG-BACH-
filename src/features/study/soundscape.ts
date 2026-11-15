/**
 * Ambientes sonoros del modo estudio, generados en el navegador.
 *
 * Nada se descarga: cada ambiente se construye con ruido y filtros, con la
 * estructura del sonido real —el rumor grave del avión con su zumbido de
 * motor; la lluvia como un siseo continuo más miles de gotas sueltas; las
 * olas como ruido que sube y baja con un ciclo lento y que se vuelve más
 * brillante en la cresta—. Las partes con estructura temporal (gotas, olas,
 * chasquidos) se «hornean» una vez en un búfer en bucle; el resto son nodos
 * en vivo con osciladores muy lentos que lo mantienen vivo y sin repetición
 * evidente.
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
let volume = 0.7
const cache = new Map<string, AudioBuffer>()

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
  return ctx
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
// Materia prima
// ---------------------------------------------------------------------------

function buffer(c: AudioContext, seconds: number, fill: (data: Float32Array, ch: number, rate: number) => void): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds)
  const b = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) fill(b.getChannelData(ch), ch, c.sampleRate)
  return b
}

function cached(key: string, make: () => AudioBuffer): AudioBuffer {
  let b = cache.get(key)
  if (!b) {
    b = make()
    cache.set(key, b)
  }
  return b
}

/** Fundido en los bordes para que el bucle no haga «clic». */
function seam(data: Float32Array, rate: number, seconds = 0.08) {
  const n = Math.floor(rate * seconds)
  for (let i = 0; i < n; i++) {
    const k = i / n
    data[i] *= k
    data[data.length - 1 - i] *= k
  }
}

function brownInto(data: Float32Array, gain = 3.5) {
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * gain
  }
}

function pinkInto(data: Float32Array, gain = 0.11) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * gain
    b6 = w * 0.115926
  }
}

const brown = (c: AudioContext, s = 9) =>
  cached(`brown${s}`, () => buffer(c, s, (d, _ch, r) => (brownInto(d), seam(d, r))))
const pink = (c: AudioContext, s = 7) =>
  cached(`pink${s}`, () => buffer(c, s, (d, _ch, r) => (pinkInto(d), seam(d, r))))

/** Gotas: pequeños impactos (senoide amortiguada + chasquido), repartidos al azar. */
function droplets(c: AudioContext, perSecond: number, key: string) {
  return cached(key, () =>
    buffer(c, 11, (d, _ch, rate) => {
      const total = Math.floor((d.length / rate) * perSecond)
      for (let k = 0; k < total; k++) {
        const start = Math.floor(Math.random() * (d.length - rate * 0.03))
        const freq = 1800 + Math.random() * 5200
        const decay = 0.003 + Math.random() * 0.012
        const amp = 0.015 + Math.pow(Math.random(), 3) * 0.12
        const len = Math.floor(rate * decay * 5)
        for (let i = 0; i < len; i++) {
          const t = i / rate
          const env = Math.exp(-t / decay)
          d[start + i] += amp * env * (Math.sin(2 * Math.PI * freq * t) * 0.7 + (Math.random() * 2 - 1) * 0.3)
        }
      }
      seam(d, rate)
    }),
  )
}

/** Olas: ruido que sube y baja (ciclos de 7–11 s) y brilla en la cresta. */
function waves(c: AudioContext) {
  return cached('waves', () =>
    buffer(c, 32, (d, ch, rate) => {
      const lo = new Float32Array(d.length)
      const hi = new Float32Array(d.length)
      brownInto(lo, 3)
      pinkInto(hi, 0.16)
      // Crestas en posiciones fijas (periódicas en 32 s) con algo de azar.
      const crests = [2.2, 10.1, 17.4, 25.9].map((t) => t + (ch ? 0.35 : 0))
      for (let i = 0; i < d.length; i++) {
        const t = i / rate
        let env = 0.12
        for (const crest of crests) {
          for (const shift of [-32, 0, 32]) {
            const x = t - (crest + shift)
            // Subida lenta y bajada más larga, como la ola que se retira.
            const e = x < 0 ? Math.exp(-(x * x) / 5) : Math.exp(-(x * x) / 14)
            env = Math.max(env, e)
          }
        }
        d[i] = lo[i] * (0.25 + 0.55 * env) + hi[i] * Math.pow(env, 2.2) * 0.9
      }
      seam(d, rate, 0.4)
    }),
  )
}

/** Chimenea: chasquidos irregulares y algún «pop» sobre un rumor grave. */
function crackles(c: AudioContext) {
  return cached('crackles', () =>
    buffer(c, 13, (d, _ch, rate) => {
      let t = 0
      while (t < d.length / rate - 0.05) {
        // A ráfagas: varios chasquidos juntos y luego pausa.
        t += Math.random() < 0.7 ? 0.03 + Math.random() * 0.12 : 0.3 + Math.random() * 0.9
        const start = Math.floor(t * rate)
        const pop = Math.random() < 0.12
        const amp = pop ? 0.35 + Math.random() * 0.3 : 0.05 + Math.random() * 0.18
        const len = Math.floor(rate * (pop ? 0.02 : 0.004 + Math.random() * 0.006))
        let lp = 0
        for (let i = 0; i < len && start + i < d.length; i++) {
          const env = Math.exp(-i / (len / 4))
          const w = Math.random() * 2 - 1
          lp = pop ? lp * 0.6 + w * 0.4 : w
          d[start + i] += amp * env * lp
        }
      }
      seam(d, rate)
    }),
  )
}

// ---------------------------------------------------------------------------
// Ambientes
// ---------------------------------------------------------------------------

type Build = (c: AudioContext, out: AudioNode) => () => void

function loop(c: AudioContext, b: AudioBuffer, offset = Math.random() * b.duration) {
  const src = c.createBufferSource()
  src.buffer = b
  src.loop = true
  src.start(0, offset)
  return src
}

function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function gain(c: AudioContext, value: number) {
  const g = c.createGain()
  g.gain.value = value
  return g
}

/** Oscilador lento que mueve un parámetro: `base ± depth`. */
function wobble(c: AudioContext, param: AudioParam, base: number, depth: number, hz: number) {
  param.value = base
  const osc = c.createOscillator()
  osc.frequency.value = hz
  const g = gain(c, depth)
  osc.connect(g).connect(param)
  osc.start()
  return osc
}

const BUILD: Record<SoundId, Build> = {
  cabina: (c, out) => {
    // Cuerpo grave del motor + el siseo del aire de cabina, que es lo que
    // de verdad se oye en un avión y lo que reproduce un altavoz pequeño.
    const body = loop(c, brown(c))
    const low = filter(c, 'lowpass', 520, 0.5)
    const bodyGain = gain(c, 0.85)
    const air = loop(c, pink(c))
    const band = filter(c, 'lowpass', 2600, 0.5)
    const airHp = filter(c, 'highpass', 220, 0.5)
    const airGain = gain(c, 0.5)
    // Zumbido de motor: dos tonos graves casi iguales que «laten» despacio.
    const hum = gain(c, 0.018)
    const h1 = c.createOscillator()
    h1.frequency.value = 87
    const h2 = c.createOscillator()
    h2.frequency.value = 87.6
    h1.connect(hum)
    h2.connect(hum)
    h1.start()
    h2.start()
    const lfo = wobble(c, low.frequency, 520, 70, 0.07)
    body.connect(low).connect(bodyGain).connect(out)
    air.connect(airHp).connect(band).connect(airGain).connect(out)
    hum.connect(out)
    return () => [body, air, h1, h2, lfo].forEach(stopNode)
  },

  lluvia: (c, out) => {
    const hiss = loop(c, pink(c))
    const hp = filter(c, 'highpass', 450)
    const lp = filter(c, 'lowpass', 6500)
    const hissGain = gain(c, 0.55)
    const drops = loop(c, droplets(c, 70, 'drops-soft'))
    const dropsGain = gain(c, 0.8)
    const bed = loop(c, brown(c))
    const bedLp = filter(c, 'lowpass', 220)
    const bedGain = gain(c, 0.35)
    const lfo = wobble(c, hissGain.gain, 0.55, 0.06, 0.05)
    hiss.connect(hp).connect(lp).connect(hissGain).connect(out)
    drops.connect(dropsGain).connect(out)
    bed.connect(bedLp).connect(bedGain).connect(out)
    return () => [hiss, drops, bed, lfo].forEach(stopNode)
  },

  tormenta: (c, out) => {
    const stopRain = BUILD.lluvia(c, out)
    const heavy = loop(c, droplets(c, 160, 'drops-heavy'))
    const heavyGain = gain(c, 0.55)
    heavy.connect(heavyGain).connect(out)
    // Truenos lejanos cada 15–40 s: grave, con un primer golpe y un retumbo.
    let timer = 0
    const thunder = () => {
      const len = 6 + Math.random() * 3
      const b = buffer(c, len, (d, ch, rate) => {
        brownInto(d, 4)
        const crack = 0.15 + Math.random() * 0.4
        for (let i = 0; i < d.length; i++) {
          const t = i / rate
          const env =
            t < crack
              ? t / crack
              : Math.exp(-(t - crack) / (1.3 + Math.random() * 0.002)) *
                (0.75 + 0.25 * Math.sin(t * (3 + ch)))
          d[i] *= env
        }
        seam(d, rate, 0.2)
      })
      const src = c.createBufferSource()
      src.buffer = b
      const lp = filter(c, 'lowpass', 140 + Math.random() * 80)
      const g = gain(c, 0.55 + Math.random() * 0.35)
      src.connect(lp).connect(g).connect(out)
      src.start()
      timer = window.setTimeout(thunder, 15000 + Math.random() * 25000)
    }
    timer = window.setTimeout(thunder, 4000 + Math.random() * 6000)
    return () => {
      window.clearTimeout(timer)
      stopRain()
      stopNode(heavy)
    }
  },

  olas: (c, out) => {
    const sea = loop(c, waves(c), 0)
    const lp = filter(c, 'lowpass', 4200, 0.4)
    const g = gain(c, 0.9)
    sea.connect(lp).connect(g).connect(out)
    return () => stopNode(sea)
  },

  viento: (c, out) => {
    const src = loop(c, pink(c))
    const band = filter(c, 'bandpass', 520, 0.9)
    const g = gain(c, 0.9)
    const f1 = wobble(c, band.frequency, 520, 260, 0.06)
    const f2 = wobble(c, g.gain, 0.9, 0.35, 0.13)
    const low = loop(c, brown(c))
    const lowLp = filter(c, 'lowpass', 300)
    const lowGain = gain(c, 0.4)
    const f3 = wobble(c, lowGain.gain, 0.4, 0.2, 0.045)
    src.connect(band).connect(g).connect(out)
    low.connect(lowLp).connect(lowGain).connect(out)
    return () => [src, low, f1, f2, f3].forEach(stopNode)
  },

  chimenea: (c, out) => {
    const roar = loop(c, brown(c))
    const lp = filter(c, 'lowpass', 520)
    const roarGain = gain(c, 0.5)
    const lfo = wobble(c, roarGain.gain, 0.5, 0.12, 0.2)
    const crack = loop(c, crackles(c))
    const hp = filter(c, 'highpass', 900)
    const crackGain = gain(c, 0.7)
    roar.connect(lp).connect(roarGain).connect(out)
    crack.connect(hp).connect(crackGain).connect(out)
    return () => [roar, crack, lfo].forEach(stopNode)
  },

  marron: (c, out) => {
    const src = loop(c, brown(c))
    const lp = filter(c, 'lowpass', 900, 0.5)
    const g = gain(c, 0.85)
    src.connect(lp).connect(g).connect(out)
    return () => stopNode(src)
  },
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
 * Ajuste de nivel por ambiente, medido: todos quedan a −16 dB contando a la
 * vez cómo suenan con cascos y en un altavoz pequeño (que pierde los graves
 * por debajo de ~250 Hz). Así cambiar de ambiente no da saltos de volumen,
 * y ninguno desaparece en el iPad o el portátil.
 */
const TRIM: Record<SoundId, number> = {
  cabina: 1.3,
  lluvia: 1.88,
  tormenta: 1.86,
  olas: 1.43,
  viento: 1.8,
  chimenea: 2.45,
  marron: 1.41,
}

export function playSound(id: SoundId): void {
  const c = context()
  if (!c || !master) return
  if (current?.id === id) return
  fadeOutCurrent()
  const g = c.createGain()
  g.gain.value = 0
  g.connect(master)
  const stop = BUILD[id](c, g)
  const t = c.currentTime
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(TRIM[id], t + FADE)
  current = { id, gain: g, stop }
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
  fadeOutCurrent()
}

export function playingSound(): SoundId | null {
  return current?.id ?? null
}

export function setVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next))
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(volumeGain(volume), t + 0.15)
}

/** Atenúa (pausa, escala) o restaura el ambiente sin pararlo. */
export function duck(on: boolean): void {
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
  const out = gain(c, 0.32)
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
  const c = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100)
  const out = c.createGain()
  if (atVolume === undefined) {
    out.connect(c.destination)
  } else {
    out.gain.value = TRIM[id] * volumeGain(atVolume)
    out.connect(limiter(c)).connect(c.destination)
  }
  BUILD[id](c as unknown as AudioContext, out)
  const rendered = await c.startRendering()
  return rendered.getChannelData(0)
}
