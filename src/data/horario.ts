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
  /** Profesorado, el que más veces aparece primero. */
  teachers: string[]
  /** Otros nombres con los que puede estar ya creada la asignatura. */
  aliases?: string[]
}

export const TIMETABLE_SUBJECTS: TimetableSubject[] = [
  {
    code: 'FQ',
    name: 'Física y Química',
    color: 'teal',
    weight: 4,
    teachers: ['Nora Frías Gil', 'Elena María Castellanos Martínez'],
  },
  {
    code: 'LCLI',
    name: 'Lengua Castellana y Literatura I',
    color: 'terracotta',
    weight: 4,
    teachers: ['Silvia Sáenz Romo'],
  },
  {
    code: 'FIL',
    name: 'Filosofía',
    color: 'plum',
    weight: 4,
    teachers: ['Antonio Usero Vílchez'],
    aliases: ['Filosofia'],
  },
  {
    code: 'LEI',
    name: 'Lengua Extranjera I (Inglés)',
    color: 'sky',
    weight: 4,
    teachers: ['Lorena Lozano Sufrategui', 'Andrea Rubio Goitia'],
    aliases: ['Lengua Extranjera I', 'Inglés'],
  },
  {
    code: 'BGCA',
    name: 'Biología, Geología y CC. Ambientales',
    color: 'sage',
    weight: 4,
    teachers: ['Luis Pérez Bobadilla'],
    aliases: ['Biología y Geología'],
  },
  {
    code: 'MAI',
    name: 'Matemáticas I',
    color: 'indigo',
    weight: 4,
    teachers: ['Luis Roca Fernández'],
  },
  {
    code: 'TICs',
    name: 'Tecnologías de la Información y la Comunicación',
    color: 'slate',
    weight: 2,
    teachers: ['Jorge Muro Hernández'],
    aliases: ['TIC'],
  },
  {
    code: 'EF',
    name: 'Educación Física',
    color: 'moss',
    weight: 2,
    teachers: ['Germán Lleyda Gómez'],
  },
  {
    code: 'TU',
    name: 'Tutoría',
    color: 'clay',
    weight: 1,
    teachers: ['Lorena Lozano Sufrategui'],
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
 * Qué hay cada hora, de lunes (1) a viernes (5). Una hora con dos códigos es
 * un desdoble: el centro lo muestra con las dos asignaturas a la vez.
 */
export const TIMETABLE_WEEK: Record<1 | 2 | 3 | 4 | 5, string[][]> = {
  1: [['FQ'], ['FQ'], ['LCLI'], ['FIL'], ['LEI'], ['BGCA']],
  2: [['TICs'], ['BGCA'], ['EF'], ['EF'], ['TU'], ['MAI']],
  3: [['FQ'], ['MAI'], ['LCLI'], ['LCLI'], ['FIL'], ['LEI']],
  4: [['TICs'], ['MAI'], ['LCLI'], ['FIL'], ['BGCA', 'FQ'], ['LEI']],
  5: [['BGCA'], ['FQ'], ['FIL'], ['TICs'], ['LEI'], ['MAI']],
}
