import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  House,
  ListChecks,
  Settings,
  Target,
  Timer,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import type { RouteId } from '@/router'

export interface NavItem {
  id: RouteId
  label: string
  icon: LucideIcon
  /** Cabecera de sección en el menú lateral. */
  group: 'dia' | 'academico' | 'sistema'
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'inicio', label: 'Inicio', icon: House, group: 'dia' },
  { id: 'tareas', label: 'Tareas', icon: ListChecks, group: 'dia' },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays, group: 'dia' },
  { id: 'asignaturas', label: 'Asignaturas', icon: BookOpen, group: 'academico' },
  { id: 'notas', label: 'Notas', icon: GraduationCap, group: 'academico' },
  { id: 'estadisticas', label: 'Estadísticas', icon: TrendingUp, group: 'academico' },
  { id: 'estudio', label: 'Estudio', icon: Timer, group: 'sistema' },
  { id: 'objetivos', label: 'Objetivos', icon: Target, group: 'sistema' },
  { id: 'ajustes', label: 'Ajustes', icon: Settings, group: 'sistema' },
]

export const NAV_GROUPS: { id: NavItem['group']; label: string }[] = [
  { id: 'dia', label: 'Día a día' },
  { id: 'academico', label: 'Académico' },
  { id: 'sistema', label: 'Seguimiento' },
]

/** Las cuatro secciones de la barra inferior en móvil; el resto va en «Más». */
export const MOBILE_PRIMARY: RouteId[] = ['inicio', 'tareas', 'calendario', 'notas']

/**
 * Color de cada sección en las listas con icono (hoja «Más», menú lateral),
 * al estilo de Ajustes de iOS. Es decorativo: el nombre siempre va escrito.
 */
export const NAV_TINTS: Record<RouteId, string> = {
  inicio: '#0a84ff',
  tareas: '#5e5ce6',
  calendario: '#ff453a',
  asignaturas: '#ff9f0a',
  notas: '#bf5af2',
  estadisticas: '#30b158',
  estudio: '#ff6b2c',
  objetivos: '#ff375f',
  ajustes: '#8e8e93',
}
