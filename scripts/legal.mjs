// Genera las páginas públicas de los textos legales (public/legal/*.html) a
// partir de docs/legal/*.md, con un conversor mínimo (títulos, párrafos,
// listas, tablas, negrita y enlaces). Mismo patrón que plisé.
// Tras cambiar un texto:   node scripts/legal.mjs
// tests/legal.test.ts comprueba que las páginas están al día.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const PAGES = [
  { src: 'politica-privacidad.md', out: 'privacidad.html' },
  { src: 'condiciones-uso.md', out: 'condiciones.html' },
]

// Datos que aún no existen (marcadores de docs/legal). Mientras falten, la
// página publicada no enseña el marcador: dice que se publicará en breve.
// Cuando existan, ponerlos aquí (o por entorno) y volver a generar.
const CONTACT = process.env.CONTACT_EMAIL ?? ''
const SITE = (process.env.SITE_URL ?? 'https://alvarodesigns34.github.io/ORG-BACH-').replace(/\/$/, '')
const PUBLISHED = '19 de noviembre de 2026'
export const VERSION = '2026-11-19'

export function fillMarkers(md) {
  return md
    .replace('[FECHA DE PUBLICACIÓN]', PUBLISHED)
    .replace(/Versión \S*borrador\S*/g, `Versión ${VERSION}`)
    .replace(/\| \[CORREO_CONTACTO\] \|/g, `| ${CONTACT || 'Se publicará aquí en breve'} |`)
    .replace(/\[CORREO_CONTACTO\]/g, CONTACT || 'nuestro correo de contacto (lo publicaremos aquí en breve)')
    .replace(/\[DOMINIO\]/g, SITE)
    .replace(/\[(\d+)\]/g, '$1')
    // El anexo de pagos solo se publica al activar los pagos.
    .replace('[Anexo de pagos](pagos.html)', 'Anexo de pagos (se publicará al activar los pagos)')
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => `<a href="${url}">${text}</a>`)
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    // Marcadores pendientes ([CORREO_CONTACTO], [DOMINIO]…): resaltados.
    .replace(/\[([A-ZÁÉÍÓÚÑ_ ]{4,})\]/g, '<mark>[$1]</mark>')

export function toHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(rows[0])
      const body = rows.slice(2).map(cells)
      const th = head.every((c) => !c) ? '' : `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
      out.push(`<div class="table"><table>${th}<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (/^\s*(- |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\. /.test(line)
      const items = []
      while (i < lines.length && /^\s*(- |\d+\. )/.test(lines[i])) {
        const nested = /^\s{2,}(- |\d+\. )/.test(lines[i])
        const text = lines[i].replace(/^\s*(- |\d+\. )/, '')
        if (nested && items.length) (items[items.length - 1].sub ??= []).push(text)
        else items.push({ text })
        i++
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${tag}>`)
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#|\||\s*- |\s*\d+\. )/.test(lines[i])) para.push(lines[i++])
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }
  return out.join('\n')
}

export function page({ src }, md) {
  const title = /^#\s+(.*)$/m.exec(md)?.[1] ?? 'Órbita'
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="icon" href="../icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="legal.css">
</head>
<body>
<header><a class="brand" href="../?app"><img src="../icono.svg" alt="" width="26" height="26">Órbita</a><nav><a href="privacidad.html">Privacidad</a><a href="condiciones.html">Condiciones</a></nav></header>
<main>
${toHtml(md)}
</main>
</body>
</html>
<!-- Generado por scripts/legal.mjs a partir de docs/legal/${src}. No editar a mano. -->
`
}

export function build() {
  return PAGES.map((p) => ({ ...p, html: page(p, fillMarkers(readFileSync(`${ROOT}docs/legal/${p.src}`, 'utf8'))) }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const p of build()) {
    writeFileSync(`${ROOT}public/legal/${p.out}`, p.html)
    console.log('public/legal/' + p.out)
  }
}
