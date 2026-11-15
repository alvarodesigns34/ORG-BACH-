import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  CircleCheckBig,
  ClipboardCheck,
  GraduationCap,
  House,
  Plane,
  Settings,
  Target,
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
  { id: 'tareas', label: 'Tareas', icon: CircleCheckBig, group: 'dia' },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays, group: 'dia' },
  { id: 'estudio', label: 'Estudio', icon: Plane, group: 'dia' },
  { id: 'asignaturas', label: 'Asignaturas', icon: BookOpen, group: 'academico' },
  { id: 'notas', label: 'Notas', icon: GraduationCap, group: 'academico' },
  { id: 'examenes', label: 'Exámenes', icon: ClipboardCheck, group: 'academico' },
  { id: 'estadisticas', label: 'Estadísticas', icon: ChartNoAxesColumn, group: 'academico' },
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
  inicio: '#007aff',
  tareas: '#5856d6',
  calendario: '#ff3b30',
  estudio: '#0a8f86',
  asignaturas: '#ff9500',
  notas: '#af52de',
  examenes: '#0a6fb0',
  estadisticas: '#34c759',
  objetivos: '#ff2d55',
  ajustes: '#8e8e93',
}

/**
 * Relleno de la ficha de un icono: el color de sistema con luz arriba, como
 * los iconos de Ajustes de iOS. Se combina con la clase `.tile` (canto y sombra).
 */
export function tintFill(color: string): string {
  return `linear-gradient(180deg, color-mix(in srgb, ${color} 72%, white) 0%, ${color} 100%)`
}
