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
  | 'asignaturas'
  | 'notas'
  | 'estadisticas'
  | 'estudio'
  | 'objetivos'
  | 'ajustes'

export const ROUTE_IDS: RouteId[] = [
  'inicio',
  'tareas',
  'calendario',
  'asignaturas',
  'notas',
  'estadisticas',
  'estudio',
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

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const route = useMemo(() => parse(hash), [hash])

  const navigate = useCallback((id: RouteId, params?: Record<string, string>) => {
    window.location.hash = hrefFor(id, params).slice(1)
  }, [])

  // Cambiar de sección debe empezar arriba: heredar el desplazamiento de la
  // vista anterior hace parecer que la nueva se ha cargado a medias.
  useEffect(() => {
    document.getElementById('contenido')?.scrollTo({ top: 0 })
  }, [route.id])

  return { route, navigate }
}
