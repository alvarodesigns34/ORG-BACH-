import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { today as todayISO } from '@/domain/dates'
import { EVENT_KINDS, type CalendarEvent, type EventKind } from '@/domain/types'
import { useDispatch } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Field, Input, Select, Textarea } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button } from '@/ui/primitives'

interface EventEditorProps {
  open: boolean
  onClose: () => void
  event?: CalendarEvent | null
  defaults?: { date?: string; subjectId?: string }
}

export function EventEditor({ open, onClose, event, defaults }: EventEditorProps) {
  const dispatch = useDispatch()
  const subjects = useSubjects()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayISO())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [kind, setKind] = useState<EventKind>('personal')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [timeError, setTimeError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(event?.title ?? '')
    setDate(event?.date ?? defaults?.date ?? todayISO())
    setStartTime(event?.startTime ?? '')
    setEndTime(event?.endTime ?? '')
    setSubjectId(event?.subjectId ?? defaults?.subjectId ?? '')
    setKind(event?.kind ?? 'personal')
    setNotes(event?.notes ?? '')
    setError(null)
    setTimeError(null)
  }, [open, event, defaults])

  const submit = () => {
    if (!title.trim()) {
      setError('El evento necesita un título.')
      return
    }
    // Un evento que termina antes de empezar dibujaría una duración negativa
    // en el calendario y no hay forma de interpretarlo.
    if (startTime && endTime && endTime < startTime) {
      setTimeError('La hora de fin no puede ser anterior a la de inicio.')
      return
    }
    const payload = {
      title: title.trim(),
      date,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      subjectId: subjectId || undefined,
      kind,
      notes: notes.trim() || undefined,
    }
    if (event) dispatch({ type: 'event/update', id: event.id, patch: payload })
    else dispatch({ type: 'event/add', event: payload })
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={event ? 'Editar evento' : 'Nuevo evento'}
        footer={
          <>
            {event && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit}>
              {event ? 'Guardar cambios' : 'Crear evento'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Título" required error={error}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={title}
                autoFocus
                placeholder="Ej.: Entrega del trabajo de Filosofía"
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (error) setError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tipo">
              {({ id }) => (
                <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
                  {EVENT_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Asignatura">
              {({ id }) => (
                <Select id={id} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Sin asignatura</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Fecha" required>
              {({ id }) => (
                <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              )}
            </Field>
            <Field label="Empieza">
              {({ id }) => (
                <Input
                  id={id}
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value)
                    if (timeError) setTimeError(null)
                  }}
                />
              )}
            </Field>
            <Field label="Termina" error={timeError}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="time"
                  aria-describedby={describedBy}
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value)
                    if (timeError) setTimeError(null)
                  }}
                />
              )}
            </Field>
          </div>

          <Field label="Notas">
            {({ id }) => (
              <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (event) dispatch({ type: 'event/remove', id: event.id })
          setConfirmDelete(false)
          onClose()
        }}
        title="Eliminar evento"
        message={`«${event?.title}» se borrará del calendario.`}
        confirmLabel="Eliminar"
        destructive
      />
    </>
  )
}
