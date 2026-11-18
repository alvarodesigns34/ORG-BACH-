import { useEffect, useRef, useState } from 'react'

import type { LatLon } from '@/domain/flights'
import type { FlightMap, MapLookOptions, MapStatus } from './flightMap'
import { prewarmStudyMap } from './prewarm'

export function useStudyMap(
  enabled: boolean,
  look: MapLookOptions,
  center: LatLon,
  zoom: number,
  onUserMove: () => void,
) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<FlightMap | null>(null)
  const [status, setStatus] = useState<MapStatus>('cargando')
  const [generation, setGeneration] = useState(0)
  const options = useRef({ look, center, zoom, onUserMove })
  options.current = { look, center, zoom, onUserMove }

  useEffect(() => {
    const node = container.current
    setMap(null)
    if (!enabled || !node) return

    let disposed = false
    let instance: FlightMap | undefined
    let observer: ResizeObserver | undefined
    setStatus('cargando')
    // La descarga empieza ya (o ya terminó en reposo, desde Inicio); solo se
    // aplaza crear el mapa.
    void prewarmStudyMap(true)

    // Deja pintar primero el reloj y los controles. MapLibre y su CSS se
    // descargan y evalúan en un bloque independiente de la vista de estudio.
    const start = window.setTimeout(() => {
      void import('./flightMap').then(({ FlightMap }) => {
        if (disposed) return
        const initial = options.current
        instance = new FlightMap(node, initial.look, initial.center, initial.zoom, setStatus)
        instance.onUserMove = () => options.current.onUserMove()
        observer = new ResizeObserver(() => instance?.resize())
        observer.observe(node)
        setMap(instance)
      }).catch(() => {
        if (!disposed) setStatus('no_disponible')
      })
    }, 120)

    return () => {
      disposed = true
      window.clearTimeout(start)
      observer?.disconnect()
      instance?.destroy()
      node.replaceChildren()
      node.style.opacity = '0'
    }
  }, [enabled, generation])

  useEffect(() => {
    try {
      map?.setLook(look)
    } catch {
      setStatus('no_disponible')
    }
  }, [map, look])

  return { container, map: enabled ? map : null, status, retry: () => setGeneration((n) => n + 1) }
}
