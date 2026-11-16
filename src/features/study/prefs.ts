import { useSyncExternalStore } from 'react'

import type { MapKind } from './mapStyle'
import type { SoundId } from './soundscape'

/** Cómo se reparten los descansos de un vuelo. */
export type LayoverMode = 'no' | 'mitad' | 'pomodoro'

/**
 * Preferencias del modo estudio. Son de este dispositivo (como el tema): en
 * el iPad quizá quieras satélite y lluvia, y en el ordenador, otra cosa.
 *
 * Viven en un almacén compartido, no en el estado de un componente: las leen
 * a la vez la vista de estudio y el controlador del vuelo, que sigue vivo
 * cuando sales de ella.
 */
export interface StudyPrefs {
  map: MapKind
  labels: boolean
  /** Mapa como esfera (3D) o plano (2D). */
  globe: boolean
  sound: SoundId | 'ninguno'
  volume: number
  keepAwake: boolean
  minutes: number
  /** Minutos de cada descanso. */
  layover: number
  layoverMode: LayoverMode
  /** Pomodoro: minutos de estudio entre descansos. */
  focus: number
  /**
   * Con «Silencio», mantener igualmente la tarjeta del vuelo en la pantalla
   * de bloqueo (reproduce un audio mudo: corta la música de otras apps).
   */
  lockCard: boolean
  /** Avisar con una notificación al aterrizar y al terminar una escala. */
  alerts: boolean
}

const DEFAULTS: StudyPrefs = {
  map: 'minimal',
  labels: true,
  globe: true,
  sound: 'cabina',
  volume: 0.7,
  keepAwake: true,
  minutes: 45,
  layover: 10,
  layoverMode: 'no',
  focus: 50,
  lockCard: false,
  alerts: true,
}

const KEY = 'org-bach:estudio'

function read(): StudyPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<StudyPrefs>
    const prefs = { ...DEFAULTS, ...raw }
    // Antes solo existía «escala de N minutos a mitad» (0 = ninguna).
    if (raw.layoverMode === undefined && typeof raw.layover === 'number') {
      prefs.layoverMode = raw.layover > 0 ? 'mitad' : 'no'
      if (!(raw.layover > 0)) prefs.layover = DEFAULTS.layover
    }
    return prefs
  } catch {
    return DEFAULTS
  }
}

let current: StudyPrefs | null = null
const listeners = new Set<() => void>()

export function getStudyPrefs(): StudyPrefs {
  if (!current) current = typeof window === 'undefined' ? DEFAULTS : read()
  return current
}

export function setStudyPrefs(patch: Partial<StudyPrefs>): void {
  current = { ...getStudyPrefs(), ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Sin almacenamiento: dura lo que la sesión.
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useStudyPrefs(): [StudyPrefs, (patch: Partial<StudyPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getStudyPrefs, () => DEFAULTS)
  return [prefs, setStudyPrefs]
}

/** Las escalas que llevará un vuelo de `minutes` con estas preferencias. */
export function layoverPlan(
  prefs: Pick<StudyPrefs, 'layoverMode' | 'layover' | 'focus'>,
  minutes: number,
): { layoverMinutes?: number; layoverEvery?: number } {
  if (prefs.layoverMode === 'mitad' && minutes >= 40 && prefs.layover > 0) {
    return { layoverMinutes: prefs.layover }
  }
  if (prefs.layoverMode === 'pomodoro' && prefs.layover > 0 && prefs.focus > 0) {
    return { layoverMinutes: prefs.layover, layoverEvery: prefs.focus }
  }
  return {}
}
