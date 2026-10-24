import { useState, type FormEvent } from 'react'
import { useCancelAppointment, useCreateAppointment, useUpdateAppointment } from '@/data/hooks-agenda'
import { AG_KIND } from '@/data/labels-ops'
import type { AgendaItem, AppointmentInput } from '@/data/types'
import { dateBR } from '@/lib/format'
import { Button, Field, Icon, Modal } from '@/ui'
import { NO_ERRORS, sourceErrors, type FormErrors } from '../acervo/formErrors'
import { CustomerPicker } from './CustomerPicker'

const FORM_ID = 'ap-form'
const FIELDS = ['date', 'time', 'customerId', 'notes'] as const
type ManualKind = AppointmentInput['kind']
const KINDS: ManualKind[] = ['atendimento', 'servico', 'interno']

export type AppointmentModalProps = {
  open: boolean
  onClose(): void
  /** Dia da coluna (aaaa-mm-dd): data inicial do compromisso novo. */
  date: string
  /** Compromisso manual a editar (com "Cancelar compromisso"); sem ele, cria um novo. */
  item?: AgendaItem
}

/**
 * Novo compromisso / editar compromisso manual (Atendimento, Serviço ou Interno). O flag "Interno" é o atalho
 * do tipo Interno: com ele a cliente é opcional e a observação vira o título do cartão.
 */
export function AppointmentModal({ open, onClose, date, item }: AppointmentModalProps) {
  const editing = !!item
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar compromisso' : 'Novo compromisso'}
      description={editing ? `${AG_KIND[item.kind].label} · ${dateBR(date)} às ${item.time}` : 'Atendimento, serviço ou compromisso interno da Senzi.'}
    >
      {open && <AppointmentForm key={item?.id ?? 'novo'} date={date} item={item} onDone={onClose} />}
    </Modal>
  )
}

function AppointmentForm({ date, item, onDone }: { date: string; item?: AgendaItem; onDone(): void }) {
  const create = useCreateAppointment()
  const update = useUpdateAppointment()
  const cancel = useCancelAppointment()
  const [v, setV] = useState({
    date,
    time: item?.time ?? '09:00',
    kind: (item && KINDS.includes(item.kind as ManualKind) ? item.kind : 'atendimento') as ManualKind,
    customerId: item?.customer?.id ?? null,
    notes: item?.notes ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const [confirming, setConfirming] = useState(false)
  const busy = create.isPending || update.isPending || cancel.isPending
  const put = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }))

  const noteRequired = v.kind !== 'atendimento' && !v.customerId

  function fail(next: FormErrors) {
    setErrors(next)
    const first = FIELDS.find((k) => next.fields[k])
    if (first) requestAnimationFrame(() => document.getElementById(`ap-${first}`)?.focus())
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const input: AppointmentInput = { date: v.date, time: v.time, kind: v.kind, customerId: v.customerId, notes: v.notes.trim() || null }
    const opts = { onSuccess: onDone, onError: (x: unknown) => fail(sourceErrors(x, FIELDS)) }
    if (item) update.mutate({ id: item.id, input }, opts)
    else create.mutate(input, opts)
  }

  function doCancel() {
    if (!item || busy) return
    cancel.mutate(item.id, { onSuccess: onDone, onError: (x) => fail(sourceErrors(x, FIELDS)) })
  }

  return (
    <form id={FORM_ID} className="ap-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}
      <div className="ap-grid">
        <Field id="ap-date" label="Data *" type="date" value={v.date} onChange={(e) => put('date', e.target.value)} error={errors.fields.date} />
        <Field id="ap-time" label="Horário *" type="time" value={v.time} onChange={(e) => put('time', e.target.value)} error={errors.fields.time} />
        <Field as="select" label="Tipo" value={v.kind} onChange={(e) => put('kind', e.target.value as ManualKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {AG_KIND[k].label}
            </option>
          ))}
        </Field>
        <div className="ap-flag">
          <label>
            <input
              type="checkbox"
              checked={v.kind === 'interno'}
              aria-describedby="ap-flag-hint"
              onChange={(e) => put('kind', e.target.checked ? 'interno' : 'atendimento')}
            />
            Interno
          </label>
          <span id="ap-flag-hint" className="hint">
            Compromisso da empresa: a cliente é opcional.
          </span>
        </div>
      </div>
      <CustomerPicker
        id="ap-customerId"
        label={v.kind === 'atendimento' ? 'Cliente *' : 'Cliente'}
        value={v.customerId}
        onChange={(id) => put('customerId', id)}
        error={errors.fields.customerId}
      />
      <Field
        id="ap-notes"
        as="textarea"
        label={noteRequired ? 'Observação *' : 'Observação'}
        hint={noteRequired ? 'Sem cliente, a observação vira o título do cartão.' : undefined}
        placeholder="Ex.: Reunião de equipe, coleta da lavanderia…"
        value={v.notes}
        onChange={(e) => put('notes', e.target.value)}
        error={errors.fields.notes}
      />

      {confirming && (
        <div className="note amber" role="alert">
          <Icon name="alerta" size={15} />
          <span>Cancelar este compromisso? Ele sai da agenda.</span>
        </div>
      )}
      <div className="ap-actions">
        {item && !confirming && (
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
            Cancelar compromisso
          </Button>
        )}
        {item && confirming && (
          <>
            <Button variant="danger" onClick={doCancel} disabled={busy}>
              Sim, cancelar
            </Button>
            <Button onClick={() => setConfirming(false)} disabled={busy}>
              Voltar
            </Button>
          </>
        )}
        <span className="ap-spacer" />
        <Button onClick={onDone}>Cancelar</Button>
        <Button variant="primary" type="submit" disabled={busy}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
