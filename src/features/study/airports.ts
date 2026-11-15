import { airportFromRow, type Airport, type AirportRow } from '@/domain/flights'
import rows from './airports.json'

/** Los ~3200 aeropuertos con vuelos regulares, ya convertidos. */
export const AIRPORTS: Airport[] = (rows as AirportRow[]).map(airportFromRow)

export const AIRPORT_BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]))

/** Busca por ciudad o código, sin tildes ni mayúsculas. */
export function searchAirports(query: string, limit = 30): Airport[] {
  const q = fold(query.trim())
  if (!q) return []
  const exact = q.length === 3 ? AIRPORTS.filter((a) => a.iata.toLowerCase() === q) : []
  const byCity = AIRPORTS.filter(
    (a) => !exact.includes(a) && fold(a.city).startsWith(q),
  ).sort((a, b) => Number(b.major) - Number(a.major) || a.city.localeCompare(b.city, 'es'))
  const contains = AIRPORTS.filter(
    (a) => !exact.includes(a) && !byCity.includes(a) && fold(a.city).includes(q),
  )
  return [...exact, ...byCity, ...contains].slice(0, limit)
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
