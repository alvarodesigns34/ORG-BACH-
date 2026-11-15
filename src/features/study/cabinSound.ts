/**
 * Sonido de cabina, generado en el navegador: sin archivos que descargar.
 *
 * El rumor de un avión en crucero es, sobre todo, ruido «marrón» (graves
 * fuertes, agudos apagados) con un leve soplido de aire encima. Aquí se
 * construye así: ruido marrón filtrado + una banda suave de ruido rosa, con
 * una ondulación muy lenta del filtro para que no suene a bucle.
 *
 * El aviso («ding-dong») son dos tonos senoidales con caída suave.
 *
 * Safari solo deja arrancar el audio dentro de un toque: `unlock()` se llama
 * desde el botón de despegar.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let running: AudioNode[] = []

function context(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  return ctx
}

/** Llamar dentro de un gesto del usuario. */
export function unlockAudio(): void {
  const c = context()
  if (c && c.state === 'suspended') void c.resume()
}

function noiseBuffer(c: AudioContext, kind: 'brown' | 'pink', seconds = 6): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds)
  const buffer = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let last = 0
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      } else {
        b0 = 0.99765 * b0 + white * 0.099046
        b1 = 0.963 * b1 + white * 0.2965164
        b2 = 0.57 * b2 + white * 1.0526913
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11
      }
    }
    // Fundido de los extremos: el bucle no hace «clic» al repetirse.
    const fade = Math.floor(c.sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      data[i] *= k
      data[length - 1 - i] *= k
    }
  }
  return buffer
}

export function startCabin(volume = 0.5): void {
  const c = context()
  if (!c || !master || running.length) return

  const brown = c.createBufferSource()
  brown.buffer = noiseBuffer(c, 'brown')
  brown.loop = true
  const low = c.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 420
  low.Q.value = 0.4

  const pink = c.createBufferSource()
  pink.buffer = noiseBuffer(c, 'pink', 5)
  pink.loop = true
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 900
  band.Q.value = 0.5
  const air = c.createGain()
  air.gain.value = 0.18

  // Ondulación lenta (≈ cada 11 s) del filtro: el motor «respira».
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.09
  const depth = c.createGain()
  depth.gain.value = 60
  lfo.connect(depth).connect(low.frequency)

  brown.connect(low).connect(master)
  pink.connect(band).connect(air).connect(master)
  brown.start()
  pink.start()
  lfo.start()
  running = [brown, pink, lfo]
  setCabinVolume(volume)
}

export function setCabinVolume(volume: number): void {
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(running.length ? volume * 0.6 : 0, t + 1.6)
}

export function stopCabin(): void {
  if (!ctx || !master || !running.length) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(0, t + 1.2)
  const nodes = running
  running = []
  window.setTimeout(() => {
    for (const node of nodes) {
      try {
        ;(node as AudioScheduledSourceNode).stop()
      } catch {
        // Ya parado.
      }
      node.disconnect()
    }
  }, 1300)
}

/** «Ding-dong» de megafonía. */
export function chime(): void {
  const c = context()
  if (!c) return
  const out = c.createGain()
  out.gain.value = 0.22
  out.connect(c.destination)
  const tone = (freq: number, at: number) => {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = c.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(1, at + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, at + 1.6)
    osc.connect(g).connect(out)
    osc.start(at)
    osc.stop(at + 1.7)
  }
  const t = c.currentTime + 0.02
  tone(783.99, t)
  tone(622.25, t + 0.55)
}
