/**
 * Estilos de mapa del modo estudio, hechos a mano.
 *
 * Los estilos de serie (Positron, Dark) traen carreteras, vías de tren,
 * rótulos de calles y pueblos: para estudiar es ruido. Estos usan las mismas
 * teselas de OpenFreeMap pero dibujan solo lo que importa —tierra, agua,
 * bosques, fronteras y, si se quiere, los nombres de países y grandes
 * ciudades—, con colores pensados para que las hojas de cristal se separen
 * bien del mapa.
 *
 * - Minimalista: vectorial, claro u oscuro.
 * - Relieve: el sombreado de Natural Earth (montañas y mares con volumen).
 * - Satélite: Sentinel-2 sin nubes (EOX), uso no comercial con atribución.
 */

import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

export type MapKind = 'minimal' | 'relieve' | 'satelite'
export type MapTone = 'light' | 'dark'

export interface MapLookOptions {
  kind: MapKind
  tone: MapTone
  labels: boolean
}

const NAME: ExpressionSpecification = [
  'coalesce',
  ['get', 'name:es'],
  ['get', 'name:latin'],
  ['get', 'name'],
]

interface Palette {
  land: string
  water: string
  wood: string
  ice: string
  border: string
  label: string
  labelStrong: string
  halo: string
  waterLabel: string
}

const PALETTE: Record<MapTone, Palette> = {
  // Tierra gris cálida (no blanca): las hojas blancas se recortan contra ella.
  light: {
    land: '#e6e3dc',
    water: '#aec6da',
    wood: '#d5dccb',
    ice: '#f5f6f7',
    border: '#a19c91',
    label: '#6b6862',
    labelStrong: '#3d3b37',
    halo: 'rgba(230, 227, 220, 0.9)',
    waterLabel: '#6a87a1',
  },
  // Noche con contraste: tierra gris pizarra y mar azul noche bien
  // distintos (antes los dos eran casi negros y no se distinguía la costa).
  dark: {
    land: '#2e3036',
    water: '#0d1b2b',
    wood: '#30362f',
    ice: '#3a3c42',
    border: '#6b6d76',
    label: '#a3a4ad',
    labelStrong: '#d2d3da',
    halo: 'rgba(46, 48, 54, 0.92)',
    waterLabel: '#5f82a3',
  },
}

const ATTRIBUTION_OSM =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

export function buildStyle({ kind, tone, labels }: MapLookOptions): StyleSpecification {
  const p = PALETTE[tone]
  const onImagery = kind === 'satelite'

  const sources: StyleSpecification['sources'] = {
    omt: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: ATTRIBUTION_OSM,
    },
  }
  if (kind === 'relieve') {
    sources.relieve = {
      type: 'raster',
      tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 6,
      attribution: 'Natural Earth',
    }
  }
  if (kind === 'satelite') {
    sources.satelite = {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 14,
      attribution:
        '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> por EOX (datos Copernicus Sentinel 2023)',
    }
  }

  const layers: StyleSpecification['layers'] = [
    { id: 'land', type: 'background', paint: { 'background-color': p.land } },
  ]

  if (kind === 'minimal') {
    layers.push(
      {
        id: 'wood',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]],
        paint: {
          'fill-color': p.wood,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.35, 8, 0.6],
        },
      },
      {
        id: 'ice',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'ice'],
        paint: { 'fill-color': p.ice, 'fill-opacity': 0.8 },
      },
    )
  }

  if (kind === 'relieve') {
    layers.push({
      id: 'relieve',
      type: 'raster',
      source: 'relieve',
      paint:
        tone === 'dark'
          ? { 'raster-brightness-max': 0.5, 'raster-saturation': -0.35, 'raster-contrast': 0.1 }
          : { 'raster-saturation': -0.15, 'raster-brightness-min': 0.08 },
    })
  }

  if (kind === 'satelite') {
    layers.push({
      id: 'satelite',
      type: 'raster',
      source: 'satelite',
      paint: tone === 'dark' ? { 'raster-brightness-max': 0.78 } : {},
    })
  }

  if (kind !== 'satelite') {
    layers.push({
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: {
        'fill-color': p.water,
        // Sobre el relieve, el agua solo aparece al acercarse (donde el
        // sombreado ya no tiene detalle).
        'fill-opacity':
          kind === 'relieve' ? ['interpolate', ['linear'], ['zoom'], 5, 0, 6.5, 1] : 1,
      },
    })
  }

  layers.push({
    id: 'border',
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': onImagery ? 'rgba(255,255,255,0.45)' : p.border,
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 1, 10, 1.6],
      'line-opacity': kind === 'relieve' ? 0.6 : 0.9,
    },
  })

  if (labels) {
    const text = onImagery ? '#ffffff' : p.label
    const strong = onImagery ? '#ffffff' : p.labelStrong
    const halo = onImagery ? 'rgba(0,0,0,0.55)' : p.halo
    layers.push(
      {
        id: 'mar',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': NAME,
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13],
          'text-letter-spacing': 0.12,
          'text-max-width': 6,
        },
        paint: {
          'text-color': onImagery ? 'rgba(255,255,255,0.75)' : p.waterLabel,
          'text-halo-color': onImagery ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)',
          'text-halo-width': 1,
        },
      },
      {
        id: 'ciudad',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 3,
        // Solo capitales y ciudades grandes; pueblos, a partir de cerca.
        filter: [
          'any',
          ['all', ['==', ['get', 'class'], 'city'], ['<=', ['get', 'rank'], 6]],
          ['all', ['==', ['get', 'class'], 'town'], ['>=', ['zoom'], 8]],
        ],
        layout: {
          'text-field': NAME,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 12, 10, 15],
          'text-max-width': 8,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': text, 'text-halo-color': halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'pais',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        maxzoom: 8,
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': NAME,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 14],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.14,
          'text-max-width': 7,
        },
        paint: {
          'text-color': strong,
          'text-opacity': onImagery ? 0.95 : 0.75,
          'text-halo-color': halo,
          'text-halo-width': 1.4,
        },
      },
    )
  }

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources,
    layers,
  }
}

/**
 * Color con el que el sistema debe fundir la barra de estado sobre el mapa.
 * iPadOS/iOS tiñen el borde superior de las apps web con el «theme-color»;
 * con el gris claro de la interfaz salía una mancha blanca sobre el mapa.
 */
export function mapEdgeColor({ kind, tone }: Pick<MapLookOptions, 'kind' | 'tone'>): string {
  if (kind === 'satelite') return '#1d2a33'
  return PALETTE[tone].land
}
