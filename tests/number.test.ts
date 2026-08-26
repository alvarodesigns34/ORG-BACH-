/**
 * Pruebas de la lectura de números escritos a mano.
 *
 * El caso que justifica todo este módulo: `Number.parseFloat('8,5')` devuelve
 * 8, no 8,5. Se come el decimal sin avisar, y en una aplicación de notas eso
 * es un error que el alumno no detecta hasta que la media no cuadra.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseDecimal,
  parseDecimalOr,
  sanitizeNumericInput,
  toDecimalInput,
} from '../src/domain/number.ts'

describe('parseDecimal', () => {
  it('entiende la coma decimal española', () => {
    assert.equal(parseDecimal('8,5'), 8.5)
    assert.equal(parseDecimal('9,25'), 9.25)
  })

  it('sigue entendiendo el punto', () => {
    assert.equal(parseDecimal('8.5'), 8.5)
  })

  it('demuestra el fallo que evita', () => {
    // Esto es lo que hacía el código antes de existir este módulo.
    assert.equal(Number.parseFloat('8,5'), 8)
    assert.notEqual(parseDecimal('8,5'), 8)
  })

  it('tolera espacios sobrantes', () => {
    assert.equal(parseDecimal('  7,5  '), 7.5)
  })

  it('deja pasar los números tal cual', () => {
    assert.equal(parseDecimal(8.5), 8.5)
  })

  it('devuelve NaN con texto vacío o inválido', () => {
    assert.ok(Number.isNaN(parseDecimal('')))
    assert.ok(Number.isNaN(parseDecimal('   ')))
    assert.ok(Number.isNaN(parseDecimal('abc')))
    assert.ok(Number.isNaN(parseDecimal(null)))
    assert.ok(Number.isNaN(parseDecimal(undefined)))
  })

  it('acepta negativos', () => {
    assert.equal(parseDecimal('-3,5'), -3.5)
  })
})

describe('parseDecimalOr', () => {
  it('usa el respaldo cuando no hay número', () => {
    assert.equal(parseDecimalOr('', 10), 10)
    assert.equal(parseDecimalOr('abc', 5), 5)
  })

  it('no pisa un cero legítimo', () => {
    // Un 0 es una nota válida: el respaldo no debe activarse.
    assert.equal(parseDecimalOr('0', 10), 0)
  })
})

describe('toDecimalInput', () => {
  it('escribe con coma', () => {
    assert.equal(toDecimalInput(8.5), '8,5')
  })

  it('no añade decimales de relleno', () => {
    assert.equal(toDecimalInput(9), '9')
  })

  it('devuelve cadena vacía sin valor', () => {
    assert.equal(toDecimalInput(null), '')
    assert.equal(toDecimalInput(undefined), '')
    assert.equal(toDecimalInput(Number.NaN), '')
  })

  it('va y vuelve sin perder precisión', () => {
    assert.equal(parseDecimal(toDecimalInput(7.25)), 7.25)
  })
})

describe('sanitizeNumericInput', () => {
  it('quita las letras', () => {
    assert.equal(sanitizeNumericInput('8a,5b'), '8,5')
  })

  it('deja escribir el separador a medias', () => {
    // Estado intermedio válido: el alumno aún está tecleando.
    assert.equal(sanitizeNumericInput('8,'), '8,')
  })

  it('admite un solo separador', () => {
    assert.equal(sanitizeNumericInput('8,5,3'), '8,53')
    assert.equal(sanitizeNumericInput('8.5.3'), '8.53')
  })

  it('el menos solo vale al principio', () => {
    assert.equal(sanitizeNumericInput('-8,5'), '-8,5')
    assert.equal(sanitizeNumericInput('8-5'), '85')
  })

  it('no toca lo que ya es válido', () => {
    assert.equal(sanitizeNumericInput('9,25'), '9,25')
    assert.equal(sanitizeNumericInput('100'), '100')
  })
})
