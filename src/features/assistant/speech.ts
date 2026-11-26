/**
 * Lectura en voz alta con la voz del sistema (speechSynthesis): gratis, sin
 * red y con las voces en español que trae el iPhone o el iPad.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

let chosen: SpeechSynthesisVoice | null | undefined

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosen !== undefined && chosen !== null) return chosen
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  const spanish = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('es-es'))
  const pool = spanish.length ? spanish : voices.filter((v) => v.lang.toLowerCase().startsWith('es'))
  // Las voces «mejoradas» o «premium» suenan mucho más naturales, si están.
  chosen =
    pool.find((v) => /premium|mejorad|enhanced|natural|neural/i.test(v.name)) ??
    pool.find((v) => v.localService) ??
    pool[0] ??
    null
  return chosen
}

/** Texto apto para leer: sin viñetas ni saltos que la voz lee raro. */
export function speakable(text: string): string {
  return text
    .replace(/^\s*•\s*/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Desbloquea la voz en iOS: la primera lectura tiene que salir de un toque.
 * Llamarlo dentro del gesto que abre el modo voz.
 */
export function primeSpeech(): void {
  if (!canSpeak()) return
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch {
    // Sin voz: el modo voz sigue funcionando, solo que sin leer.
  }
}

/** Lee el texto. Devuelve una función para cortarlo. `onEnd` se llama una vez. */
export function speak(text: string, onEnd?: () => void): () => void {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.clearTimeout(fallback)
    onEnd?.()
  }
  const clean = speakable(text)
  // Safari a veces no avisa del final: tope por longitud.
  const fallback = window.setTimeout(finish, 2500 + clean.split(' ').length * 520)
  if (!canSpeak() || !clean) {
    window.clearTimeout(fallback)
    queueMicrotask(finish)
    return () => {}
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = 'es-ES'
  const voice = pickVoice()
  if (voice) u.voice = voice
  u.rate = 1.04
  u.onend = finish
  u.onerror = finish
  synth.speak(u)
  return () => {
    synth.cancel()
    finish()
  }
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
}
