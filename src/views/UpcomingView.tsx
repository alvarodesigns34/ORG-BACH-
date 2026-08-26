import { ArrowRight, GraduationCap, Target, Timer, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { hrefFor, type RouteId } from '@/router'
import { Page, PageHeader } from '@/layout/AppShell'
import { Card, cx } from '@/ui/primitives'

type UpcomingId = 'notas' | 'estadisticas' | 'estudio' | 'objetivos'

interface SectionSpec {
  title: string
  phase: string
  icon: LucideIcon
  summary: string
  /** Lo que hará exactamente. Nada de promesas vagas. */
  features: string[]
  /** Qué se puede hacer ya que prepara el terreno. */
  meanwhile: { label: string; route: RouteId }
}

/**
 * Secciones aún no construidas.
 *
 * Se declara sin rodeos lo que falta y en qué fase llega, en lugar de enseñar
 * una pantalla con datos de mentira. Una interfaz que aparenta funcionar es
 * peor que una que dice la verdad: hace perder el tiempo buscando el botón que
 * no existe.
 */
const SECTIONS: Record<UpcomingId, SectionSpec> = {
  notas: {
    title: 'Notas',
    phase: 'Fase 3',
    icon: GraduationCap,
    summary:
      'El registro de calificaciones con medias ponderadas y la calculadora de «qué nota necesito».',
    features: [
      'Registrar cada nota con su tipo, su peso y su evaluación',
      'Media ponderada por asignatura, respetando el reparto que configures',
      'Calculadora: qué nota necesitas en lo que queda para llegar a tu objetivo',
      'Simulador: con qué media acabarías si sacas una nota concreta',
      'Medias por evaluación y nota final del curso',
    ],
    meanwhile: { label: 'Configurar el reparto de pesos de cada asignatura', route: 'asignaturas' },
  },
  estadisticas: {
    title: 'Estadísticas',
    phase: 'Fase 4',
    icon: TrendingUp,
    summary: 'La evolución del curso en gráficos: qué mejora, qué empeora y dónde va el tiempo.',
    features: [
      'Evolución de la media a lo largo del curso',
      'Comparativa entre asignaturas',
      'Tareas completadas frente a tareas atrasadas',
      'Reparto de las horas de estudio por asignatura',
    ],
    meanwhile: { label: 'Ir apuntando exámenes y tareas para tener datos', route: 'calendario' },
  },
  estudio: {
    title: 'Estudio',
    phase: 'Fase 4',
    icon: Timer,
    summary: 'Temporizador Pomodoro y registro de las horas que dedicas a cada asignatura.',
    features: [
      'Temporizador Pomodoro y temporizador libre',
      'Registro de cada sesión con asignatura, tema y duración',
      'Totales de hoy, de la semana y del mes',
    ],
    meanwhile: { label: 'Estimar el tiempo de tus tareas para planificar', route: 'tareas' },
  },
  objetivos: {
    title: 'Objetivos',
    phase: 'Fase 4',
    icon: Target,
    summary: 'Metas de nota y de horas de estudio, con su progreso calculado automáticamente.',
    features: [
      'Objetivos diarios, semanales, trimestrales y anuales',
      'Progreso calculado a partir de tus notas y tus sesiones reales',
      'Aviso cuando una asignatura se aleja de su objetivo',
    ],
    meanwhile: { label: 'Fijar la nota objetivo de cada asignatura', route: 'asignaturas' },
  },
}

export function UpcomingView({ section }: { section: UpcomingId }) {
  const spec = SECTIONS[section]
  const Icon = spec.icon

  return (
    <Page className="max-w-[720px]">
      <PageHeader title={spec.title} />

      <Card className="relative overflow-hidden">
        {/* Franja de estado: identifica el bloque sin recurrir a un cartel. */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-accent/35" />

        <div className="flex items-start gap-4">
          <div className="size-11 grid place-items-center rounded-md bg-accent-quiet text-accent shrink-0">
            <Icon className="size-5" strokeWidth={2} />
          </div>

          <div className="min-w-0">
            <p className="eyebrow text-accent">En construcción · {spec.phase}</p>
            <h2 className="text-[1.125rem] font-semibold tracking-[-0.015em] mt-1.5">
              Esta sección todavía no está lista
            </h2>
            <p className="text-[0.9375rem] text-ink-2 mt-2 leading-relaxed text-balance">
              {spec.summary}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-hairline">
          <p className="eyebrow mb-3">Lo que incluirá</p>
          <ul className="flex flex-col gap-2.5">
            {spec.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-[0.875rem] text-ink-2">
                <span
                  aria-hidden
                  className="mt-[7px] size-1.5 rounded-full bg-hairline-strong shrink-0"
                />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 pt-6 border-t border-hairline">
          <p className="eyebrow mb-3">Mientras tanto</p>
          <a
            href={hrefFor(spec.meanwhile.route)}
            className={cx(
              'group inline-flex items-center gap-2 h-10 px-4 rounded-sm',
              'bg-surface border border-hairline-strong text-[0.875rem] font-medium text-ink',
              'hover:border-ink-3/45 transition-colors duration-150',
            )}
          >
            {spec.meanwhile.label}
            <ArrowRight className="size-4 text-ink-3 group-hover:translate-x-0.5 transition-transform duration-150" />
          </a>
        </div>
      </Card>
    </Page>
  )
}
