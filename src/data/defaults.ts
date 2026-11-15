/**
 * Estado inicial y catálogos de arranque.
 *
 * La aplicación arranca COMPLETAMENTE VACÍA. Lo que hay aquí son valores por
 * defecto de configuración y un catálogo de asignaturas que el alumno elige en
 * el alta: nada se inserta sin que él lo pida.
 */

import { DEFAULT_SCALE } from '../domain/grades.ts'
import { HOME_WIDGETS } from '../domain/types.ts'
import type { AppData, HomeLayout, Settings, SubjectColor } from '../domain/types.ts'

/** Versión del esquema guardado. Súbela al cambiar la forma de los datos. */
export const SCHEMA_VERSION = 2

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
  course: '',
  academicYear: currentAcademicYear(),
  theme: 'system',
  weekStartsOn: 1,
  gradeScale: DEFAULT_SCALE,
  averageMode: 'aritmetica',
  activeTerm: 'T1',
  alertsEnabled: true,
  examAlertDays: 7,
  home: { order: [...HOME_WIDGETS], hidden: ['actividad'] },
  onboarded: false,
}

export function cloneHome(home: HomeLayout): HomeLayout {
  return { order: [...home.order], hidden: [...home.hidden] }
}

export function createEmptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, gradeScale: { ...DEFAULT_SCALE }, home: cloneHome(DEFAULT_SETTINGS.home) },
    subjects: [],
    tasks: [],
    grades: [],
    exams: [],
    events: [],
    goals: [],
    activity: [],
    sessions: [],
  }
}

// ---------------------------------------------------------------------------
// Catálogos de asignaturas por etapa (sugerencias para el alta: siempre se
// pueden añadir otras a mano)
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

/** Bachillerato (LOMLOE). */
export const SUBJECT_CATALOG: CatalogGroup[] = [
  {
    id: 'comunes',
    label: 'Materias comunes',
    hint: 'Mínimo estatal. Añade la lengua cooficial si la cursas.',
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

/** «2.º de ESO · 2026/2027», o solo el curso académico si no hay curso puesto. */
export function courseLine(settings: { course: string; academicYear: string }): string {
  return [settings.course.trim(), settings.academicYear].filter(Boolean).join(' · ')
}

const ESO_CATALOG: CatalogGroup[] = [
  {
    id: 'eso-comunes',
    label: 'Materias comunes',
    hint: 'Las de casi todos los cursos de la ESO.',
    subjects: [
      { name: 'Lengua Castellana y Literatura', color: 'terracotta', weight: 4 },
      { name: 'Matemáticas', color: 'indigo', weight: 4 },
      { name: 'Inglés', color: 'sky', weight: 3 },
      { name: 'Geografía e Historia', color: 'clay', weight: 3 },
      { name: 'Biología y Geología', color: 'sage', weight: 3 },
      { name: 'Física y Química', color: 'teal', weight: 3 },
      { name: 'Educación Física', color: 'moss', weight: 2 },
    ],
  },
  {
    id: 'eso-otras',
    label: 'Otras y optativas',
    hint: 'Depende del curso y del centro.',
    subjects: [
      { name: 'Tecnología y Digitalización', color: 'slate', weight: 2 },
      { name: 'Música', color: 'plum', weight: 2 },
      { name: 'Educación Plástica, Visual y Audiovisual', color: 'amber', weight: 2 },
      { name: 'Francés', color: 'plum', weight: 2 },
      { name: 'Latín', color: 'amber', weight: 3 },
      { name: 'Economía y Emprendimiento', color: 'teal', weight: 3 },
      { name: 'Religión', color: 'slate', weight: 1 },
    ],
  },
]

export type StudyLevel = 'eso' | 'bachillerato' | 'fp' | 'universidad' | 'otro'

export interface LevelInfo {
  id: StudyLevel
  label: string
  /** Ejemplo para el campo «Curso». */
  example: string
  /** Sugerencias; vacío = cada cual escribe las suyas. */
  catalog: CatalogGroup[]
  /** Qué escribir cuando no hay catálogo. */
  customHint: string
}

export const LEVELS: LevelInfo[] = [
  { id: 'eso', label: 'ESO', example: '3.º de ESO', catalog: ESO_CATALOG, customHint: 'Otra asignatura' },
  {
    id: 'bachillerato',
    label: 'Bachillerato',
    example: '1.º de Bachillerato',
    catalog: SUBJECT_CATALOG,
    customHint: 'Otra asignatura (Religión, segunda lengua…)',
  },
  {
    id: 'fp',
    label: 'FP',
    example: '1.º de DAW',
    catalog: [],
    customHint: 'Nombre del módulo (p. ej. Programación)',
  },
  {
    id: 'universidad',
    label: 'Universidad',
    example: '2.º de Derecho',
    catalog: [],
    customHint: 'Nombre de la asignatura (p. ej. Derecho Civil I)',
  },
  {
    id: 'otro',
    label: 'Otro',
    example: 'Oposiciones, idiomas…',
    catalog: [],
    customHint: 'Materia, tema o bloque',
  },
]

/** Etapa que se deduce del texto del curso (para quien ya lo tenía puesto). */
export function levelOf(course: string): StudyLevel | null {
  const c = course.toLowerCase()
  if (/bachiller/.test(c)) return 'bachillerato'
  if (/\beso\b|secundaria/.test(c)) return 'eso'
  if (/\bfp\b|ciclo|grado (medio|superior)|daw|dam|asir|smr/.test(c)) return 'fp'
  if (/universidad|grado en|carrera|máster|master/.test(c)) return 'universidad'
  return null
}
