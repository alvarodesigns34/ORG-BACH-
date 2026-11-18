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
 *
 * Los dos se pueden ver como esfera (proyección «globe» de MapLibre) o
 * planos. En la esfera, el cielo lleva atmósfera y el espacio de alrededor
 * es noche estrellada (lo pinta el CSS del contenedor: `.study-map.is-globe`).
 */

import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

export const MAP_KINDS = ['minimal', 'relieve'] as const
export type MapKind = (typeof MAP_KINDS)[number]
export type MapTone = 'light' | 'dark'
export const MAP_LABEL_LAYERS = ['mar', 'ciudad', 'pais'] as const

export interface MapLookOptions {
  kind: MapKind
  tone: MapTone
  labels: boolean
  /** Esfera (3D) en vez de plano. */
  globe: boolean
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

/** Mar del relieve: azul más vivo, que case con los verdes y ocres. */
const RELIEF_WATER: Record<MapTone, string> = { light: '#9ccbea', dark: '#0e2236' }

const ATTRIBUTION_OSM =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

/** Descriptor (TileJSON) de las teselas vectoriales de OpenFreeMap. */
export const VECTOR_TILEJSON = 'https://tiles.openfreemap.org/planet'

export function buildStyle({ kind, tone, labels, globe }: MapLookOptions): StyleSpecification {
  const p = PALETTE[tone]

  const sources: StyleSpecification['sources'] = {
    omt: {
      type: 'vector',
      url: VECTOR_TILEJSON,
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
      // Natural Earth II ya trae los colores de la vegetación (verdes,
      // ocres del desierto, nieve): se realzan en vez de apagarlos.
      paint:
        tone === 'dark'
          ? { 'raster-brightness-max': 0.55, 'raster-saturation': -0.1, 'raster-contrast': 0.18 }
          : { 'raster-saturation': 0.18, 'raster-contrast': 0.08 },
    })
  }

  {
    layers.push({
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: {
        // Las teselas de relieve traen el mar en blanco: el agua vectorial lo
        // pinta de azul a cualquier zoom (antes el mar quedaba gris).
        'fill-color': kind === 'relieve' ? RELIEF_WATER[tone] : p.water,
        'fill-antialias': true,
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
      'line-color': p.border,
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 1, 10, 1.6],
      'line-opacity': kind === 'relieve' ? 0.6 : 0.9,
    },
  })

  {
    const text = p.label
    const strong = p.labelStrong
    const halo = p.halo
    const visibility = labels ? 'visible' : 'none'
    layers.push(
      {
        id: 'mar',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          visibility,
          'text-field': NAME,
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13],
          'text-letter-spacing': 0.12,
          'text-max-width': 6,
        },
        paint: {
          'text-color': p.waterLabel,
          'text-halo-color': 'rgba(0,0,0,0)',
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
          visibility,
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
          visibility,
          'text-field': NAME,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 14],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.14,
          'text-max-width': 7,
        },
        paint: {
          'text-color': strong,
          'text-opacity': 0.75,
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
    ...(globe
      ? {
          projection: { type: 'globe' },
          sky: SKY[tone],
        }
      : {}),
  }
}

/**
 * Cielo de la esfera. Desde lejos solo se ve la atmósfera (el halo que la
 * rodea); al inclinar la cámara en vuelo, el horizonte y el cielo de arriba.
 * La atmósfera se apaga al acercarse: a ras de suelo sería una neblina.
 */
/** El fondo del espacio alrededor de la esfera (ver `.is-globe` en study.css). */
export const SPACE_COLOR = '#03050c'

const SKY: Record<MapTone, NonNullable<StyleSpecification['sky']>> = {
  light: {
    'sky-color': '#6fa6e6',
    'horizon-color': '#dde9f6',
    'fog-color': '#e6e3dc',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.4,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 9, 0.35],
  },
  dark: {
    'sky-color': '#081631',
    'horizon-color': '#2b4f8c',
    'fog-color': '#121f33',
    'sky-horizon-blend': 0.55,
    'horizon-fog-blend': 0.35,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 9, 0.35],
  },
}

/**
 * Color con el que el sistema debe fundir la barra de estado sobre el mapa.
 * iPadOS/iOS tiñen el borde superior de las apps web con el «theme-color»;
 * con el gris claro de la interfaz salía una mancha blanca sobre el mapa.
 */
export function mapEdgeColor(
  { tone, globe }: Pick<MapLookOptions, 'tone' | 'globe'>,
  /**
   * Qué hay en el borde de arriba: el suelo, el cielo (cámara inclinada en
   * vuelo) o el espacio (la esfera entera, desde lejos).
   */
  edge: 'suelo' | 'cielo' | 'espacio' = 'suelo',
): string {
  if (globe && edge === 'espacio') return SPACE_COLOR
  if (globe && edge === 'cielo') return SKY[tone]['sky-color'] as string
  return PALETTE[tone].land
}
