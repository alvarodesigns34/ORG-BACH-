/**
 * Pruebas del motor de notas.
 *
 * Se ejecutan con el runner incorporado de Node, sin dependencias:
 *
 *     npm test
 *
 * Los casos son los que rompen este tipo de cálculo en la práctica: pesos que
 * no suman 100, escalas distintas del 10, categorías todavía sin evaluar y
 * objetivos imposibles.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_SCALE,
  averageOfEntries,
  checkWeights,
  globalAverage,
  gradeTone,
  projectAverage,
  requiredGrade,
  round,
  subjectResult,
} from '../src/domain/grades.ts'
import type { GradeEntry, Subject, SubjectColor } from '../src/domain/types.ts'

// ---------------------------------------------------------------------------
// Constructores de apoyo
// ---------------------------------------------------------------------------

let counter = 0

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: `sub${++counter}`,
    name: 'Matemáticas I',
    color: 'indigo' as SubjectColor,
    weight: 4,
    schedule: [],
    categories: [],
    createdAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  }
}

function makeGrade(
  subjectId: string,
  score: number,
  weight: number,
  overrides: Partial<GradeEntry> = {},
): GradeEntry {
  return {
    id: `g${++counter}`,
    subjectId,
    categoryId: null,
    term: 'T1',
    name: 'Nota',
    kind: 'examen',
    score,
    maxScore: 10,
    weight,
    date: '2026-10-01',
    createdAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('averageOfEntries', () => {
  it('pondera cuando los pesos suman 100', () => {
    const s = makeSubject()
    const entries = [makeGrade(s.id, 8.5, 40), makeGrade(s.id, 9, 60)]
    const { average } = averageOfEntries(entries, DEFAULT_SCALE)
    // 8,5 × 0,4 + 9 × 0,6 = 8,8
    assert.equal(round(average!, 4), 8.8)
  })

  it('usa media aritmética cuando ninguna nota declara peso', () => {
    const s = makeSubject()
    const entries = [makeGrade(s.id, 7, 0), makeGrade(s.id, 9, 0), makeGrade(s.id, 8, 0)]
    const { average, declaredWeight } = averageOfEntries(entries, DEFAULT_SCALE)
    assert.equal(round(average!, 4), 8)
    assert.equal(declaredWeight, 0)
  })

  it('normaliza por la suma real cuando los pesos no llegan a 100', () => {
    const s = makeSubject()
    // Solo se ha evaluado el 50 %: la media debe ser la de lo hecho, no la mitad.
    const entries = [makeGrade(s.id, 8, 30), makeGrade(s.id, 9, 20)]
    const { average } = averageOfEntries(entries, DEFAULT_SCALE)
    // (8×30 + 9×20) / 50 = 8,4
    assert.equal(round(average!, 4), 8.4)
  })

  it('normaliza notas de escalas distintas antes de ponderar', () => {
    const s = makeSubject()
    // 45/50 y 9/10 son la misma nota: la media debe ser exactamente 9.
    const entries = [
      makeGrade(s.id, 45, 50, { maxScore: 50 }),
      makeGrade(s.id, 9, 50, { maxScore: 10 }),
    ]
    const { average } = averageOfEntries(entries, DEFAULT_SCALE)
    assert.equal(round(average!, 4), 9)
  })

  it('devuelve null sin notas', () => {
    const { average } = averageOfEntries([], DEFAULT_SCALE)
    assert.equal(average, null)
  })
})

describe('subjectResult', () => {
  it('una categoría sin notas no arrastra la media a cero', () => {
    const subject = makeSubject({
      categories: [
        { id: 'c1', name: 'Exámenes', weight: 70 },
        { id: 'c2', name: 'Trabajos', weight: 20 },
        { id: 'c3', name: 'Actitud', weight: 10 },
      ],
    })
    const grades = [
      makeGrade(subject.id, 8.5, 40, { categoryId: 'c1' }),
      makeGrade(subject.id, 9.5, 100, { categoryId: 'c2' }),
    ]

    const result = subjectResult(subject, grades, DEFAULT_SCALE, 'T1')

    // Actitud no tiene notas, así que no participa:
    // (8,5 × 70 + 9,5 × 20) / 90 = 8,7222…
    assert.equal(round(result.average!, 2), 8.72)
    assert.equal(result.entryCount, 2)
  })

  it('calcula qué porcentaje de la asignatura se ha evaluado', () => {
    const subject = makeSubject({
      categories: [
        { id: 'c1', name: 'Exámenes', weight: 70 },
        { id: 'c2', name: 'Trabajos', weight: 30 },
      ],
    })
    // Exámenes lleva el 50 % de su categoría; Trabajos, nada.
    const grades = [makeGrade(subject.id, 8, 50, { categoryId: 'c1' })]

    const result = subjectResult(subject, grades, DEFAULT_SCALE, 'T1')
    // 70 % × 0,5 = 35 %
    assert.equal(round(result.evaluatedPercent, 2), 35)
  })

  it('avisa cuando las categorías no suman 100', () => {
    const subject = makeSubject({
      categories: [
        { id: 'c1', name: 'Exámenes', weight: 60 },
        { id: 'c2', name: 'Trabajos', weight: 20 },
      ],
    })
    const result = subjectResult(subject, [makeGrade(subject.id, 8, 100, { categoryId: 'c1' })], DEFAULT_SCALE)

    const warning = result.warnings.find((w) => w.scope === 'asignatura')
    assert.ok(warning, 'debería avisar de que falta un 20 %')
    assert.equal(warning!.sum, 80)
  })

  it('avisa cuando las notas de una categoría pasan del 100', () => {
    const subject = makeSubject({ categories: [{ id: 'c1', name: 'Exámenes', weight: 100 }] })
    const grades = [
      makeGrade(subject.id, 8, 70, { categoryId: 'c1' }),
      makeGrade(subject.id, 9, 60, { categoryId: 'c1' }),
    ]
    const result = subjectResult(subject, grades, DEFAULT_SCALE)

    const warning = result.warnings.find((w) => w.scope === 'categoria')
    assert.ok(warning, 'debería avisar de que suman 130 %')
    assert.equal(warning!.sum, 130)
    // Aun así devuelve una media razonable, repartiendo proporcionalmente.
    assert.equal(round(result.average!, 4), round((8 * 70 + 9 * 60) / 130, 4))
  })

  it('funciona sin categorías, ponderando directamente', () => {
    const subject = makeSubject({ categories: [] })
    const grades = [makeGrade(subject.id, 6, 40), makeGrade(subject.id, 8, 60)]
    const result = subjectResult(subject, grades, DEFAULT_SCALE)
    assert.equal(round(result.average!, 4), 7.2)
  })

  it('una asignatura sin notas devuelve null, no cero', () => {
    const subject = makeSubject()
    const result = subjectResult(subject, [], DEFAULT_SCALE)
    assert.equal(result.average, null)
    assert.equal(result.evaluatedPercent, 0)
  })

  it('una asignatura con una sola nota devuelve esa nota', () => {
    const subject = makeSubject({ categories: [{ id: 'c1', name: 'Exámenes', weight: 100 }] })
    const result = subjectResult(subject, [makeGrade(subject.id, 7.25, 30, { categoryId: 'c1' })], DEFAULT_SCALE)
    assert.equal(round(result.average!, 4), 7.25)
  })

  it('no pierde las notas cuya categoría se ha borrado', () => {
    const subject = makeSubject({ categories: [{ id: 'c1', name: 'Exámenes', weight: 100 }] })
    // 'c9' ya no existe en la asignatura.
    const grades = [makeGrade(subject.id, 5, 100, { categoryId: 'c9' })]
    const result = subjectResult(subject, grades, DEFAULT_SCALE)
    assert.equal(result.entryCount, 1)
    assert.equal(round(result.average!, 4), 5)
  })

  it('separa las evaluaciones', () => {
    const subject = makeSubject()
    const grades = [
      makeGrade(subject.id, 6, 100, { term: 'T1' }),
      makeGrade(subject.id, 10, 100, { term: 'T2' }),
    ]
    assert.equal(round(subjectResult(subject, grades, DEFAULT_SCALE, 'T1').average!, 4), 6)
    assert.equal(round(subjectResult(subject, grades, DEFAULT_SCALE, 'T2').average!, 4), 10)
    assert.equal(round(subjectResult(subject, grades, DEFAULT_SCALE, 'todas').average!, 4), 8)
  })
})

describe('globalAverage', () => {
  const a = makeSubject({ name: 'Matemáticas', weight: 4 })
  const b = makeSubject({ name: 'Filosofía', weight: 2 })
  const c = makeSubject({ name: 'Sin notas', weight: 3 })

  const results = new Map([
    [a.id, subjectResult(a, [makeGrade(a.id, 9, 100)], DEFAULT_SCALE)],
    [b.id, subjectResult(b, [makeGrade(b.id, 6, 100)], DEFAULT_SCALE)],
    [c.id, subjectResult(c, [], DEFAULT_SCALE)],
  ])

  it('media aritmética: todas las asignaturas valen igual', () => {
    assert.equal(globalAverage([a, b, c], results, 'aritmetica'), 7.5)
  })

  it('media ponderada: cada asignatura pesa según sus horas', () => {
    // (9×4 + 6×2) / 6 = 8
    assert.equal(globalAverage([a, b, c], results, 'ponderada'), 8)
  })

  it('las asignaturas sin notas quedan fuera de la media', () => {
    // Si 'c' contara como 0, la aritmética sería 5, no 7,5.
    assert.notEqual(globalAverage([a, b, c], results, 'aritmetica'), 5)
  })

  it('sin ninguna nota devuelve null', () => {
    assert.equal(globalAverage([c], results, 'aritmetica'), null)
  })
})

describe('requiredGrade', () => {
  it('calcula la nota necesaria en lo que queda', () => {
    // Media 7,5 con el 60 % evaluado, objetivo 8.
    const result = requiredGrade(7.5, 60, 8, DEFAULT_SCALE)
    assert.equal(result.status, 'alcanzable')
    assert.equal(result.remainingPercent, 40)
    // (8×100 − 7,5×60) / 40 = 8,75
    assert.equal(result.needed, 8.75)
  })

  it('un objetivo que exige más del 10 no es alcanzable', () => {
    // Media 8,2 con el 60 % evaluado y objetivo 9: harían falta 10,2, que se
    // sale de la escala. El cálculo se muestra igualmente, pero se avisa de
    // que no se puede llegar.
    const result = requiredGrade(8.2, 60, 9, DEFAULT_SCALE)
    assert.equal(result.needed, 10.2)
    assert.equal(result.status, 'imposible')
    // Y se dice a cuánto se llegaría como máximo: 8,2×0,6 + 10×0,4 = 8,92.
    assert.match(result.message, /8,92/)
  })

  it('detecta el objetivo imposible', () => {
    const result = requiredGrade(5, 80, 9, DEFAULT_SCALE)
    assert.equal(result.status, 'imposible')
    assert.match(result.message, /no es alcanzable/i)
  })

  it('detecta el objetivo ya asegurado', () => {
    const result = requiredGrade(10, 90, 8, DEFAULT_SCALE)
    assert.equal(result.status, 'ya_conseguido')
    assert.equal(result.needed, 0)
  })

  it('avisa cuando ya no queda nada por evaluar', () => {
    const result = requiredGrade(7, 100, 9, DEFAULT_SCALE)
    assert.equal(result.status, 'sin_restante')
    assert.equal(result.remainingPercent, 0)
  })

  it('un objetivo justo en el límite es alcanzable', () => {
    // Media 8 con el 50 % hecho, objetivo 9 → hace falta exactamente un 10.
    const result = requiredGrade(8, 50, 9, DEFAULT_SCALE)
    assert.equal(result.status, 'alcanzable')
    assert.equal(result.needed, 10)
  })
})

describe('projectAverage', () => {
  it('proyecta la nota final sobre todo lo que queda', () => {
    // 8,2 con el 60 % hecho, y un 8,5 en el 40 % restante.
    assert.equal(projectAverage(8.2, 60, 8.5, 40), 8.32)
  })

  it('proyecta sobre un tramo parcial', () => {
    // Un examen que vale el 30 %, quedando aún un 10 % después.
    // (8,2×60 + 9×30) / 90 = 8,4666…
    assert.equal(round(projectAverage(8.2, 60, 9, 30), 2), 8.47)
  })

  it('con nada evaluado, la nota proyectada es la propia nota', () => {
    assert.equal(projectAverage(0, 0, 7.5, 100), 7.5)
  })
})

describe('checkWeights', () => {
  it('acepta exactamente 100', () => {
    const check = checkWeights([70, 20, 10])
    assert.equal(check.status, 'ok')
    assert.equal(check.message, null)
  })

  it('detecta que falta', () => {
    assert.equal(checkWeights([70, 20]).status, 'falta')
  })

  it('detecta que sobra', () => {
    assert.equal(checkWeights([70, 40]).status, 'sobra')
  })

  it('tolera el error de coma flotante', () => {
    // 33,33 × 3 no da 100 exacto en binario.
    assert.equal(checkWeights([33.33, 33.33, 33.34]).status, 'ok')
  })
})

describe('gradeTone', () => {
  it('marca el suspenso', () => {
    assert.equal(gradeTone(4.9, DEFAULT_SCALE), 'danger')
  })

  it('marca el aprobado justo como aviso', () => {
    assert.equal(gradeTone(5.5, DEFAULT_SCALE), 'warn')
  })

  it('marca la nota buena', () => {
    assert.equal(gradeTone(8, DEFAULT_SCALE), 'ok')
  })

  it('sin nota, sin tono', () => {
    assert.equal(gradeTone(null, DEFAULT_SCALE), 'neutral')
  })

  it('respeta una escala distinta del 10', () => {
    const scale = { max: 100, pass: 50, decimals: 0 }
    assert.equal(gradeTone(49, scale), 'danger')
    assert.equal(gradeTone(90, scale), 'ok')
  })
})

describe('round', () => {
  it('evita el error clásico de la coma flotante', () => {
    // 1,005 se almacena como 1,00499999… y Math.round lo dejaría en 1.
    assert.equal(round(1.005, 2), 1.01)
    assert.equal(round(0.1 + 0.2, 2), 0.3)
  })
})
