import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cleanRef } from '../src/landing/ref.ts'

test('la fuente de ?ref se normaliza y se rechaza lo raro', () => {
  assert.equal(cleanRef('TikTok-3'), 'tiktok-3')
  assert.equal(cleanRef(' bio '), 'bio')
  assert.equal(cleanRef(''), null)
  assert.equal(cleanRef(null), null)
  assert.equal(cleanRef('-x'), null)
  assert.equal(cleanRef('a b'), null)
  assert.equal(cleanRef('<script>'), null)
  assert.equal(cleanRef('x'.repeat(41)), null)
})
