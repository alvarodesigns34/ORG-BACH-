/**
 * Horario semanal del centro (copiado de la app de información académica).
 *
 * Son solo datos: la aplicación sigue arrancando vacía y esto no se inserta
 * solo. El alumno lo carga con «Cargar mi horario» (ver `planTimetable`).
 */

import type { SubjectColor } from '../domain/types.ts'

export interface TimetableSubject {
  /** Abreviatura tal y como sale en el horario del centro. */
  code: string
  name: string
  color: SubjectColor
  /** Horas semanales; pondera en la media si la asignatura es nueva. */
  weight: number
  /**
   * Otros nombres con los que puede estar ya creada la asignatura. Si una
   * asignatura existente tiene uno de ellos, se renombra al nombre simple.
   */
  aliases?: string[]
}

export const TIMETABLE_SUBJECTS: TimetableSubject[] = [
  {
    code: 'FQ',
    name: 'Física y Química',
    color: 'teal',
    weight: 4,
  },
  {
    code: 'LCLI',
    name: 'Lengua',
    color: 'terracotta',
    weight: 4,
    aliases: ['Lengua Castellana y Literatura I', 'Lengua Castellana y Literatura', 'Lengua Castellana'],
  },
  {
    code: 'FIL',
    name: 'Filosofía',
    color: 'plum',
    weight: 4,
    aliases: ['Filosofia'],
  },
  {
    code: 'LEI',
    name: 'Inglés',
    color: 'sky',
    weight: 4,
    aliases: ['Lengua Extranjera I (Inglés)', 'Lengua Extranjera I', 'Lengua Extranjera'],
  },
  {
    code: 'BGCA',
    name: 'Biología',
    color: 'sage',
    weight: 4,
    aliases: ['Biología, Geología y CC. Ambientales', 'Biología y Geología'],
  },
  {
    code: 'MAI',
    name: 'Matemáticas',
    color: 'indigo',
    weight: 4,
    aliases: ['Matemáticas I'],
  },
  {
    // En el horario del centro sale «TICs», pero la asignatura del alumno ya
    // se llamaba «TIC» y así se queda.
    code: 'TIC',
    name: 'TIC',
    color: 'slate',
    weight: 2,
    aliases: ['TICs', 'Tecnologías de la Información y la Comunicación'],
  },
  {
    code: 'EF',
    name: 'Educación Física',
    color: 'moss',
    weight: 2,
  },
]

/** Las seis horas de clase de cada día. */
export const TIMETABLE_PERIODS: readonly [start: string, end: string][] = [
  ['08:45', '09:35'],
  ['09:40', '10:30'],
  ['10:50', '11:40'],
  ['11:45', '12:35'],
  ['12:55', '13:45'],
  ['13:50', '14:40'],
]

/**
 * Qué hay cada hora, de lunes (1) a viernes (5). Una hora vacía es una hora
 * sin clase (la tutoría de los martes a las 12:55 no se carga).
 */
export const TIMETABLE_WEEK: Record<1 | 2 | 3 | 4 | 5, string[][]> = {
  1: [['FQ'], ['FQ'], ['LCLI'], ['FIL'], ['LEI'], ['BGCA']],
  2: [['TIC'], ['BGCA'], ['EF'], ['EF'], [], ['MAI']],
  3: [['FQ'], ['MAI'], ['LCLI'], ['LCLI'], ['FIL'], ['LEI']],
  4: [['TIC'], ['MAI'], ['LCLI'], ['FIL'], ['BGCA'], ['LEI']],
  5: [['BGCA'], ['FQ'], ['FIL'], ['TIC'], ['LEI'], ['MAI']],
}
