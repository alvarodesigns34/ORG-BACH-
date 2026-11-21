/**
 * Las ondas del modo estudio: qué bandas hay y con qué tonos se generan.
 * Datos puros (sin audio) para poder probarlos fuera del navegador; el
 * sonido lo hace `soundscape.ts`.
 */

export type WaveId = 'theta' | 'alfa' | 'beta' | 'gamma'
export type WaveMode = 'isocronico' | 'binaural'

/**
 * Las cuatro bandas habituales. `beat` es la frecuencia del pulso (o la
 * diferencia entre oídos, en binaural); `carrier`, el tono que la lleva:
 * grave para las lentas, algo más alto para las rápidas, que con un tono
 * grave se oirían como un zumbido áspero.
 */
export const WAVES: { id: WaveId; label: string; beat: number; carrier: number; hint: string }[] = [
  { id: 'theta', label: 'Theta', beat: 6, carrier: 180, hint: 'Calma' },
  { id: 'alfa', label: 'Alfa', beat: 10, carrier: 200, hint: 'Relajado y atento' },
  { id: 'beta', label: 'Beta', beat: 16, carrier: 220, hint: 'Concentración' },
  { id: 'gamma', label: 'Gamma', beat: 40, carrier: 280, hint: 'Atención intensa' },
]

export function waveSpec(id: WaveId) {
  return WAVES.find((w) => w.id === id) ?? WAVES[2]
}
