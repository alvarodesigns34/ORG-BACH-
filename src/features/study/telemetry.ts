/**
 * Telemetría de juego del vuelo: fase y altitud según el avance. No es real
 * (el avión es imaginario), pero sigue el perfil de un vuelo de verdad.
 */

/** Fase del vuelo según el avance: como la pantalla de un avión de verdad. */
export function flightPhase(progress: number): 'Despegue' | 'Ascenso' | 'Crucero' | 'Descenso' | 'Aproximación' {
  if (progress < 0.03) return 'Despegue'
  if (progress < 0.12) return 'Ascenso'
  if (progress < 0.85) return 'Crucero'
  if (progress < 0.96) return 'Descenso'
  return 'Aproximación'
}

/**
 * Altitud de juego (m): sube hasta el crucero y baja al final. Los vuelos
 * cortos no llegan tan alto, como pasa de verdad.
 */
export function flightAltitude(progress: number, distanceKm: number): number {
  const cruise = Math.round(Math.min(11_600, Math.max(6_100, 4_800 + distanceKm * 3.2)) / 100) * 100
  const p = Math.min(1, Math.max(0, progress))
  const up = Math.min(1, p / 0.12)
  const down = Math.min(1, (1 - p) / 0.15)
  const ease = (x: number) => 1 - Math.pow(1 - x, 2)
  return Math.round((cruise * Math.min(ease(up), ease(down))) / 10) * 10
}
