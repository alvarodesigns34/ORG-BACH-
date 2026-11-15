import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings, useStore } from '@/state/StoreProvider'
import { StoreProvider } from '@/state/StoreProvider'
import { useTaskSummary } from '@/state/selectors'
import { useRoute, type Route, type RouteId } from '@/router'
import { AppShell, StorageBanner } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { EventEditor } from '@/features/events/EventEditor'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { DashboardView } from '@/views/DashboardView'
import { TasksView } from '@/views/TasksView'
import { CalendarView } from '@/views/CalendarView'
import { SubjectsView } from '@/views/SubjectsView'
import { SubjectDetailView } from '@/views/SubjectDetailView'
import { GradesView } from '@/views/GradesView'
import { ExamsView } from '@/views/ExamsView'
import { StatsView } from '@/views/StatsView'
import { GoalsView } from '@/views/GoalsView'
import { SettingsView } from '@/views/SettingsView'

// El modo estudio trae su propio mapa (MapLibre) y los aeropuertos: se
// descarga solo al entrar, para que el resto de la app no cargue con él.
const StudyView = lazy(() => import('@/views/StudyView'))
import { Button } from '@/ui/primitives'
import { LinkChoiceDialog, RecoveryDialog } from '@/features/account/Account'
import { syncEngine } from '@/sync/engine'
import { ToastProvider } from '@/ui/Toast'
import { ChromeProvider, type CreateKind } from '@/layout/chrome'
import { AssistantSheet } from '@/features/assistant/AssistantSheet'

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  )
}

function Shell() {
  const { route } = useRoute()
  const settings = useSettings()
  const { data, hasIllegibleBackup, downloadIllegibleBackup, acknowledgeCorruptStorage } =
    useStore()
  const summary = useTaskSummary()
  const [creating, setCreating] = useState<CreateKind | null>(null)

  // `summary.today` ya incluye lo atrasado (es la lista real del día), así que
  // sumarle `overdue` contaba dos veces cada tarea pasada de fecha: una sola
  // tarea atrasada enseñaba un 2 en la insignia.
  const badges = useMemo<Partial<Record<RouteId, number>>>(
    () => ({ tareas: summary.today.length }),
    [summary.today.length],
  )

  const openCreate = useCallback((kind: CreateKind = 'tarea') => setCreating(kind), [])
  const [assistantOpen, setAssistantOpen] = useState(false)
  const openAssistant = useCallback(() => setAssistantOpen(true), [])
  const hasSubjects = data.subjects.length > 0
  const chrome = useMemo(
    () => ({ openCreate, openAssistant, hasSubjects }),
    [openCreate, openAssistant, hasSubjects],
  )
  const closeCreate = useCallback(() => setCreating(null), [])

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
        setCreating('tarea')
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
            Hay una copia del contenido original. Descárgala antes de seguir: si empiezas de cero,
            es lo único que queda del curso.
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
      <ChromeProvider value={chrome}>
        <AppShell
          current={route.id}
          screenKey={`${route.id}:${route.params.get('id') ?? ''}`}
          restoreScroll={![...route.params.keys()].some((k) => k !== 'id')}
          badges={badges}
        >
          {renderRoute(route, data.subjects.length)}
        </AppShell>
      </ChromeProvider>

      <TaskEditor open={creating === 'tarea'} onClose={closeCreate} />
      <ExamEditor open={creating === 'examen'} onClose={closeCreate} />
      <GradeEditor open={creating === 'nota'} onClose={closeCreate} />
      <EventEditor open={creating === 'evento'} onClose={closeCreate} />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} />
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
    case 'estudio':
      return (
        <Suspense fallback={null}>
          <StudyView />
        </Suspense>
      )
    case 'asignaturas': {
      const id = route.params.get('id')
      return id ? <SubjectDetailView subjectId={id} /> : <SubjectsView />
    }
    case 'notas':
      return <GradesView />
    case 'examenes':
      return <ExamsView />
    case 'estadisticas':
      return <StatsView />
    case 'objetivos':
      return <GoalsView />
    case 'ajustes':
      return <SettingsView section={route.params.get('seccion')} />
    case 'inicio':
    default:
      return <DashboardView hasSubjects={subjectCount > 0} />
  }
}
