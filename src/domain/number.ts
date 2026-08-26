/**
 * Lectura de números escritos a mano.
 *
 * En España el separador decimal es la coma, y es lo que un alumno teclea sin
 * pensar: «8,5». `Number.parseFloat('8,5')` devuelve 8, no 8,5 — se come los
 * decimales en silencio, que es la peor forma de fallar en una aplicación de
 * notas. Todo lo que venga de un campo de texto pasa por aquí.
 */

/** Convierte lo tecleado en número. Devuelve NaN si no hay nada aprovechable. */
export function parseDecimal(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (value === null || value === undefined) return Number.NaN

  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return Number.NaN
  return Number.parseFloat(normalized)
}

/** Igual que `parseDecimal`, pero con un valor de respaldo si no es un número. */
export function parseDecimalOr(value: string | number | null | undefined, fallback: number): number {
  const parsed = parseDecimal(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Prepara un número para meterlo en un campo de texto.
 *
 * Con coma, porque es lo que el alumno espera ver y lo que volverá a escribir
 * si lo corrige. Sin ceros de relleno: '9' se queda en '9', no en '9,00'.
 */
export function toDecimalInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return String(value).replace('.', ',')
}

/**
 * Deja solo lo que puede formar parte de un número mientras se escribe.
 *
 * Se aplica en cada pulsación, así que tiene que tolerar estados intermedios:
 * «8,» es válido mientras el alumno sigue tecleando, aunque todavía no sea un
 * número completo.
 */
export function sanitizeNumericInput(raw: string): string {
  let cleaned = raw.replace(/[^\d.,-]/g, '')

  // El signo menos solo tiene sentido al principio.
  const negative = cleaned.startsWith('-')
  cleaned = cleaned.replace(/-/g, '')
  if (negative) cleaned = `-${cleaned}`

  // Un único separador decimal: el primero que se escriba.
  const firstSeparator = cleaned.search(/[.,]/)
  if (firstSeparator !== -1) {
    const head = cleaned.slice(0, firstSeparator + 1)
    const tail = cleaned.slice(firstSeparator + 1).replace(/[.,]/g, '')
    cleaned = head + tail
  }

  return cleaned
}
