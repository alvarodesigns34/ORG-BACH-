import type { StudyPrefs } from './prefs'
import {
  playSound,
  playWaves,
  stopWaves,
  preloadChimes,
  setAudioMode,
  setVolume,
  startCarrier,
  stopCarrier,
  stopSound,
  unlockAudio,
} from './soundscape'

type AudioPrefs = Pick<StudyPrefs, 'sound' | 'volume' | 'lockCard' | 'waves' | 'waveMode' | 'waveLevel'>

/** Con ambiente, o si se pidió expresamente, el vuelo sale en la pantalla de bloqueo. */
export function wantsLockCard(prefs: Pick<StudyPrefs, 'sound' | 'lockCard' | 'waves'>): boolean {
  return prefs.sound !== 'ninguno' || prefs.waves !== 'ninguna' || prefs.lockCard
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
  window.clearTimeout(previewTimer)
  previewTimer = 0
  const card = wantsLockCard(prefs)
  setAudioMode(card ? 'playback' : 'ambient')
  unlockAudio()
  setVolume(prefs.volume)
  preloadChimes()
  if (card) startCarrier()
  else stopCarrier()
  if (prefs.sound === 'ninguno') stopSound()
  else if (ambient) playSound(prefs.sound)
  if (prefs.waves === 'ninguna') stopWaves()
  else if (ambient) playWaves(prefs.waves, prefs.waveMode, prefs.waveLevel)
}

/** Fin del vuelo: el ambiente se apaga y la tarjeta desaparece. */
export function endFlightAudio(): void {
  stopSound()
  stopWaves()
  stopCarrier()
}

let previewTimer = 0
/** Duración de la escucha previa fuera del vuelo. */
const PREVIEW_MS = 7000

/**
 * Escucha previa al elegir ambiente u ondas fuera del vuelo (en la entrada o
 * la reserva): suena unos segundos y se apaga sola. Si despegas antes, el
 * vuelo la sustituye sin corte. Hay que llamarla dentro del toque.
 */
export function previewAudio(prefs: AudioPrefs): void {
  window.clearTimeout(previewTimer)
  if (prefs.sound === 'ninguno' && prefs.waves === 'ninguna') {
    stopSound()
    stopWaves()
    return
  }
  setAudioMode('ambient')
  unlockAudio()
  setVolume(prefs.volume)
  if (prefs.sound === 'ninguno') stopSound()
  else playSound(prefs.sound)
  if (prefs.waves === 'ninguna') stopWaves()
  else playWaves(prefs.waves, prefs.waveMode, prefs.waveLevel)
  previewTimer = window.setTimeout(() => {
    previewTimer = 0
    stopSound()
    stopWaves()
  }, PREVIEW_MS)
}
