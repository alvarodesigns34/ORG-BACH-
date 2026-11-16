import type { StudyPrefs } from './prefs'
import {
  playSound,
  preloadChimes,
  setAudioMode,
  setVolume,
  startCarrier,
  stopCarrier,
  stopSound,
  unlockAudio,
} from './soundscape'

type AudioPrefs = Pick<StudyPrefs, 'sound' | 'volume' | 'lockCard'>

/** Con ambiente, o si se pidió expresamente, el vuelo sale en la pantalla de bloqueo. */
export function wantsLockCard(prefs: Pick<StudyPrefs, 'sound' | 'lockCard'>): boolean {
  return prefs.sound !== 'ninguno' || prefs.lockCard
}

/**
 * Pone en marcha el audio de un vuelo según las preferencias. Hay que
 * llamarlo dentro de un toque (despegar, cambiar de ambiente, el primer toque
 * al volver a la app): Safari no deja arrancar audio de otra forma.
 *
 * Con «Silencio» y sin tarjeta, la app se queda en modo `ambient`: los avisos
 * se mezclan con tu música en vez de cortarla, y no hay audio portador.
 */
export function beginFlightAudio(prefs: AudioPrefs, { ambient = true } = {}): void {
  const card = wantsLockCard(prefs)
  setAudioMode(card ? 'playback' : 'ambient')
  unlockAudio()
  setVolume(prefs.volume)
  preloadChimes()
  if (card) startCarrier()
  else stopCarrier()
  if (prefs.sound === 'ninguno') stopSound()
  else if (ambient) playSound(prefs.sound)
}

/** Fin del vuelo: el ambiente se apaga y la tarjeta desaparece. */
export function endFlightAudio(): void {
  stopSound()
  stopCarrier()
}
