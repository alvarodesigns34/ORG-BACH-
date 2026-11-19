import { useEffect, useRef, useState } from 'react'
import {
  Award,
  CalendarClock,
  CalendarArrowUp,
  CalendarDays,
  CalendarRange,
  Check,
  Database,
  Download,
  FileText,
  Globe,
  GraduationCap,
  Hash,
  History,
  Layers,
  ShieldCheck,
  Sigma,
  SunMoon,
  TriangleAlert,
  Upload,
  UserRound,
} from 'lucide-react'

import { courseLine } from '@/data/defaults'
import { APP_NAME } from '@/layout/Brand'
import { createEmptyData } from '@/data/defaults'
import { TERMS, type AverageMode, type TermId } from '@/domain/types'
import { useDispatch, useSettings, useStore } from '@/state/StoreProvider'
import * as storage from '@/storage/persistence'
import { Page, PageHeader } from '@/layout/AppShell'
import { AccountAvatar } from '@/layout/chrome'
import { ThemeToggle } from '@/layout/ThemeToggle'
import { AccountSection } from '@/features/account/Account'
import { DigestSection } from '@/features/notifications/DigestCard'
import { useSync } from '@/sync/useSync'
import { SnapshotsSheet } from '@/features/backup/Backups'
import { exportBackup } from '@/storage/backup'
import { exportCalendar } from '@/storage/calendarExport'
import { icsSelection } from '@/domain/ics'
import { today as todayISO } from '@/domain/dates'
import { listSnapshots, saveSnapshot } from '@/storage/snapshots'
import { ListGroup, ListRow, RowInput, RowNumber, RowSelect, RowSwitch } from '@/ui/list'
import { ConfirmDialog } from '@/ui/Modal'
import { cx } from '@/ui/primitives'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function SettingsView({ section }: { section?: string | null }) {
  const settings = useSettings()
  const dispatch = useDispatch()
  const { data, replaceAndSave } = useStore()
  const sync = useSync()
  const synced = !!sync.email

  // `#/ajustes?seccion=cuenta` (desde el indicador de sincronización) lleva
  // directamente a la tarjeta de la cuenta.
  useEffect(() => {
    if (!section) return
    const id = requestAnimationFrame(() =>
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
    return () => cancelAnimationFrame(id)
  }, [section])

  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(
    null,
  )
  const [confirmReset, setConfirmReset] = useState(false)
  /** Copia ya leída y validada, a la espera de que el alumno confirme. */
  const [pendingImport, setPendingImport] = useState<Extract<
    ReturnType<typeof storage.importJSON>,
    { ok: true }
  > | null>(null)

  const update = (
    patch: Parameters<typeof dispatch>[0] extends never ? never : Partial<typeof settings>,
  ) => dispatch({ type: 'settings/update', patch })

  // --- Exportar ---
  // En iPad abre la hoja de compartir («Guardar en Archivos»); en el resto,
  // descarga el archivo (ver `exportBackup`).
  const calendarDetail = (() => {
    const sel = icsSelection({ tasks: data.tasks, exams: data.exams, subjects: data.subjects, today: todayISO() })
    const t = sel.tasks.length
    const e = sel.exams.length
    return `${t} ${t === 1 ? 'tarea' : 'tareas'} con fecha y ${e} ${e === 1 ? 'examen' : 'exámenes'}, en un archivo .ics`
  })()
  const exportData = async () => {
    if (await exportBackup(data)) setNotice({ tone: 'ok', text: 'Copia guardada correctamente.' })
  }
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [lastSnapshot, setLastSnapshot] = useState<number>()
  useEffect(() => {
    if (snapshotsOpen) return
    let cancelled = false
    void listSnapshots().then(([snapshot]) => {
      if (!cancelled) setLastSnapshot(snapshot?.at)
    })
    return () => { cancelled = true }
  }, [snapshotsOpen])

  // --- Importar ---
  // Se lee y se valida el archivo, pero NO se aplica todavía: importar borra
  // el curso entero, igual que «Empezar de cero», y era la única acción
  // destructiva que no pedía confirmación. Con el archivo ya leído se puede
  // además decir cuántas asignaturas y notas van a entrar, que es lo que
  // permite darse cuenta de que uno se ha equivocado de copia.
  const importFile = async (file: File) => {
    try {
      const result = storage.importJSON(await file.text())
      if (!result.ok) setNotice({ tone: 'danger', text: result.error })
      else setPendingImport(result)
    } catch {
      setNotice({ tone: 'danger', text: 'No se pudo leer el archivo. Selecciona otra copia o vuelve a intentarlo.' })
    }
  }

  const applyImport = async () => {
    if (!pendingImport) return
    // Lo de ahora se guarda como copia automática: importar se puede deshacer.
    await saveSnapshot(data, 'antes-importar')
    if (!replaceAndSave(pendingImport.data)) {
      setPendingImport(null)
      setNotice({ tone: 'danger', text: 'La copia no se pudo guardar. Tu curso actual sigue abierto.' })
      return
    }
    setNotice(
      pendingImport.warning
        ? { tone: 'warn', text: `Datos importados. ${pendingImport.warning}` }
        : { tone: 'ok', text: 'Datos importados. Se ha sustituido todo el contenido anterior.' },
    )
    setPendingImport(null)
  }

  const counts = [
    plural(data.subjects.length, 'asignatura', 'asignaturas'),
    plural(data.tasks.length, 'tarea', 'tareas'),
    plural(data.grades.length, 'nota', 'notas'),
  ].join(' · ')

  return (
    <Page className="max-w-[680px]">
      <PageHeader title="Ajustes" />

      <div className="flex flex-col gap-8">
        {/* --- Perfil: como la tarjeta del ID de Apple --- */}
        <div className="card flex items-center gap-4 px-4 py-4">
          <AccountAvatar size={60} decorative />
          <div className="min-w-0">
            <p className="text-[1.25rem] font-semibold tracking-[-0.012em] truncate">
              {settings.userName || 'Sin nombre'}
            </p>
            <p className="text-[0.875rem] text-ink-3 truncate">
              {sync.email ?? courseLine(settings)}
            </p>
          </div>
        </div>

        <AccountSection />
        <DigestSection />

        <ListGroup header="Perfil">
          <RowInput
            icon={UserRound}
            tint="#8e8e93"
            label="Nombre"
            value={settings.userName}
            placeholder="Tu nombre"
            onChange={(userName) => update({ userName })}
          />
          <RowInput
            icon={GraduationCap}
            tint="#bf5af2"
            label="Curso"
            value={settings.course}
            placeholder="2.º de ESO, 1.º de Bachillerato…"
            onChange={(course) => update({ course })}
          />
          <RowInput
            icon={CalendarRange}
            tint="#ff9f0a"
            label="Curso académico"
            value={settings.academicYear}
            placeholder="2026/2027"
            onChange={(academicYear) => update({ academicYear })}
          />
          <RowSelect
            icon={Layers}
            tint="#0a84ff"
            label="Evaluación actual"
            value={settings.activeTerm}
            onChange={(activeTerm) => update({ activeTerm: activeTerm as TermId })}
            options={TERMS.map((t) => ({ value: t.id, label: t.name }))}
          />
        </ListGroup>

        <ListGroup
          header="Apariencia"
          footer="«Automático» sigue la configuración de tu dispositivo."
        >
          <ListRow icon={SunMoon} tint="#5e5ce6" label="Tema" accessory={<ThemeToggle />} />
          <RowSelect
            icon={CalendarDays}
            tint="#ff453a"
            label="La semana empieza"
            value={String(settings.weekStartsOn)}
            onChange={(v) => update({ weekStartsOn: Number(v) as 0 | 1 })}
            options={[
              { value: '1', label: 'En lunes' },
              { value: '0', label: 'En domingo' },
            ]}
          />
        </ListGroup>

        <ListGroup
          header="Calificación"
          footer={
            settings.averageMode === 'aritmetica'
              ? 'En la media global todas las asignaturas valen lo mismo.'
              : 'En la media global cada asignatura pesa según sus horas semanales.'
          }
        >
          <RowNumber
            icon={Award}
            tint="#30b158"
            label="Nota máxima"
            min={1}
            max={100}
            value={settings.gradeScale.max}
            fallback={10}
            onCommit={(max) =>
              update({
                gradeScale: {
                  ...settings.gradeScale,
                  max,
                  // El aprobado nunca puede quedar por encima del máximo.
                  pass: Math.min(settings.gradeScale.pass, max),
                },
              })
            }
          />
          <RowNumber
            icon={Check}
            tint="#30b158"
            label="Aprobado desde"
            min={0}
            max={settings.gradeScale.max}
            value={settings.gradeScale.pass}
            fallback={5}
            onCommit={(pass) => update({ gradeScale: { ...settings.gradeScale, pass } })}
          />
          <RowSelect
            icon={Hash}
            tint="#64d2ff"
            label="Decimales"
            value={String(settings.gradeScale.decimals)}
            onChange={(v) =>
              update({ gradeScale: { ...settings.gradeScale, decimals: Number(v) } })
            }
            options={[
              { value: '0', label: 'Ninguno' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
            ]}
          />
          <RowSelect
            icon={Sigma}
            tint="#0a84ff"
            label="Media global"
            value={settings.averageMode}
            onChange={(averageMode) => update({ averageMode: averageMode as AverageMode })}
            options={[
              { value: 'aritmetica', label: 'Aritmética' },
              { value: 'ponderada', label: 'Por horas' },
            ]}
          />
        </ListGroup>

        <ListGroup
          header="Avisos en Inicio"
          footer="Exámenes cercanos, tareas atrasadas, asignaturas por debajo de su objetivo y semanas con demasiadas tareas juntas, en Inicio. Si lo apagas, tampoco te llega el resumen diario por notificación."
        >
          <RowSwitch
            icon={TriangleAlert}
            tint="#ff9f0a"
            label="Mostrar avisos"
            checked={settings.alertsEnabled}
            onChange={(alertsEnabled) => update({ alertsEnabled })}
          />
          {settings.alertsEnabled && (
            <RowNumber
              icon={CalendarClock}
              tint="#ff453a"
              label="Antelación"
              suffix="días antes"
              min={1}
              max={30}
              integer
              value={settings.examAlertDays}
              fallback={7}
              onCommit={(examAlertDays) => update({ examAlertDays })}
            />
          )}
        </ListGroup>

        <ListGroup
          header="Tus datos"
          footer={
            notice ? (
              <span
                role="status"
                className={cx(
                  notice.tone === 'ok' && 'text-ok',
                  notice.tone === 'warn' && 'text-warn',
                  notice.tone === 'danger' && 'text-danger',
                )}
              >
                {notice.text}
              </span>
            ) : synced ? (
              'Se guardan en este dispositivo y en tu cuenta. La copia es un archivo JSON legible que puedes guardar donde quieras.'
            ) : (
              'Se guardan solo en este dispositivo. Exporta una copia de vez en cuando, o inicia sesión para tenerla en la nube.'
            )
          }
        >
          <ListRow icon={Database} tint="#8e8e93" label="Contenido" value={counts} />
          <ListRow icon={Download} tint="#0a84ff" label="Exportar copia" onClick={() => void exportData()} />
          <ListRow
            icon={CalendarArrowUp}
            tint="#ff3b30"
            label="Exportar al calendario"
            detail={calendarDetail}
            onClick={() => {
              exportCalendar(data)
              setNotice({ tone: 'ok', text: 'Calendario exportado. En iPhone y iPad, toca «Añadir todo» para pasarlo a Calendario.' })
            }}
          />
          <ListRow
            icon={History}
            tint="#30b158"
            label="Copias automáticas"
            detail={lastSnapshot
              ? `Última copia: ${new Date(lastSnapshot).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}`
              : 'Una al día, y antes de importar o borrar'}
            onClick={() => setSnapshotsOpen(true)}
          />
          <ListRow
            icon={Upload}
            tint="#0a84ff"
            label="Importar copia"
            onClick={() => fileInput.current?.click()}
          />
          <ListRow label="Empezar de cero" action="danger" onClick={() => setConfirmReset(true)} />
        </ListGroup>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = ''
          }}
        />

        <ListGroup
          header="Acerca de"
          footer={
            <span className="block space-y-1">
              <span className="block">
                Mapa del modo Estudio:{' '}
                <a className="underline underline-offset-2" href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
                , con datos ©{' '}
                <a className="underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>
                {' '}(ODbL). Contornos del globo: Natural Earth. Aeropuertos: OurAirports (dominio público).
              </span>
              <span className="block">
                Asistente: modelos de Mistral AI (Francia). Sonidos de ambiente: grabaciones de dominio público vía radio aporee e Internet Archive (detalle en el modo Estudio).
              </span>
            </span>
          }
        >
          <ListRow
            icon={Globe}
            tint="#0a84ff"
            label="Ver la presentación de Órbita"
            detail="La web que ve quien llega por primera vez"
            onClick={() => window.location.assign(`${import.meta.env.BASE_URL}?presentacion`)}
          />
          <ListRow
            icon={ShieldCheck}
            tint="#30b158"
            label="Política de privacidad"
            href={`${import.meta.env.BASE_URL}legal/privacidad.html`}
          />
          <ListRow
            icon={FileText}
            tint="#8e8e93"
            label="Condiciones de uso"
            href={`${import.meta.env.BASE_URL}legal/condiciones.html`}
          />
        </ListGroup>

        <p className="text-center text-[0.75rem] text-ink-3 pb-2">
          {APP_NAME} · {courseLine(settings)}
        </p>
      </div>

      <SnapshotsSheet open={snapshotsOpen} onClose={() => setSnapshotsOpen(false)} />

      <ConfirmDialog
        open={!!pendingImport}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => void applyImport()}
        title="Importar esta copia"
        message={
          pendingImport
            ? `Se sustituirá TODO lo que tienes ahora por el contenido de la copia: ` +
              `${pendingImport.data.subjects.length} asignaturas, ` +
              `${pendingImport.data.grades.length} notas, ` +
              `${pendingImport.data.tasks.length} tareas y ` +
              `${pendingImport.data.exams.length} exámenes.` +
              (pendingImport.warning ? ` ${pendingImport.warning}` : '') +
              ' Lo que tienes ahora queda guardado en «Copias automáticas».'
            : ''
        }
        confirmLabel="Importar y sustituir"
        destructive
      />

      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false)
          // Por si era un error: queda en «Copias automáticas».
          await saveSnapshot(data, 'antes-borrar')
          if (!replaceAndSave(createEmptyData())) {
            setNotice({ tone: 'danger', text: 'No se pudo iniciar un curso vacío. Tus datos siguen abiertos.' })
          }
        }}
        title="Borrar todos los datos"
        message={
          synced
            ? 'Se eliminarán asignaturas, tareas, exámenes y notas en este dispositivo y en tu cuenta, así que desaparecerán también de tus otros dispositivos. En este dispositivo quedará una copia en «Copias automáticas» por si te arrepientes.'
            : 'Se eliminarán asignaturas, tareas, exámenes y notas, y volverás a la pantalla de bienvenida. En este dispositivo quedará una copia en «Copias automáticas» por si te arrepientes.'
        }
        confirmLabel="Borrar todo"
        destructive
      />
    </Page>
  )
}
