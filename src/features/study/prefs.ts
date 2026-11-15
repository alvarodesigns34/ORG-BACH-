import { useCallback, useState } from 'react'

import type { MapKind } from './mapStyle'
import type { SoundId } from './soundscape'

/**
 * Preferencias del modo estudio. Son de este dispositivo (como el tema): en
 * el iPad quizá quieras satélite y lluvia, y en el ordenador, otra cosa.
 */
export interface StudyPrefs {
  map: MapKind
  labels: boolean
  sound: SoundId | 'ninguno'
  volume: number
  keepAwake: boolean
  minutes: number
  layover: number
}

const DEFAULTS: StudyPrefs = {
  map: 'minimal',
  labels: true,
  sound: 'cabina',
  volume: 0.55,
  keepAwake: true,
  minutes: 45,
  layover: 0,
}

const KEY = 'org-bach:estudio'

function read(): StudyPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<StudyPrefs>
    return { ...DEFAULTS, ...raw }
  } catch {
    return DEFAULTS
  }
}

export function useStudyPrefs(): [StudyPrefs, (patch: Partial<StudyPrefs>) => void] {
  const [prefs, setPrefs] = useState<StudyPrefs>(read)
  const update = useCallback((patch: Partial<StudyPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Sin almacenamiento: dura lo que la sesión.
      }
      return next
    })
  }, [])
  return [prefs, update]
}
