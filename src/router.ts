/**
 * Enrutado por hash.
 *
 * Una aplicación local de una sola persona no necesita react-router: el hash
 * funciona sin servidor, sobrevive a recargar la página y permite enlazar a
 * una vista concreta ('#/tareas?vista=atrasadas') desde una alerta.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

export type RouteId =
  | 'inicio'
  | 'tareas'
  | 'calendario'
  | 'estudio'
  | 'asignaturas'
  | 'notas'
  | 'examenes'
  | 'estadisticas'
  | 'objetivos'
  | 'ajustes'

export const ROUTE_IDS: RouteId[] = [
  'inicio',
  'tareas',
  'calendario',
  'estudio',
  'asignaturas',
  'notas',
  'examenes',
  'estadisticas',
  'objetivos',
  'ajustes',
]

export interface Route {
  id: RouteId
  params: URLSearchParams
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [path, query = ''] = clean.split('?')
  const id = ROUTE_IDS.includes(path as RouteId) ? (path as RouteId) : 'inicio'
  return { id, params: new URLSearchParams(query) }
}

export function hrefFor(id: RouteId, params?: Record<string, string>): string {
  const query = params ? new URLSearchParams(params).toString() : ''
  return `#/${id}${query ? `?${query}` : ''}`
}

export function studyHref({ minutes = 25, subjectId, taskId, examId }: {
  minutes?: number
  subjectId?: string
  taskId?: string
  examId?: string
} = {}): string {
  return hrefFor('estudio', {
    despegar: String(minutes),
    ...(subjectId ? { asignatura: subjectId } : {}),
    ...(taskId ? { tarea: taskId } : {}),
    ...(examId ? { examen: examId } : {}),
  })
}

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const route = useMemo(() => parse(hash), [hash])

  const navigate = useCallback((id: RouteId, params?: Record<string, string>, replace = false) => {
    const hash = hrefFor(id, params)
    if (hash === window.location.hash) return
    if (replace) {
      window.history.replaceState(window.history.state, '', hash)
      window.dispatchEvent(new Event('hashchange'))
    } else window.location.hash = hash
  }, [])

  return { route, navigate }
}
