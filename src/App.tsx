import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings, useStore } from '@/state/StoreProvider'
import { StoreProvider } from '@/state/StoreProvider'
import { useTaskSummary } from '@/state/selectors'
import { hrefFor, useRoute, type Route, type RouteId } from '@/router'
import { AppShell, StorageBanner } from '@/layout/AppShell'
import { BrandMark } from '@/layout/Brand'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { EventEditor } from '@/features/events/EventEditor'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { prewarmStudyMap, scheduleStudyMapPrewarm } from '@/features/study/prewarm'
import { DashboardView } from '@/views/DashboardView'
import { SubjectsView } from '@/views/SubjectsView'

import { Button } from '@/ui/primitives'
import { LinkChoiceDialog, RecoveryDialog } from '@/features/account/Account'
import { syncEngine } from '@/sync/engine'
import { ToastProvider } from '@/ui/Toast'
import { ChromeProvider, type CreateKind } from '@/layout/chrome'
import { FlightController } from '@/features/study/FlightController'
import { ShortcutsSheet, useKeyboardShortcuts } from '@/layout/shortcuts'

const TasksView = lazy(() => import('@/views/TasksView').then((m) => ({ default: m.TasksView })))
const StudyView = lazy(() => import('@/views/StudyView'))
const CalendarView = lazy(() => import('@/views/CalendarView').then((m) => ({ default: m.CalendarView })))

const SubjectDetailView = lazy(() => import('@/views/SubjectDetailView').then((m) => ({ default: m.SubjectDetailView })))

const GradesView = lazy(() => import('@/views/GradesView').then((m) => ({ default: m.GradesView })))

const ExamsView = lazy(() => import('@/views/ExamsView').then((m) => ({ default: m.ExamsView })))

const StatsView = lazy(() => import('@/views/StatsView').then((m) => ({ default: m.StatsView })))

const GoalsView = lazy(() => import('@/views/GoalsView').then((m) => ({ default: m.GoalsView })))

const SettingsView = lazy(() => import('@/views/SettingsView').then((m) => ({ default: m.SettingsView })))

const AssistantSheet = lazy(() => import('@/features/assistant/AssistantSheet').then((m) => ({ default: m.AssistantSheet })))

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
  const [assistantLoaded, setAssistantLoaded] = useState(false)
  const [assistantStart, setAssistantStart] = useState<{ mode: 'text' | 'voice'; at: number }>()
  const openAssistant = useCallback((mode?: unknown) => {
    // Sin argumento (o con el evento de un onClick), se abre para escribir.
    setAssistantStart({ mode: mode === 'voice' ? 'voice' : 'text', at: Date.now() })
    setAssistantLoaded(true)
    setAssistantOpen(true)
  }, [])
  const hasSubjects = data.subjects.length > 0
  const chrome = useMemo(
    () => ({ openCreate, openAssistant, hasSubjects }),
    [openCreate, openAssistant, hasSubjects],
  )
  const closeCreate = useCallback(() => setCreating(null), [])

  // La sincronización arranca dentro del proveedor: necesita el puente con el
  // almacén. Sin cuenta configurada no hace nada.
  useEffect(() => syncEngine.start(), [])

  // El globo de Estudio se descarga en reposo, con Inicio ya pintado; y si se
  // abre Estudio antes, su descarga arranca a la vez que la de la vista.
  const onStudy = route.id === 'estudio'
  useEffect(() => {
    if (!settings.onboarded) return
    if (onStudy) {
      void prewarmStudyMap()
      return
    }
    return scheduleStudyMapPrewarm()
  }, [onStudy, settings.onboarded])

  // Atajos de teclado (iPad con teclado y ordenador) y su hoja de ayuda.
  const flightActive = data.sessions.some((s) => s.status === 'en_vuelo')
  const shortcuts = useKeyboardShortcuts({ openCreate, openAssistant, flightActive })

  // `?crear=tarea|examen|nota|evento` en cualquier ruta abre el editor: lo
  // usan los accesos directos de la app instalada.
  const { navigate } = useRoute()
  const createParam = route.params.get('crear')
  useEffect(() => {
    if (!createParam) return
    if (['tarea', 'examen', 'nota', 'evento'].includes(createParam)) {
      setCreating(createParam as CreateKind)
    }
    const params = Object.fromEntries([...route.params].filter(([k]) => k !== 'crear'))
    navigate(route.id, Object.keys(params).length ? params : undefined, true)
    // Solo reacciona al parámetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createParam])

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
          <ErrorBoundary fallback={<RouteFailure study={route.id === 'estudio'} />}>
            <Suspense fallback={<RouteLoading study={route.id === 'estudio'} />}>
              {renderRoute(route, data.subjects.length)}
            </Suspense>
          </ErrorBoundary>
        </AppShell>
      </ChromeProvider>

      <TaskEditor open={creating === 'tarea'} onClose={closeCreate} />
      <ExamEditor open={creating === 'examen'} onClose={closeCreate} />
      <GradeEditor open={creating === 'nota'} onClose={closeCreate} />
      <EventEditor open={creating === 'evento'} onClose={closeCreate} />
      {assistantLoaded && (
        <ErrorBoundary fallback={assistantOpen && (
          <div className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-sm rounded-3xl bg-surface p-5 shadow-xl" role="alert">
            <p className="mb-3">El asistente no está disponible. Puedes seguir usando el curso.</p>
            <Button onClick={() => { setAssistantOpen(false); setAssistantLoaded(false) }}>Cerrar</Button>
          </div>
        )}>
          <Suspense fallback={assistantOpen && <AssistantLoading onClose={() => setAssistantOpen(false)} />}>
            <AssistantSheet
              open={assistantOpen}
              start={assistantStart}
              onClose={() => setAssistantOpen(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* El vuelo sigue (escalas, aterrizaje, sonido, pantalla de bloqueo)
          aunque se salga del modo estudio. */}
      <FlightController />
      <ShortcutsSheet open={shortcuts.helpOpen} onClose={() => shortcuts.setHelpOpen(false)} />
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
      return <StudyView />
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

function RouteFailure({ study }: { study: boolean }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center" role="alert">
      <h1 className="display text-3xl">{study ? 'Estudio no pudo abrirse' : 'Esta vista no está disponible'}</h1>
      <p className="my-4 text-ink-2">Tus datos siguen guardados en Órbita.</p>
      <a className="font-semibold text-accent" href={hrefFor('inicio')}>Volver a Inicio</a>
    </div>
  )
}

function RouteLoading({ study }: { study: boolean }) {
  return (
    <div role="status" className="grid min-h-[48dvh] place-items-center px-6">
      <div className="flex flex-col items-center gap-4 animate-fade">
        <BrandMark size={52} />
        <span className="text-sm font-medium text-ink-2">{study ? 'Abriendo Estudio…' : 'Cargando vista…'}</span>
      </div>
    </div>
  )
}

function AssistantLoading({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-x-4 bottom-24 z-[70] mx-auto flex max-w-sm items-center justify-between gap-4 rounded-3xl bg-surface p-4 shadow-xl">
      <span role="status" className="text-sm text-ink-2">Abriendo el asistente…</span>
      <Button size="sm" onClick={onClose}>Cerrar</Button>
    </div>
  )
}
