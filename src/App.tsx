import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings, useStore } from '@/state/StoreProvider'
import { StoreProvider } from '@/state/StoreProvider'
import { useTaskSummary } from '@/state/selectors'
import { useRoute, type Route, type RouteId } from '@/router'
import { AppShell, StorageBanner } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { DashboardView } from '@/views/DashboardView'
import { TasksView } from '@/views/TasksView'
import { CalendarView } from '@/views/CalendarView'
import { SubjectsView } from '@/views/SubjectsView'
import { SubjectDetailView } from '@/views/SubjectDetailView'
import { GradesView } from '@/views/GradesView'
import { StatsView } from '@/views/StatsView'
import { StudyView } from '@/views/StudyView'
import { GoalsView } from '@/views/GoalsView'
import { SettingsView } from '@/views/SettingsView'

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { route } = useRoute()
  const settings = useSettings()
  const { data } = useStore()
  const summary = useTaskSummary()
  const [creating, setCreating] = useState(false)

  // `summary.today` ya incluye lo atrasado (es la lista real del día), así que
  // sumarle `overdue` contaba dos veces cada tarea pasada de fecha: una sola
  // tarea atrasada enseñaba un 2 en la insignia.
  const badges = useMemo<Partial<Record<RouteId, number>>>(
    () => ({ tareas: summary.today.length }),
    [summary.today.length],
  )

  const openCreate = useCallback(() => setCreating(true), [])

  // Atajo global: «c» crea una tarea desde cualquier sección, salvo mientras
  // se está escribiendo en un campo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault()
        setCreating(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // El alta bloquea el resto: sin nombre ni asignaturas no hay nada que mostrar.
  // El aviso del almacenamiento sí pasa por encima: si se ha llegado aquí
  // porque los datos guardados eran ilegibles, esto parece un primer arranque
  // sin serlo, y es justo entonces cuando hay algo importante que contar.
  if (!settings.onboarded) {
    return (
      <>
        <StorageBanner />
        <Onboarding />
      </>
    )
  }

  return (
    <>
      <AppShell current={route.id} onCreate={openCreate} badges={badges}>
        {renderRoute(route, data.subjects.length)}
      </AppShell>

      <TaskEditor open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function renderRoute(route: Route, subjectCount: number) {
  switch (route.id) {
    case 'tareas':
      return <TasksView />
    case 'calendario':
      return <CalendarView />
    case 'asignaturas': {
      // '#/asignaturas?id=…' abre la ficha de una asignatura concreta.
      const id = route.params.get('id')
      return id ? <SubjectDetailView subjectId={id} /> : <SubjectsView />
    }
    case 'notas':
      return <GradesView />
    case 'estadisticas':
      return <StatsView />
    case 'estudio':
      return <StudyView />
    case 'objetivos':
      return <GoalsView />
    case 'ajustes':
      return <SettingsView />
    case 'inicio':
    default:
      return <DashboardView hasSubjects={subjectCount > 0} />
  }
}
