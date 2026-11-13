/**
 * Cargar el horario del centro en las asignaturas.
 *
 * `planTimetable` no toca nada: devuelve qué asignaturas habría que crear y
 * cuáles actualizar (solo sus franjas). Así se puede enseñar al alumno lo que va a pasar y probar
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
  /** Asignaturas que ya existían: solo cambia su horario. */
  update: { id: ID; name: string; patch: Pick<Subject, 'schedule'> & Partial<Pick<Subject, 'name'>> }[]
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
  const exact = normalize(def.name)
  const aliases = new Set((def.aliases ?? []).map(normalize))
  const code = normalize(def.code)
  const live = subjects.filter((s) => !s.archived)
  // Si hay duplicados (p. ej. «TIC» y «TICs»), gana el de nombre exacto, y
  // después el que coincide por la abreviatura, antes que el de un alias.
  return (
    live.find((s) => normalize(s.name) === exact) ??
    live.find((s) => normalize(s.shortName ?? '') === code) ??
    live.find((s) => aliases.has(normalize(s.name)))
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

    // Una asignatura con el nombre largo de siempre pasa al nombre simple; si
    // el alumno la llamó de otra forma, se respeta.
    const rename =
      normalize(existing.name) !== normalize(def.name) &&
      (def.aliases ?? []).some((alias) => normalize(alias) === normalize(existing.name))

    plan.update.push({
      id: existing.id,
      name: existing.name,
      patch: rename ? { schedule, name: def.name } : { schedule },
    })
  }

  return plan
}

/** ¿Cargar el horario cambiaría algo más que reescribir franjas iguales? */
export function hasTimetableChanges(plan: TimetablePlan): boolean {
  return plan.add.length > 0 || plan.update.some((u) => u.patch.name !== undefined)
}
