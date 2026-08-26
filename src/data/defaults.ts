/**
 * Estado inicial y catálogos de arranque.
 *
 * La aplicación arranca COMPLETAMENTE VACÍA. Lo que hay aquí son valores por
 * defecto de configuración y un catálogo de asignaturas que el alumno elige en
 * el alta: nada se inserta sin que él lo pida.
 */

import { DEFAULT_SCALE } from '@/domain/grades'
import { DEFAULT_POMODORO } from '@/domain/study'
import type { AppData, GradeCategory, Settings, SubjectColor } from '@/domain/types'
import { newId } from '@/domain/id'

/** Versión del esquema guardado. Súbela al cambiar la forma de los datos. */
export const SCHEMA_VERSION = 1

export const STORAGE_KEY = 'bachillerato-os:v1'

/** Curso académico con forma '2026/2027', deducido de la fecha del sistema. */
export function currentAcademicYear(date = new Date()): string {
  // El corte se pone en agosto, no en septiembre: quien prepara la aplicación
  // en verano lo hace para el curso que va a empezar, no para el que acaba de
  // terminar. De enero a julio seguimos en el curso en marcha.
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
  return `${start}/${start + 1}`
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  course: '1.º de Bachillerato',
  academicYear: currentAcademicYear(),
  theme: 'system',
  weekStartsOn: 1,
  gradeScale: DEFAULT_SCALE,
  averageMode: 'aritmetica',
  activeTerm: 'T1',
  alertsEnabled: true,
  examAlertDays: 7,
  pomodoroMinutes: DEFAULT_POMODORO.workMinutes,
  pomodoroBreakMinutes: DEFAULT_POMODORO.breakMinutes,
  pomodoroSound: true,
  onboarded: false,
}

export function createEmptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, gradeScale: { ...DEFAULT_SCALE } },
    subjects: [],
    tasks: [],
    grades: [],
    exams: [],
    events: [],
    sessions: [],
    goals: [],
    activity: [],
  }
}

// ---------------------------------------------------------------------------
// Reparto de pesos por defecto
// ---------------------------------------------------------------------------

/**
 * Reparto habitual en Bachillerato. Es solo un punto de partida: cada
 * asignatura puede reconfigurarlo entero, porque no todas evalúan igual.
 */
export function defaultCategories(): GradeCategory[] {
  return [
    { id: newId('cat'), name: 'Exámenes', weight: 70 },
    { id: newId('cat'), name: 'Trabajos y prácticas', weight: 20 },
    { id: newId('cat'), name: 'Actitud y participación', weight: 10 },
  ]
}

// ---------------------------------------------------------------------------
// Catálogo de asignaturas de 1.º de Bachillerato
// ---------------------------------------------------------------------------

export interface CatalogSubject {
  name: string
  color: SubjectColor
  /** Horas semanales orientativas; se usan como peso en la media ponderada. */
  weight: number
}

export interface CatalogGroup {
  id: string
  label: string
  hint: string
  subjects: CatalogSubject[]
}

export const SUBJECT_CATALOG: CatalogGroup[] = [
  {
    id: 'comunes',
    label: 'Materias comunes',
    hint: 'Las cursa todo el mundo, sea cual sea la modalidad.',
    subjects: [
      { name: 'Lengua Castellana y Literatura I', color: 'terracotta', weight: 3 },
      { name: 'Lengua Extranjera I (Inglés)', color: 'sky', weight: 3 },
      { name: 'Filosofía', color: 'plum', weight: 3 },
      { name: 'Educación Física', color: 'moss', weight: 2 },
    ],
  },
  {
    id: 'ciencias',
    label: 'Ciencias y Tecnología',
    hint: 'Modalidad científico-tecnológica.',
    subjects: [
      { name: 'Matemáticas I', color: 'indigo', weight: 4 },
      { name: 'Física y Química', color: 'teal', weight: 4 },
      { name: 'Biología, Geología y CC. Ambientales', color: 'sage', weight: 4 },
      { name: 'Dibujo Técnico I', color: 'slate', weight: 4 },
      { name: 'Tecnología e Ingeniería I', color: 'clay', weight: 4 },
    ],
  },
  {
    id: 'humanidades',
    label: 'Humanidades y Ciencias Sociales',
    hint: 'Modalidad de letras y ciencias sociales.',
    subjects: [
      { name: 'Latín I', color: 'amber', weight: 4 },
      { name: 'Matemáticas Aplicadas a las CC. Sociales I', color: 'indigo', weight: 4 },
      { name: 'Historia del Mundo Contemporáneo', color: 'clay', weight: 4 },
      { name: 'Griego I', color: 'terracotta', weight: 4 },
      { name: 'Economía', color: 'teal', weight: 4 },
      { name: 'Literatura Universal', color: 'plum', weight: 3 },
    ],
  },
  {
    id: 'general',
    label: 'Modalidad General',
    hint: 'Vía general del Bachillerato.',
    subjects: [
      { name: 'Matemáticas Generales', color: 'indigo', weight: 4 },
      { name: 'Economía, Emprendimiento y Actividad Empresarial', color: 'teal', weight: 4 },
    ],
  },
  {
    id: 'artes',
    label: 'Artes',
    hint: 'Modalidad artística.',
    subjects: [
      { name: 'Dibujo Artístico I', color: 'terracotta', weight: 4 },
      { name: 'Análisis Musical I', color: 'plum', weight: 4 },
      { name: 'Artes Escénicas I', color: 'amber', weight: 4 },
      { name: 'Cultura Audiovisual', color: 'sky', weight: 4 },
      { name: 'Volumen', color: 'clay', weight: 4 },
    ],
  },
]
