/**
 * Script de Scriptable para el widget pequeño de «Tareas de hoy».
 *
 * Se genera con la dirección de la función y la llave ya puestas, para que
 * instalarlo sea copiar y pegar. Estética como el widget del Tiempo: fondo en
 * degradado, cifra grande y una lista corta; claro y oscuro.
 */

export const APP_TASKS_URL = 'https://alvarodesigns34.github.io/ORG-BACH-/#/tareas'

export function scriptableScript(endpoint: string, key: string): string {
  return `// Órbita · Tareas de hoy (widget pequeño)
// Llave de solo lectura: se revoca en Órbita → Ajustes → Widget.
// icon-color: deep-blue; icon-glyph: check-circle;

const ENDPOINT = ${JSON.stringify(endpoint)}
const KEY = ${JSON.stringify(key)}
const OPEN = ${JSON.stringify(APP_TASKS_URL)}

// Colores de asignatura de Órbita (tonos claros, legibles sobre el azul).
const SUBJECT = {
  sky: '#8fcbff', sage: '#9be0a6', amber: '#ffd27a', terracotta: '#ffab95',
  plum: '#e7a8f0', teal: '#86e6dc', indigo: '#c3c6ff', moss: '#d7e886',
  clay: '#f0c2a6', slate: '#c9d3df',
}
const WHITE = Color.white()
const SOFT = new Color('#ffffff', 0.78)
const FAINT = new Color('#ffffff', 0.6)
const LATE = new Color('#ffc2ad')

const pad = (n) => String(n).padStart(2, '0')
const d = new Date()
const today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
const now = pad(d.getHours()) + ':' + pad(d.getMinutes())

const fm = FileManager.local()
const cachePath = fm.joinPath(fm.documentsDirectory(), 'orbita-widget.json')

async function load() {
  const url = ENDPOINT + '?today=' + today + '&now=' + encodeURIComponent(now) + '&offset=' + d.getTimezoneOffset()
  try {
    const req = new Request(url)
    req.headers = { 'x-widget-key': KEY }
    req.timeoutInterval = 12
    const data = await req.loadJSON()
    if (req.response.statusCode !== 200) return { error: data && data.error ? data.error : 'Sin datos' }
    fm.writeString(cachePath, JSON.stringify({ today, data }))
    return { data }
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      const cached = JSON.parse(fm.readString(cachePath))
      if (cached.today === today) return { data: cached.data, stale: true }
    }
    return { error: 'Sin conexión' }
  }
}

function text(stack, value, font, color, lines = 1) {
  const t = stack.addText(value)
  t.font = font
  t.textColor = color
  t.lineLimit = lines
  return t
}

function build(result) {
  const w = new ListWidget()
  const g = new LinearGradient()
  g.colors = [
    Color.dynamic(new Color('#5b7cfa'), new Color('#2b3480')),
    Color.dynamic(new Color('#3c4fd6'), new Color('#151a45')),
  ]
  g.locations = [0, 1]
  w.backgroundGradient = g
  w.setPadding(14, 15, 13, 13)
  w.url = OPEN
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)

  text(w, 'Tareas de hoy', Font.semiboldSystemFont(13), WHITE)

  if (result.error) {
    w.addSpacer()
    text(w, result.error, Font.semiboldSystemFont(14), WHITE, 2)
    text(w, 'Toca para abrir Órbita', Font.regularSystemFont(11), SOFT)
    return w
  }

  const s = result.data
  if (s.pending === 0) {
    const big = text(w, '✓', Font.boldRoundedSystemFont(38), WHITE)
    big.minimumScaleFactor = 0.8
    w.addSpacer()
    text(w, s.done > 0 ? 'Todo hecho' : 'Nada para hoy', Font.semiboldSystemFont(14), WHITE)
    text(w, s.done > 0 ? s.done + (s.done === 1 ? ' tarea completada' : ' tareas completadas') : 'Día libre', Font.regularSystemFont(12), SOFT)
    return w
  }

  text(w, String(s.pending), Font.semiboldRoundedSystemFont(40), WHITE)
  w.addSpacer(2)

  const shown = s.tasks.slice(0, 3)
  for (const t of shown) {
    const row = w.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.spacing = 6
    const dot = row.addText('●')
    dot.font = Font.systemFont(8)
    dot.textColor = new Color(SUBJECT[t.color] || '#ffffff', t.color ? 1 : 0.7)
    text(row, t.title, Font.mediumSystemFont(12.5), t.late ? LATE : WHITE)
    w.addSpacer(2.5)
  }

  w.addSpacer()
  const rest = s.pending - shown.length
  const foot = []
  if (rest > 0) foot.push('+' + rest + ' más')
  if (s.done > 0) foot.push(s.done + (s.done === 1 ? ' hecha' : ' hechas'))
  if (result.stale) foot.push('sin conexión')
  if (foot.length) text(w, foot.join(' · '), Font.regularSystemFont(11), FAINT)
  return w
}

const widget = build(await load())
if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentSmall()
Script.complete()
`
}
