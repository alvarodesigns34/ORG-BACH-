/**
 * Cargar el horario del centro en las asignaturas.
 *
 * `planTimetable` no toca nada: devuelve qué asignaturas habría que crear y
 * cuáles actualizar. Así se puede enseñar al alumno lo que va a pasar y probar
 * sin una interfaz. Quien lo aplica es el reductor, con las acciones de
 * siempre (`subject/addMany` y `subject/update`).
 */

import {
  TIMETABLE_PERIODS,
  TIMETABLE_SUBJECTS,
  TIMETABLE_WEEK,
  type TimetableSubject,
} from '../data/horario.ts'
import { newId } from './id.ts'
import { normalize } from './tasks.ts'
import type { ID, ScheduleSlot, Subject } from './types.ts'

export type NewSubject = Omit<Subject, 'id' | 'createdAt'>

export interface TimetablePlan {
  /** Asignaturas que no existían y hay que crear. */
  add: NewSubject[]
  /** Asignaturas que ya existían: solo cambian horario (y profesor si faltaba). */
  update: { id: ID; name: string; patch: Pick<Subject, 'schedule'> & Partial<Subject> }[]
}

/** Franjas de una asignatura del horario, sin duplicados por día y hora. */
export function slotsFor(code: string): ScheduleSlot[] {
  const slots: ScheduleSlot[] = []
  for (const [dayKey, periods] of Object.entries(TIMETABLE_WEEK)) {
    periods.forEach((codes, index) => {
      if (!codes.includes(code)) return
      const [start, end] = TIMETABLE_PERIODS[index]
      slots.push({ id: newId('slot'), day: Number(dayKey) as ScheduleSlot['day'], start, end })
    })
  }
  return slots
}

function findExisting(subjects: Subject[], def: TimetableSubject): Subject | undefined {
  const names = new Set([def.name, ...(def.aliases ?? [])].map(normalize))
  const code = normalize(def.code)
  return subjects.find(
    (s) =>
      !s.archived &&
      (names.has(normalize(s.name)) || normalize(s.shortName ?? '') === code),
  )
}

export function planTimetable(subjects: Subject[]): TimetablePlan {
  const plan: TimetablePlan = { add: [], update: [] }

  for (const def of TIMETABLE_SUBJECTS) {
    const slots = slotsFor(def.code)
    if (slots.length === 0) continue

    const existing = findExisting(subjects, def)
    if (!existing) {
      plan.add.push({
        name: def.name,
        shortName: def.code,
        color: def.color,
        teacher: def.teachers.join(', '),
        weight: def.weight,
        schedule: slots,
        categories: [],
      })
      continue
    }

    // El aula que el alumno ya hubiera apuntado en una franja que sigue
    // existiendo (mismo día y misma hora) no se pierde al recargar.
    const rooms = new Map(
      existing.schedule.filter((s) => s.room).map((s) => [`${s.day}|${s.start}`, s.room]),
    )
    const schedule = slots.map((slot) => {
      const room = rooms.get(`${slot.day}|${slot.start}`)
      return room ? { ...slot, room } : slot
    })

    plan.update.push({
      id: existing.id,
      name: existing.name,
      patch: {
        schedule,
        // El profesor que ya estuviera escrito manda sobre el del horario.
        ...(existing.teacher?.trim() ? {} : { teacher: def.teachers.join(', ') }),
      },
    })
  }

  return plan
}
