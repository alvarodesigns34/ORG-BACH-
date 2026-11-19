import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// @ts-expect-error: script de Node en JavaScript, sin tipos.
import { build } from '../scripts/legal.mjs'

test('las páginas legales públicas están al día con docs/legal', () => {
  for (const p of build() as { out: string; html: string }[]) {
    const current = readFileSync(new URL(`../public/legal/${p.out}`, import.meta.url), 'utf8')
    assert.equal(current, p.html, `public/legal/${p.out} no está al día: ejecuta node scripts/legal.mjs`)
  }
})

test('la web no promete cifrado de extremo a extremo ni nombra otras apps', () => {
  const content = readFileSync(new URL('../src/landing/content.ts', import.meta.url), 'utf8')
  for (const line of content.split('\n').filter((l) => /extremo a extremo/i.test(l))) {
    assert.match(line, /\bno\b|nada de|¿/i, `Afirma cifrado de extremo a extremo: ${line.trim()}`)
  }
  assert.doesNotMatch(content, /Focus Flight/i)
})
