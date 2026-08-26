/**
 * Paleta de asignaturas.
 *
 * Los colores viven en CSS (`--sub-*`), no aquí: así cambian solos con el tema
 * y este módulo solo guarda las claves. El color de una asignatura identifica,
 * no decora, y siempre va acompañado del nombre o la abreviatura.
 */

import type { SubjectColor } from './types'

export const SUBJECT_COLORS: { id: SubjectColor; label: string }[] = [
  { id: 'indigo', label: 'Índigo' },
  { id: 'sky', label: 'Azul' },
  { id: 'teal', label: 'Verde azulado' },
  { id: 'sage', label: 'Salvia' },
  { id: 'moss', label: 'Musgo' },
  { id: 'amber', label: 'Ámbar' },
  { id: 'clay', label: 'Arcilla' },
  { id: 'terracotta', label: 'Terracota' },
  { id: 'plum', label: 'Ciruela' },
  { id: 'slate', label: 'Pizarra' },
]

const ORDER: SubjectColor[] = SUBJECT_COLORS.map((c) => c.id)

/** Color de trazo/texto de la asignatura. */
export function colorVar(color: SubjectColor): string {
  return `var(--sub-${color})`
}

/** Fondo suave a juego, para etiquetas y superficies tintadas. */
export function quietVar(color: SubjectColor): string {
  return `var(--sub-${color}-quiet)`
}

/** Siguiente color libre al crear una asignatura, para no repetir de entrada. */
export function nextColor(used: SubjectColor[]): SubjectColor {
  const free = ORDER.find((c) => !used.includes(c))
  return free ?? ORDER[used.length % ORDER.length]
}

/**
 * Abreviatura de una asignatura cuando no se ha definido una a mano.
 * 'Matemáticas' → 'MAT', 'Historia del Mundo Contemporáneo' → 'HMC'.
 */
export function deriveShortName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .filter((w) => !['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e'].includes(w.toLowerCase()))

  if (words.length === 0) return name.slice(0, 3).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
