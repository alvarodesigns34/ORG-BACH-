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
// Materia prima: ruido y utilidades de síntesis «horneada»
// ---------------------------------------------------------------------------

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

function cached(key: string, make: () => AudioBuffer): AudioBuffer {
  let b = cache.get(key)
  if (!b) {
    b = make()
    cache.set(key, b)
  }
  return b
}

/**
 * Búfer estéreo que se rellena a mano. Los sucesos (una gota, una ola) se
 * escriben con `addAt`, que da la vuelta al final: el bucle no tiene costura.
 */
function stereo(
  c: BaseAudioContext,
  seconds: number,
  fill: (L: Float32Array, R: Float32Array, rate: number) => void,
): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds)
  const b = c.createBuffer(2, n, c.sampleRate)
  fill(b.getChannelData(0), b.getChannelData(1), c.sampleRate)
  return b
}

/** Suma `src` en `dst` desde `start`, dando la vuelta al llegar al final. */
function addAt(dst: Float32Array, src: Float32Array, start: number, gain: number) {
  const n = dst.length
  for (let i = 0; i < src.length; i++) dst[(start + i) % n] += src[i] * gain
}

/** Paneo de potencia constante: p en −1…1 → ganancias izquierda/derecha. */
function pan(p: number): [number, number] {
  const a = ((p + 1) * Math.PI) / 4
  return [Math.cos(a), Math.sin(a)]
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

/** Filtro biquad (RBJ) aplicado sobre un array, en el sitio. */
function biquad(x: Float32Array, type: 'lp' | 'hp' | 'bp', f0: number, q: number, rate: number) {
  const w = (2 * Math.PI * f0) / rate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  let b0: number, b1: number, b2: number
  if (type === 'lp') {
    b0 = (1 - cos) / 2
    b1 = 1 - cos
    b2 = b0
  } else if (type === 'hp') {
    b0 = (1 + cos) / 2
    b1 = -(1 + cos)
    b2 = b0
  } else {
    b0 = alpha
    b1 = 0
    b2 = -alpha
  }
  const a0 = 1 + alpha
  const a1 = -2 * cos
  const a2 = 1 - alpha
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = y
    x[i] = y
  }
}

/** Fundido en los bordes de un búfer de ruido continuo (sin «clic» al repetir). */
function seam(data: Float32Array, rate: number, seconds = 0.08) {
  const n = Math.floor(rate * seconds)
  for (let i = 0; i < n; i++) {
    const k = i / n
    data[i] *= k
    data[data.length - 1 - i] *= k
  }
}

/**
 * Ruido continuo que se repite sin costura: se genera un poco más largo y la
 * cola se funde (a potencia constante) con el principio. Antes los bordes se
 * apagaban a cero y quedaba un microcorte en cada vuelta del bucle.
 */
function seamless(
  c: BaseAudioContext,
  seconds: number,
  make: (data: Float32Array) => void,
): AudioBuffer {
  const rate = c.sampleRate
  const n = Math.floor(rate * seconds)
  const fade = Math.floor(rate * 0.5)
  return stereo(c, seconds, (L, R) => {
    for (const ch of [L, R]) {
      const raw = new Float32Array(n + fade)
      make(raw)
      for (let i = 0; i < n; i++) ch[i] = raw[i]
      for (let i = 0; i < fade; i++) {
        const k = i / fade
        ch[i] = raw[n + i] * Math.cos((k * Math.PI) / 2) + raw[i] * Math.sin((k * Math.PI) / 2)
      }
    }
  })
}

const brown = (c: BaseAudioContext, s = 9) =>
  cached(`brown${s}`, () => seamless(c, s, (d) => brownInto(d)))
const pink = (c: BaseAudioContext, s = 7) =>
  cached(`pink${s}`, () => seamless(c, s, (d) => pinkInto(d)))

// ---------------------------------------------------------------------------
// Sucesos: lo que hace reconocible cada ambiente
// ---------------------------------------------------------------------------

/**
 * Gotas de lluvia: impactos muy cortos (1–4 ms) de ruido filtrado en banda,
 * cada una con su tono, fuerza y posición. Miles por segundo hacen «lluvia»;
 * el oído distingue gotas sueltas, no un siseo plano.
 */
function drops(c: BaseAudioContext, key: string, seconds: number, perSecond: number, lo: number, hi: number) {
  return cached(key, () =>
    stereo(c, seconds, (L, R, rate) => {
      const total = Math.floor(seconds * perSecond)
      for (let k = 0; k < total; k++) {
        const len = Math.floor(rate * rnd(0.0012, 0.004))
        const snip = new Float32Array(len)
        for (let i = 0; i < len; i++) snip[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 4))
        biquad(snip, 'bp', rnd(lo, hi), 1.4, rate)
        const amp = 0.06 + Math.pow(Math.random(), 4) * 0.9
        const [gl, gr] = pan(rnd(-0.9, 0.9))
        const at = Math.floor(Math.random() * L.length)
        addAt(L, snip, at, amp * gl)
        addAt(R, snip, at, amp * gr)
      }
    }),
  )
}

/**
 * «Plic»: una gota grande cayendo en un charco o una canaleta. Es una burbuja
 * que resuena con el tono subiendo deprisa (el sonido que el oído asocia sin
 * dudar al agua).
 */
function plinks(c: BaseAudioContext, key: string, seconds: number, perSecond: number) {
  return cached(key, () =>
    stereo(c, seconds, (L, R, rate) => {
      const total = Math.floor(seconds * perSecond)
      for (let k = 0; k < total; k++) {
        const len = Math.floor(rate * 0.09)
        const snip = new Float32Array(len)
        const f0 = rnd(700, 1900)
        const rise = rnd(1.25, 1.8)
        const tau = rnd(0.012, 0.03)
        let phase = 0
        for (let i = 0; i < len; i++) {
          const t = i / rate
          const f = f0 * (1 + (rise - 1) * Math.min(1, t / 0.03))
          phase += (2 * Math.PI * f) / rate
          const env = Math.min(1, t / 0.0015) * Math.exp(-t / tau)
          snip[i] = Math.sin(phase) * env
        }
        const amp = rnd(0.08, 0.32)
        const [gl, gr] = pan(rnd(-0.8, 0.8))
        const at = Math.floor(Math.random() * L.length)
        addAt(L, snip, at, amp * gl)
        addAt(R, snip, at, amp * gr)
      }
    }),
  )
}

/**
 * Olas: cada una crece (el agua que se levanta), rompe con un golpe brillante
 * y se retira en un siseo de espuma que burbujea y se apaga. Entre olas,
 * el fondo grave del mar.
 */
function sea(c: BaseAudioContext, key: string, seconds: number, gap: [number, number], size: number) {
  return cached(key, () =>
    stereo(c, seconds, (L, R, rate) => {
      const n = L.length
      for (const [ch, side] of [[L, -1], [R, 1]] as const) {
        const low = new Float32Array(n)
        const mid = new Float32Array(n)
        const high = new Float32Array(n)
        brownInto(low, 3)
        pinkInto(mid, 0.2)
        for (let i = 0; i < n; i++) high[i] = Math.random() * 2 - 1
        biquad(high, 'hp', 1800, 0.7, rate)
        const envLow = new Float32Array(n)
        const envMid = new Float32Array(n)
        const envHigh = new Float32Array(n)
        let t = rnd(0, 2)
        let w = 0
        while (t < seconds) {
          const build = rnd(1.6, 2.6)
          const recede = rnd(3.5, 6)
          const amp = size * rnd(0.6, 1)
          const lean = side * rnd(-0.4, 0.4) // cada ola cae a un lado distinto
          const g = 1 + lean * 0.5
          const start = Math.floor(t * rate)
          const len = Math.floor((build + recede) * rate)
          for (let i = 0; i < len; i++) {
            const s = i / rate
            const idx = (start + i) % n
            if (s < build) {
              const k = s / build
              envLow[idx] += amp * g * k * k * 0.9
              envMid[idx] += amp * g * Math.pow(k, 3) * 0.6
            } else {
              const d = s - build
              const crash = Math.min(1, d / 0.12)
              envLow[idx] += amp * g * (0.9 * Math.exp(-d / (recede * 0.35)))
              envMid[idx] += amp * g * crash * Math.exp(-d / (recede * 0.3))
              envHigh[idx] += amp * g * crash * Math.exp(-d / (recede * 0.42))
            }
          }
          t += rnd(gap[0], gap[1])
          w++
        }
        for (let i = 0; i < n; i++) {
          // La espuma burbujea: chispas sueltas, más cuanto más espuma hay.
          const fizz = Math.random() < envHigh[i] * 0.012 ? (Math.random() * 2 - 1) * 0.6 : 0
          ch[i] = low[i] * (0.18 + envLow[i] * 0.45) + mid[i] * envMid[i] * 0.9 + high[i] * envHigh[i] * 0.35 + fizz * envHigh[i]
        }
        biquad(ch, 'lp', 7000, 0.7, rate)
      }
    }),
  )
}

/**
 * Fuego: chasquidos diminutos que llegan a ráfagas, algún «pop» más grande
 * con su resonancia de madera, y el siseo breve de la savia.
 */
function crackles(c: BaseAudioContext, key: string, seconds: number, popsPerSecond: number) {
  return cached(key, () =>
    stereo(c, seconds, (L, R, rate) => {
      let t = 0
      while (t < seconds) {
        // Ráfaga de chasquidos pequeños.
        const burst = Math.floor(rnd(2, 9))
        const [gl, gr] = pan(rnd(-0.5, 0.5))
        for (let k = 0; k < burst; k++) {
          const len = Math.floor(rate * rnd(0.0006, 0.0025))
          const snip = new Float32Array(len)
          for (let i = 0; i < len; i++) snip[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 3))
          biquad(snip, 'hp', rnd(1500, 4000), 0.8, rate)
          const at = Math.floor((t + k * rnd(0.008, 0.05)) * rate)
          const amp = rnd(0.15, 0.6)
          addAt(L, snip, at, amp * gl)
          addAt(R, snip, at, amp * gr)
        }
        t += Math.random() < 0.6 ? rnd(0.06, 0.25) : rnd(0.4, 1.4)
      }
      // Pops grandes: madera que se raja, con un cuerpo que resuena.
      for (let k = 0; k < seconds * popsPerSecond; k++) {
        const len = Math.floor(rate * 0.06)
        const snip = new Float32Array(len)
        for (let i = 0; i < len; i++) snip[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * rnd(0.004, 0.012)))
        biquad(snip, 'bp', rnd(900, 2600), 2.5, rate)
        const at = Math.floor(Math.random() * L.length)
        const [gl, gr] = pan(rnd(-0.6, 0.6))
        const amp = rnd(0.9, 1.8)
        addAt(L, snip, at, amp * gl)
        addAt(R, snip, at, amp * gr)
      }
      // Siseo de savia: medio segundo de ruido agudo que entra y sale.
      for (let k = 0; k < seconds / 7; k++) {
        const len = Math.floor(rate * rnd(0.4, 1.1))
        const snip = new Float32Array(len)
        for (let i = 0; i < len; i++) snip[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len) ** 2
        biquad(snip, 'bp', rnd(3500, 6000), 3, rate)
        const at = Math.floor(Math.random() * L.length)
        addAt(L, snip, at, 0.09)
        addAt(R, snip, at, 0.07)
      }
    }),
  )
}

/** Grillos de noche, lejos: trenes de 3–5 pulsos a ~4,5 kHz, con silencios. */
function crickets(c: BaseAudioContext) {
  return cached('crickets', () =>
    stereo(c, 17, (L, R, rate) => {
      const voices = [
        { f: 4650, period: 0.82, pulses: 3, side: -0.6 },
        { f: 4180, period: 1.13, pulses: 4, side: 0.65 },
      ]
      for (const v of voices) {
        const [gl, gr] = pan(v.side)
        let t = rnd(0, 1)
        while (t < 17) {
          // De vez en cuando, el grillo calla un rato.
          if (Math.random() < 0.08) {
            t += rnd(2, 4)
            continue
          }
          for (let p = 0; p < v.pulses; p++) {
            const len = Math.floor(rate * 0.014)
            const snip = new Float32Array(len)
            for (let i = 0; i < len; i++) {
              snip[i] = Math.sin((2 * Math.PI * v.f * i) / rate) * Math.sin((Math.PI * i) / len) ** 2
            }
            const at = Math.floor((t + p * 0.03) * rate)
            addAt(L, snip, at, 0.05 * gl)
            addAt(R, snip, at, 0.05 * gr)
          }
          t += v.period * rnd(0.92, 1.08)
        }
      }
    }),
  )
}

/**
 * Trueno: un retumbo grave hecho de varios golpes que se encadenan (el
 * trueno «rueda»). Los cercanos empiezan con un chasquido seco; los lejanos
 * son solo un rumor sordo.
 */
function thunder(c: BaseAudioContext): { buffer: AudioBuffer; near: boolean } {
  const near = Math.random() < 0.45
  const seconds = near ? rnd(7, 10) : rnd(8, 12)
  const buffer = stereo(c, seconds, (L, R, rate) => {
    const n = L.length
    const env = new Float32Array(n)
    let t = near ? 0.12 : rnd(0.2, 0.8)
    const lumps = Math.floor(rnd(5, 9))
    for (let k = 0; k < lumps; k++) {
      const amp = (k === 0 ? 1 : rnd(0.35, 0.9)) * Math.exp(-k * 0.18)
      const attack = rnd(0.05, 0.3)
      const tau = rnd(0.5, 1.6)
      const start = Math.floor(t * rate)
      for (let i = start; i < n; i++) {
        const s = (i - start) / rate
        env[i] += amp * Math.min(1, s / attack) * Math.exp(-s / tau)
      }
      t += rnd(0.15, 1.1)
    }
    for (const [ch, side] of [[L, 0], [R, 1]] as const) {
      brownInto(ch, 5)
      for (let i = 0; i < n; i++) ch[i] *= env[i]
      biquad(ch, 'lp', near ? 190 : 95, 0.7, rate)
      biquad(ch, 'lp', near ? 260 : 140, 0.7, rate)
      if (near) {
        // El chasquido inicial.
        const len = Math.floor(rate * 0.45)
        const crack = new Float32Array(len)
        for (let i = 0; i < len; i++) {
          const s = i / rate
          crack[i] = (Math.random() * 2 - 1) * Math.exp(-s / 0.07) * (1 + 0.6 * Math.sin(s * 90 + side))
        }
        biquad(crack, 'bp', 1400, 0.5, rate)
        addAt(ch, crack, Math.floor(rate * 0.05), 1.1)
      }
      let peak = 0
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]))
      const scale = peak > 0 ? 0.95 / peak : 1
      for (let i = 0; i < n; i++) ch[i] *= scale
      seam(ch, rate, 0.3)
    }
  })
  return { buffer, near }
}

// ---------------------------------------------------------------------------
// Ambientes
// ---------------------------------------------------------------------------

type Build = (c: AudioContext, out: AudioNode) => () => void

function loop(c: BaseAudioContext, b: AudioBuffer, offset = Math.random() * b.duration) {
  const src = c.createBufferSource()
  src.buffer = b
  src.loop = true
  src.start(0, offset)
  return src
}

function filter(c: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function gain(c: BaseAudioContext, value: number) {
  const g = c.createGain()
  g.gain.value = value
  return g
}

/** Oscilador lento que mueve un parámetro: `base ± depth`. */
function wobble(c: BaseAudioContext, param: AudioParam, base: number, depth: number, hz: number) {
  param.value = base
  const osc = c.createOscillator()
  osc.frequency.value = hz
  const g = gain(c, depth)
  osc.connect(g).connect(param)
  osc.start()
  return osc
}

/** Viento: aullido que sube y baja de tono, roce de fondo y ráfagas irregulares. */
function windLayer(c: AudioContext, out: AudioNode, level: number) {
  const howlSrc = loop(c, pink(c))
  const howl = filter(c, 'bandpass', 700, 5)
  const howlGain = gain(c, 0.55 * level)
  const f1 = wobble(c, howl.frequency, 720, 330, 0.043)
  const g1 = wobble(c, howlGain.gain, 0.55 * level, 0.4 * level, 0.071)
  const rustleSrc = loop(c, pink(c, 11))
  const rustle = filter(c, 'bandpass', 420, 0.6)
  const rustleGain = gain(c, 0.8 * level)
  const g2 = wobble(c, rustleGain.gain, 0.8 * level, 0.45 * level, 0.113)
  const f2 = wobble(c, rustle.frequency, 420, 160, 0.029)
  const low = loop(c, brown(c))
  const lowLp = filter(c, 'lowpass', 260)
  const lowGain = gain(c, 0.35 * level)
  const g3 = wobble(c, lowGain.gain, 0.35 * level, 0.2 * level, 0.057)
  howlSrc.connect(howl).connect(howlGain).connect(out)
  rustleSrc.connect(rustle).connect(rustleGain).connect(out)
  low.connect(lowLp).connect(lowGain).connect(out)
  return () => [howlSrc, rustleSrc, low, f1, g1, g2, f2, g3].forEach(stopNode)
}

/** Lluvia con dos capas de gotas de longitudes distintas: no se nota el bucle. */
function rainLayer(c: AudioContext, out: AudioNode, heavy: boolean) {
  const wash = loop(c, pink(c))
  const hp = filter(c, 'highpass', heavy ? 350 : 550)
  const lp = filter(c, 'lowpass', heavy ? 5200 : 7500)
  const washGain = gain(c, heavy ? 0.55 : 0.32)
  const swell = wobble(c, washGain.gain, heavy ? 0.55 : 0.32, heavy ? 0.12 : 0.07, 0.031)
  const a = loop(c, drops(c, heavy ? 'drops-h1' : 'drops-1', 7.3, heavy ? 700 : 260, 2000, 9000))
  const b = loop(c, drops(c, heavy ? 'drops-h2' : 'drops-2', 11.1, heavy ? 500 : 180, 1200, 6000))
  const dropsGain = gain(c, heavy ? 0.55 : 0.75)
  const p = loop(c, plinks(c, heavy ? 'plinks-h' : 'plinks', 13.7, heavy ? 0.9 : 1.6))
  const plinkGain = gain(c, heavy ? 0.35 : 0.6)
  const bed = loop(c, brown(c))
  const bedLp = filter(c, 'lowpass', heavy ? 600 : 300)
  const bedGain = gain(c, heavy ? 0.45 : 0.18)
  wash.connect(hp).connect(lp).connect(washGain).connect(out)
  a.connect(dropsGain)
  b.connect(dropsGain)
  dropsGain.connect(out)
  p.connect(plinkGain).connect(out)
  bed.connect(bedLp).connect(bedGain).connect(out)
  return () => [wash, a, b, p, bed, swell].forEach(stopNode)
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

  lluvia: (c, out) => rainLayer(c, out, false),

  tormenta: (c, out) => {
    const stopRain = rainLayer(c, out, true)
    const stopWind = windLayer(c, out, 0.45)
    // Truenos: el primero enseguida (para que se sepa qué es), luego cada
    // 18–40 s, unos cerca y otros lejos.
    let timer = 0
    const strike = () => {
      const { buffer, near } = thunder(c)
      const src = c.createBufferSource()
      src.buffer = buffer
      const g = gain(c, near ? rnd(1.3, 1.7) : rnd(0.8, 1.1))
      src.connect(g).connect(out)
      src.start()
      timer = window.setTimeout(strike, rnd(18000, 40000))
    }
    timer = window.setTimeout(strike, rnd(3500, 6000))
    return () => {
      window.clearTimeout(timer)
      stopRain()
      stopWind()
    }
  },

  olas: (c, out) => {
    const near = loop(c, sea(c, 'sea-near', 41, [7.5, 11.5], 1), 0)
    const far = loop(c, sea(c, 'sea-far', 29, [5, 8], 0.45))
    const farLp = filter(c, 'lowpass', 1400)
    const nearGain = gain(c, 0.9)
    const farGain = gain(c, 0.55)
    near.connect(nearGain).connect(out)
    far.connect(farLp).connect(farGain).connect(out)
    return () => [near, far].forEach(stopNode)
  },

  viento: (c, out) => windLayer(c, out, 1),

  chimenea: (c, out) => {
    // La llama «respira»: rumor grave con dos oscilaciones lentas cruzadas.
    const roar = loop(c, brown(c))
    const lp = filter(c, 'lowpass', 340)
    const roarGain = gain(c, 0.55)
    const l1 = wobble(c, roarGain.gain, 0.55, 0.15, 0.17)
    const flutter = loop(c, pink(c))
    const flutterBp = filter(c, 'bandpass', 520, 0.8)
    const flutterGain = gain(c, 0.12)
    const l2 = wobble(c, flutterGain.gain, 0.12, 0.08, 0.29)
    const a = loop(c, crackles(c, 'fire-a', 12.7, 0.35))
    const b = loop(c, crackles(c, 'fire-b', 9.3, 0.2))
    const crackGain = gain(c, 0.85)
    const night = loop(c, crickets(c))
    const nightGain = gain(c, 0.5)
    roar.connect(lp).connect(roarGain).connect(out)
    flutter.connect(flutterBp).connect(flutterGain).connect(out)
    a.connect(crackGain)
    b.connect(crackGain)
    crackGain.connect(out)
    night.connect(nightGain).connect(out)
    return () => [roar, flutter, a, b, night, l1, l2].forEach(stopNode)
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
  cabina: 1.32,
  lluvia: 2.7,
  tormenta: 1.51,
  olas: 1.4,
  viento: 1.84,
  chimenea: 2.48,
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
  // Sin reloj real no saltan los temporizadores: el trueno de la tormenta
  // se programa a mano, a los 4 s, para poder oírlo y medirlo.
  if (id === 'tormenta') {
    const src = c.createBufferSource()
    src.buffer = thunder(c).buffer
    const g = c.createGain()
    g.gain.value = 1.5
    src.connect(g).connect(out)
    src.start(4)
  }
  const rendered = await c.startRendering()
  return rendered.getChannelData(0)
}
