import { useEffect, useState, useSyncExternalStore } from 'react'
import { CloudUpload, Download, ShieldCheck, X } from 'lucide-react'

import { useStore } from '@/state/StoreProvider'
import { useSync } from '@/sync/useSync'
import { hrefFor } from '@/router'
import {
  backupNudge,
  exportBackup,
  loadBackupState,
  snoozeBackup,
  subscribeBackup,
} from '@/storage/backup'
import { listSnapshots, readSnapshot, saveSnapshot, type SnapshotMeta } from '@/storage/snapshots'
import { exportJSON, migrateWithReport } from '@/storage/persistence'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button, IconButton, cx } from '@/ui/primitives'
import { useToast } from '@/ui/Toast'

let cachedState = loadBackupState()
const subscribe = (fn: () => void) =>
  subscribeBackup(() => {
    cachedState = loadBackupState()
    fn()
  })

export function useBackupState() {
  return useSyncExternalStore(subscribe, () => cachedState, () => cachedState)
}

/**
 * Aviso en Inicio cuando hace tiempo (o muchos cambios) desde la última copia
 * y no hay cuenta. Una fila discreta, con las dos salidas reales —exportar o
 * iniciar sesión— y «Más tarde», que lo calla una semana.
 */
export function BackupNudge() {
  const { data } = useStore()
  const sync = useSync()
  const state = useBackupState()
  const toast = useToast()
  const nudge = backupNudge(data, state, { signedIn: !!sync.email })
  if (!nudge) return null

  const text =
    nudge.reason === 'nunca'
      ? 'Tus datos solo están en este dispositivo. Guarda una copia por si lo pierdes o lo restableces.'
      : nudge.reason === 'muchos-cambios'
        ? `Has apuntado ${nudge.since} cosas desde tu última copia. ¿Guardas una nueva?`
        : `Tu última copia es de hace ${nudge.days} días y desde entonces has apuntado ${nudge.since} ${nudge.since === 1 ? 'cosa' : 'cosas'}.`

  return (
    <div role="status" className="card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 mb-4">
      <span className="grid place-items-center size-10 rounded-[12px] bg-accent-quiet text-accent shrink-0">
        <ShieldCheck className="size-5" strokeWidth={2.2} />
      </span>
      <p className="flex-1 basis-[16rem] min-w-0 text-[0.875rem] text-ink-2 leading-snug">{text}</p>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            if (await exportBackup(data)) toast({ text: 'Copia guardada' })
          }}
        >
          <Download className="size-3.5" strokeWidth={2.4} />
          Guardar copia
        </Button>
        {sync.phase !== 'unavailable' && (
          <Button
            size="sm"
            onClick={() => (window.location.hash = hrefFor('ajustes', { seccion: 'cuenta' }).slice(1))}
          >
            <CloudUpload className="size-3.5" strokeWidth={2.4} />
            Iniciar sesión
          </Button>
        )}
        <IconButton label="Más tarde" size="sm" onClick={() => snoozeBackup()}>
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}

const REASON: Record<SnapshotMeta['reason'], string> = {
  diaria: 'Copia del día',
  'antes-importar': 'Antes de importar',
  'antes-borrar': 'Antes de empezar de cero',
  'antes-restaurar': 'Antes de restaurar',
}

function when(at: number): string {
  return new Date(at).toLocaleString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Las copias automáticas: restaurar o descargar cualquiera. */
export function SnapshotsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, replaceAndSave } = useStore()
  const toast = useToast()
  const [list, setList] = useState<SnapshotMeta[] | null>(null)
  const [restoring, setRestoring] = useState<SnapshotMeta | null>(null)

  useEffect(() => {
    if (!open) return
    setList(null)
    void listSnapshots().then(setList)
  }, [open])

  const download = async (meta: SnapshotMeta) => {
    const snap = await readSnapshot(meta.id)
    if (!snap) return
    const blob = new Blob([exportJSON(snap)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orbita-copia-${new Date(meta.at).toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const restore = async () => {
    const meta = restoring
    setRestoring(null)
    if (!meta) return
    const snap = await readSnapshot(meta.id)
    if (!snap) {
      toast({ text: 'No se pudo leer esa copia' })
      return
    }
    // Lo de ahora también se guarda, por si la restauración era un error.
    await saveSnapshot(data, 'antes-restaurar')
    // Pasa por el mismo validador que una importación.
    if (!replaceAndSave(migrateWithReport(snap).data)) {
      toast({ text: 'La copia no se pudo guardar. Tu curso actual sigue abierto.' })
      return
    }
    onClose()
    toast({ text: `Restaurada la copia del ${when(meta.at)}` })
  }

  const describe = (c: SnapshotMeta['counts']) =>
    [
      `${c.subjects} asignaturas`,
      `${c.tasks} tareas`,
      `${c.grades} notas`,
      c.sessions ? `${c.sessions} vuelos` : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <>
      <Modal
        open={open && !restoring}
        onClose={onClose}
        title="Copias automáticas"
        description="Una al día (las 7 últimas) y otra antes de importar, borrar o restaurar. Se guardan en este dispositivo: no sustituyen a exportar ni a tener cuenta."
        size="md"
      >
        {list === null ? (
          <p className="py-6 text-center text-[0.875rem] text-ink-3">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-[0.875rem] text-ink-3">
            Aún no hay copias. La primera se hace sola hoy mismo.
          </p>
        ) : (
          <ul className="card overflow-hidden">
            {list.map((meta, i) => (
              <li key={meta.id} className={cx('flex items-center gap-3 px-4 py-3', i > 0 && 'inset-separator')}>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-medium first-letter:uppercase">{when(meta.at)}</p>
                  <p className="text-[0.75rem] text-ink-3 truncate">
                    {REASON[meta.reason]} · {describe(meta.counts)}
                  </p>
                </div>
                <IconButton label="Descargar esta copia" size="sm" onClick={() => void download(meta)}>
                  <Download className="size-4" />
                </IconButton>
                <Button size="sm" onClick={() => setRestoring(meta)}>
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <ConfirmDialog
        open={!!restoring}
        onCancel={() => setRestoring(null)}
        onConfirm={() => void restore()}
        title="Restaurar esta copia"
        message={
          restoring
            ? `Se sustituirá todo lo que tienes ahora por la copia del ${when(restoring.at)} (${describe(restoring.counts)}). Lo de ahora se guarda antes como otra copia, así que puedes volver atrás.`
            : ''
        }
        confirmLabel="Restaurar"
        destructive
      />
    </>
  )
}
