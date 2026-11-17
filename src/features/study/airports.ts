import { airportFromRow, type Airport, type AirportRow } from '@/domain/flights'
import rows from './airports.json'

/** Los ~3200 aeropuertos con vuelos regulares, ya convertidos. */
export const AIRPORTS: Airport[] = (rows as AirportRow[]).map(airportFromRow)

export const AIRPORT_BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]))

let searchIndex: { airport: Airport; city: string }[] | undefined

/** Busca por ciudad o código, sin tildes ni mayúsculas. */
export function searchAirports(query: string, limit = 30): Airport[] {
  const q = fold(query.trim())
  if (!q) return []
  searchIndex ??= AIRPORTS.map((airport) => ({ airport, city: fold(airport.city) }))
  const exact = q.length === 3 ? AIRPORT_BY_IATA.get(q.toUpperCase()) : undefined
  const prefixes: Airport[] = []
  const contains: Airport[] = []
  for (const { airport, city } of searchIndex) {
    if (airport === exact) continue
    if (city.startsWith(q)) prefixes.push(airport)
    else if (city.includes(q) && contains.length < limit) contains.push(airport)
  }
  prefixes.sort((a, b) => Number(b.major) - Number(a.major) || a.city.localeCompare(b.city, 'es'))
  return [...(exact ? [exact] : []), ...prefixes, ...contains].slice(0, limit)
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
