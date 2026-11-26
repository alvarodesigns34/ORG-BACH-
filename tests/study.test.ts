/**
 * Constancia (racha) y estudio antes de cada examen frente a la nota.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_SCALE } from '../src/domain/grades.ts'
import { comparePrep, examPlan, minutesBetween, minutesByDay, studyBeforeExams, studyStreak } from '../src/domain/study.ts'
import type { Exam, FocusSession, GradeEntry } from '../src/domain/types.ts'

/** Vuelo cerrado que termina el día `day` a la hora `hour` (local). */
function flight(day: string, minutes: number, extra: Partial<FocusSession> = {}): FocusSession {
  const [y, m, d] = day.split('-').map(Number)
  const end = new Date(y, m - 1, d, (extra as { hour?: number }).hour ?? 18, 0)
  return {
    id: `v-${day}-${minutes}-${Math.random()}`,
    kind: 'vuelo',
    from: 'MAD',
    to: 'BCN',
    distanceKm: minutes * 10,
    plannedMinutes: minutes,
    seat: '01A',
    status: 'aterrizado',
    startedAt: new Date(end.getTime() - minutes * 60_000).toISOString(),
    pausedMs: 0,
    endedAt: end.toISOString(),
    focusedMinutes: minutes,
    createdAt: end.toISOString(),
    ...extra,
  }
}

describe('racha de estudio', () => {
  const TODAY = '2026-11-16'

  it('cuenta días seguidos hasta hoy', () => {
    const s = studyStreak([flight('2026-11-14', 30), flight('2026-11-15', 25), flight('2026-11-16', 45)], TODAY)
    assert.equal(s.current, 3)
    assert.equal(s.today, true)
  })

  it('hoy sin estudiar aún no rompe la racha', () => {
    const s = studyStreak([flight('2026-11-14', 30), flight('2026-11-15', 25)], TODAY)
    assert.equal(s.current, 2)
    assert.equal(s.today, false)
  })

  it('un día en blanco la corta; la mejor se recuerda', () => {
    const s = studyStreak(
      [flight('2026-11-01', 30), flight('2026-11-02', 30), flight('2026-11-03', 30), flight('2026-11-04', 30), flight('2026-11-14', 30)],
      TODAY,
    )
    assert.equal(s.current, 0)
    assert.equal(s.best, 4)
  })

  it('un vuelo abandonado con minutos cuenta; uno en el aire o vacío, no', () => {
    const s = studyStreak(
      [
        flight('2026-11-15', 12, { status: 'cancelado' }),
        flight('2026-11-16', 30, { status: 'en_vuelo', endedAt: undefined }),
        flight('2026-11-14', 0, { status: 'cancelado', focusedMinutes: 0 }),
      ],
      TODAY,
    )
    assert.equal(s.current, 1)
    assert.equal(s.today, false)
  })

  it('cruza meses y da los últimos 14 días en orden', () => {
    const s = studyStreak([flight('2026-10-31', 30), flight('2026-11-01', 20)], '2026-11-01')
    assert.equal(s.current, 2)
    assert.equal(s.recent.length, 14)
    assert.equal(s.recent.at(-1)?.day, '2026-11-01')
    assert.equal(s.recent.at(-2)?.minutes, 30)
  })

  it('suma minutos por día y por tramo', () => {
    const list = [flight('2026-11-15', 30, { subjectId: 'mat' }), flight('2026-11-15', 20, { subjectId: 'fis' }), flight('2026-11-10', 40, { subjectId: 'mat' })]
    assert.equal(minutesByDay(list).get('2026-11-15'), 50)
    const range = minutesBetween(list, '2026-11-12', '2026-11-16')
    assert.equal(range.get('mat'), 30)
    assert.equal(range.get('fis'), 20)
  })
})

describe('estudio antes de cada examen', () => {
  const exam = (id: string, subjectId: string, date: string, gradeEntryId?: string, time?: string): Exam => ({
    id, subjectId, title: id, date, time, term: 'T1', gradeEntryId, createdAt: '2026-09-01T00:00:00.000Z',
  })
  const grade = (id: string, subjectId: string, score: number, maxScore = 10): GradeEntry => ({
    id, subjectId, categoryId: null, term: 'T1', name: id, kind: 'examen', score, maxScore, weight: 30, date: '2026-11-01', createdAt: '2026-11-01T00:00:00.000Z',
  })

  it('suma lo de la asignatura desde el examen anterior; lo del día del examen sin hora no cuenta', () => {
    const exams = [exam('e1', 'mat', '2026-10-10', 'g1'), exam('e2', 'mat', '2026-11-10', 'g2')]
    const grades = [grade('g1', 'mat', 6), grade('g2', 'mat', 16, 20)]
    const sessions = [
      flight('2026-10-05', 60, { subjectId: 'mat' }), // antes del 1.º
      flight('2026-10-22', 45, { subjectId: 'mat' }), // para el 2.º (dentro de sus 21 días)
      flight('2026-10-12', 25, { subjectId: 'mat' }), // entre los dos, pero más de 21 días antes del 2.º
      flight('2026-11-09', 90, { subjectId: 'mat' }), // para el 2.º
      flight('2026-11-09', 50, { subjectId: 'fis' }), // otra asignatura
      flight('2026-11-10', 30, { subjectId: 'mat' }), // el mismo día, sin hora: no
    ]
    const rows = studyBeforeExams(sessions, exams, grades, DEFAULT_SCALE)
    assert.deepEqual(rows.map((r) => [r.exam.id, r.minutes, r.score]), [
      ['e2', 135, 8],
      ['e1', 60, 6],
    ])
    assert.equal(rows[1].windowDays, 21)
  })

  it('con hora, cuenta lo estudiado esa misma mañana', () => {
    const rows = studyBeforeExams(
      [flight('2026-11-10', 30, { subjectId: 'mat', hour: 9 } as Partial<FocusSession>)],
      [exam('e', 'mat', '2026-11-10', 'g', '12:00')],
      [grade('g', 'mat', 7)],
      DEFAULT_SCALE,
    )
    assert.equal(rows[0].minutes, 30)
  })

  it('sin nota no hay fila', () => {
    assert.deepEqual(studyBeforeExams([], [exam('e', 'mat', '2026-11-10')], [], DEFAULT_SCALE), [])
  })

  it('compara solo con datos suficientes y diferencias reales', () => {
    const row = (minutes: number, score: number) => ({ minutes, score }) as Parameters<typeof comparePrep>[0][number]
    assert.equal(comparePrep([row(10, 5), row(200, 9), row(30, 6)]), null)
    assert.equal(comparePrep([row(0, 5), row(0, 9), row(0, 6), row(0, 7)]), null)
    const c = comparePrep([row(20, 5), row(240, 9), row(30, 6), row(180, 8)])
    assert.ok(c)
    assert.equal(c.threshold, 180)
    assert.equal(c.more.average, 8.5)
    assert.equal(c.less.average, 5.5)

    // Si la mitad o más tienen 0 min, se compara preparados (>0) frente a sin vuelos (0)
    const z = comparePrep([row(0, 5), row(0, 6), row(0, 5.5), row(120, 9)])
    assert.ok(z)
    assert.equal(z.threshold, 0)
    assert.equal(z.more.count, 1)
    assert.equal(z.more.average, 9)
    assert.equal(z.less.count, 3)
  })
})

describe('plan de repaso de un examen', () => {
  const exam = (date: string, extra: Partial<Exam> = {}): Exam => ({
    id: `e-${date}`,
    subjectId: 'mat',
    title: 'Derivadas',
    date,
    term: 'T1',
    createdAt: '2026-11-01T00:00:00.000Z',
    ...extra,
  })

  it('reparte lo que falta entre los días que quedan', () => {
    const e = exam('2026-11-20')
    const plan = examPlan(e, [], [e], '2026-11-16')
    assert.equal(plan.daysLeft, 4)
    assert.equal(plan.studied, 0)
    assert.equal(plan.todayTarget, 60)
    assert.equal(plan.todayLeft, 60)
  })

  it('lo estudiado hoy descuenta de hoy, no del reparto', () => {
    const e = exam('2026-11-20')
    const plan = examPlan(e, [flight('2026-11-16', 25, { subjectId: 'mat' })], [e], '2026-11-16')
    assert.equal(plan.todayTarget, 60)
    assert.equal(plan.studiedToday, 25)
    assert.equal(plan.todayLeft, 35)
  })

  it('no cuenta lo estudiado antes del examen anterior de la asignatura ni de otras', () => {
    const before = exam('2026-11-10', { id: 'antes' })
    const e = exam('2026-11-20')
    const sessions = [
      flight('2026-11-08', 120, { subjectId: 'mat' }),
      flight('2026-11-12', 30, { subjectId: 'fis' }),
      flight('2026-11-12', 40, { subjectId: 'mat' }),
      flight('2026-11-13', 20, { examId: e.id }),
    ]
    const plan = examPlan(e, sessions, [before, e], '2026-11-16')
    assert.equal(plan.studied, 60)
  })

  it('con el objetivo cumplido, hoy no toca nada', () => {
    const e = exam('2026-11-18')
    const plan = examPlan(e, [flight('2026-11-15', 240, { subjectId: 'mat' })], [e], '2026-11-16')
    assert.equal(plan.todayTarget, 0)
    assert.equal(plan.todayLeft, 0)
  })

  it('a última hora, como mucho dos horas al día y nunca más de lo que falta', () => {
    const e = exam('2026-11-17')
    assert.equal(examPlan(e, [], [e], '2026-11-16').todayTarget, 120)
    const almost = examPlan(e, [flight('2026-11-15', 230, { subjectId: 'mat' })], [e], '2026-11-16')
    assert.equal(almost.todayTarget, 10)
  })
})
