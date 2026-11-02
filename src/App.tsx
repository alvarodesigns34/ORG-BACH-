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
import { Button } from '@/ui/primitives'
import { LinkChoiceDialog, RecoveryDialog } from '@/features/account/Account'
import { syncEngine } from '@/sync/engine'

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
  const { data, hasIllegibleBackup, downloadIllegibleBackup, acknowledgeCorruptStorage } = useStore()
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

  // La sincronización arranca dentro del proveedor: necesita el puente con el
  // almacén. Sin cuenta configurada no hace nada.
  useEffect(() => syncEngine.start(), [])

  // Atajo global: «c» crea una tarea desde cualquier sección, salvo mientras
  // se está escribiendo en un campo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.isComposing) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (
        target?.closest(
          'input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"], [role="tab"], [role="radio"]',
        )
      ) {
        return
      }
      // Con un diálogo abierto, «c» abría OTRO editor encima.
      if (document.querySelector('[aria-modal="true"]')) return
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault()
        setCreating(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Datos ilegibles: el alta parece un primer arranque y terminar el alta
  // escribiría encima de la única copia. Primero hay que bajarla o confirmar.
  if (hasIllegibleBackup) {
    return (
      <div className="min-h-dvh grid place-items-center px-6 bg-canvas pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md flex flex-col gap-4">
          <StorageBanner />
          <h1 className="display text-[1.75rem] leading-tight">
            No se pudieron leer los datos guardados
          </h1>
          <p className="text-[0.875rem] text-ink-2 leading-relaxed">
            Hay una copia del contenido original. Descárgala antes de seguir:
            si empiezas de cero, es lo único que queda del curso.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={downloadIllegibleBackup}>
              Descargar copia ilegible
            </Button>
            <Button variant="danger" onClick={acknowledgeCorruptStorage}>
              Empezar de cero
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // El alta bloquea el resto: sin nombre ni asignaturas no hay nada que mostrar.
  if (!settings.onboarded) {
    return (
      <>
        <StorageBanner />
        <Onboarding />
        <LinkChoiceDialog />
        <RecoveryDialog />
      </>
    )
  }

  return (
    <>
      <AppShell current={route.id} onCreate={openCreate} badges={badges}>
        {renderRoute(route, data.subjects.length)}
      </AppShell>

      <TaskEditor open={creating} onClose={() => setCreating(false)} />
      <LinkChoiceDialog />
      <RecoveryDialog />
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
      return <SettingsView section={route.params.get('seccion')} />
    case 'inicio':
    default:
      return <DashboardView hasSubjects={subjectCount > 0} />
  }
}
