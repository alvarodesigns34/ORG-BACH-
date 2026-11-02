/**
 * Bloqueo del fondo con varios diálogos: el fallo que dejaba la página sin
 * poder desplazarse al cerrar a la vez un formulario y su confirmación.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { activeScrollLocks, lockScroll } from '../src/ui/scrollLock.ts'

function fakeDocument() {
  const attrs = new Set<string>()
  const root = {
    setAttribute: (name: string) => attrs.add(name),
    removeAttribute: (name: string) => attrs.delete(name),
  }
  const doc = {
    body: { style: { overflow: '', paddingRight: '' } },
    documentElement: { clientWidth: 390 },
    defaultView: { innerWidth: 390 },
    getElementById: () => root,
  }
  return { doc: doc as unknown as Document, inert: () => attrs.has('inert') }
}

describe('bloqueo del desplazamiento', () => {
  it('dos diálogos que se cierran en el orden «malo» no dejan la página bloqueada', () => {
    const { doc, inert } = fakeDocument()
    const releaseEditor = lockScroll(doc)
    const releaseConfirm = lockScroll(doc)
    assert.equal(doc.body.style.overflow, 'hidden')
    // Se cierran los dos a la vez; el formulario primero.
    releaseEditor()
    assert.equal(doc.body.style.overflow, 'hidden', 'sigue abierto el de confirmar')
    releaseConfirm()
    assert.equal(doc.body.style.overflow, '')
    assert.equal(inert(), false)
    assert.equal(activeScrollLocks(), 0)
  })

  it('liberar dos veces no descuadra el contador', () => {
    const { doc } = fakeDocument()
    const a = lockScroll(doc)
    const b = lockScroll(doc)
    a()
    a()
    assert.equal(doc.body.style.overflow, 'hidden')
    b()
    assert.equal(doc.body.style.overflow, '')
    assert.equal(activeScrollLocks(), 0)
  })
})
