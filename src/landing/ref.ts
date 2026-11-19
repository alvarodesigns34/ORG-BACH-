/** Fuente de una visita (`?ref=`), sin dependencias para poder probarla. */

/** Normaliza la fuente: minúsculas, letras, números y guiones; máx. 40. */
export function cleanRef(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(v) ? v : null
}
