/**
 * Identificadores locales. `crypto.randomUUID` no existe en contextos no
 * seguros (una IP en la red local, por ejemplo), así que hay respaldo.
 */

export function newId(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${raw}` : raw
}
