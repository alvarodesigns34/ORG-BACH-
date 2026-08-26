import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings, useStore } from '@/state/StoreProvider'
import { StoreProvider } from '@/state/StoreProvider'
import { useTaskSummary } from '@/state/selectors'
import { useRoute, type RouteId } from '@/router'
import { AppShell } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { DashboardView } from '@/views/DashboardView'
import { TasksView } from '@/views/TasksView'
import { CalendarView } from '@/views/CalendarView'
import { SubjectsView } from '@/views/SubjectsView'
import { SettingsView } from '@/views/SettingsView'
import { UpcomingView } from '@/views/UpcomingView'

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

  const badges = useMemo<Partial<Record<RouteId, number>>>(
    () => ({ tareas: summary.overdue.length + summary.today.length }),
    [summary.overdue.length, summary.today.length],
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
  if (!settings.onboarded) return <Onboarding />

  return (
    <>
      <AppShell current={route.id} onCreate={openCreate} badges={badges}>
        {renderRoute(route.id, data.subjects.length)}
      </AppShell>

      <TaskEditor open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function renderRoute(id: RouteId, subjectCount: number) {
  switch (id) {
    case 'tareas':
      return <TasksView />
    case 'calendario':
      return <CalendarView />
    case 'asignaturas':
      return <SubjectsView />
    case 'notas':
    case 'estadisticas':
    case 'estudio':
    case 'objetivos':
      return <UpcomingView section={id} />
    case 'ajustes':
      return <SettingsView />
    case 'inicio':
    default:
      return <DashboardView hasSubjects={subjectCount > 0} />
  }
}
