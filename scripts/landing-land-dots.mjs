// Genera src/landing/landDots.ts: la máscara de tierra del globo de puntos de
// la web de presentación, como bits de una rejilla fija (1 bit por punto
// candidato, en base64). Datos: Natural Earth (dominio público) a través de
// world-atlas (ISC). No es dependencia del proyecto; para regenerar:
//   npm i --no-save world-atlas@2 topojson-client@3 && node scripts/landing-land-dots.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(process.cwd() + '/')
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'))
const { feature } = require('topojson-client')
const land = feature(topo, topo.objects.land)

export const ROWS = 140
const rings = []
for (const f of land.features ?? [land]) {
  const g = f.geometry ?? f
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const poly of polys) {
    poly.forEach((ring, k) => {
      let minX = 180, maxX = -180, minY = 90, maxY = -90
      for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
      rings.push({ ring, hole: k > 0, minX, maxX, minY, maxY })
    })
  }
}
const inside = (x, y, ring) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const isLand = (x, y) => {
  let n = 0
  for (const r of rings) if (x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY && inside(x, y, r.ring)) n++
  return n % 2 === 1
}
const bits = []
let count = 0
for (let i = 0; i < ROWS; i++) {
  const lat = -90 + ((i + 0.5) * 180) / ROWS
  const n = Math.max(1, Math.round(2 * ROWS * Math.cos((lat * Math.PI) / 180)))
  for (let j = 0; j < n; j++) {
    const lon = -180 + ((j + 0.5) * 360) / n
    const on = lat > -60 && isLand(lon, lat)
    bits.push(on)
    if (on) count++
  }
}
const bytes = new Uint8Array(Math.ceil(bits.length / 8))
bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7) })
const b64 = Buffer.from(bytes).toString('base64')
writeFileSync('src/landing/landDots.ts', `// Generado por scripts/landing-land-dots.mjs (Natural Earth, dominio público).
// ${count} puntos de tierra en una rejilla de ${ROWS} filas. No editar a mano.
export const LAND_ROWS = ${ROWS}
export const LAND_BITS = '${b64}'
`)
console.log(bits.length, 'candidatos,', count, 'de tierra,', b64.length, 'bytes en base64')
