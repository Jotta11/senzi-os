import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useCurrentUserName } from '@/auth/useCurrentUserName'
import { usePermissions } from '@/auth/usePermissions'
import { useCreateFitting, useUsers } from '@/data/hooks-agenda'
import type { FittingInput } from '@/data/types'
import { addDays, dateBR, maskCPF, maskPhone, onlyDigits, phoneDigits, todayISO } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Button, Field, Icon, Modal, useToast } from '@/ui'
import { NO_ERRORS, numOrNull, sourceErrors, type FormErrors } from '../acervo/formErrors'
import { CustomerPicker } from '../agenda/CustomerPicker'

const FORM_ID = 'pf-form'
/** Campos com mensagem própria (ids `pf-<campo>`), na ordem da tela. */
const FIELDS = ['customerId', 'fullName', 'phone', 'birthDate', 'cpf', 'date', 'time', 'eventDate', 'budget'] as const
const EVENTS = ['Casamento', 'Formatura', 'Aniversário', 'Festa corporativa', 'Baile de gala', 'Casamento civil', 'Premiação']

export type ScheduleFittingModalProps = {
  open: boolean
  onClose(): void
  /** Cliente já escolhida (vindo da ficha dela). */
  customerId?: string
}

/** Agendar prova: cliente existente (busca) ou cadastro na hora com os 4 dados obrigatórios; ao salvar abre a ficha da prova. */
export function ScheduleFittingModal({ open, onClose, customerId }: ScheduleFittingModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Agendar prova"
      description="A prova não bloqueia o calendário das peças — ela registra o que a cliente experimentou"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Agendar prova
          </Button>
        </>
      }
    >
      {open && <ScheduleForm customerId={customerId ?? null} onDone={onClose} />}
    </Modal>
  )
}

function ScheduleForm({ customerId, onDone }: { customerId: string | null; onDone(): void }) {
  const create = useCreateFitting()
  const toast = useToast()
  const me = useCurrentUserName()
  const users = useUsers()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const href = useAppHref()
  const [v, setV] = useState({
    customerId,
    date: addDays(todayISO(), 1),
    time: '15:00',
    /** `null` = não mexeu: vale o usuário atual. */
    attendant: null as string | null,
    eventType: '',
    eventDate: '',
    budget: '',
    notes: '',
  })
  const meUser = (users.data ?? []).find((u) => u.name === me)
  const attendant = v.attendant ?? meUser?.name ?? ''
  const [creating, setCreating] = useState(false)
  const [nc, setNc] = useState({ fullName: '', phone: '', birthDate: '', cpf: '' })
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const put = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }))
  const putNc = <K extends keyof typeof nc>(k: K, val: string) => setNc((p) => ({ ...p, [k]: val }))

  function fail(next: FormErrors) {
    setErrors(next)
    const first = FIELDS.find((k) => next.fields[k])
    if (first) requestAnimationFrame(() => document.getElementById(`pf-${first}`)?.focus())
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (create.isPending) return
    if (!creating && !v.customerId) return fail({ fields: { customerId: 'Selecione a cliente.' }, top: null })
    const budget = numOrNull(v.budget)
    const input: FittingInput = {
      date: v.date,
      time: v.time.trim() || undefined,
      attendantName: attendant || null,
      eventType: v.eventType.trim() || null,
      eventDate: v.eventDate || null,
      budget: budget ? budget : null,
      notes: v.notes.trim() || null,
      ...(creating
        ? { newCustomer: { fullName: nc.fullName.trim(), phone: onlyDigits(nc.phone), birthDate: nc.birthDate, cpf: onlyDigits(nc.cpf) } }
        : { customerId: v.customerId! }),
    }
    setErrors(NO_ERRORS)
    create.mutate(input, {
      onSuccess: (f) => {
        toast({ title: 'Prova agendada', description: `${f.code} · ${dateBR(f.scheduledAt.slice(0, 10)).slice(0, 5)}` })
        onDone()
        navigate(href(`/provas/${f.id}`))
      },
      onError: (x) => fail(sourceErrors(x, FIELDS)),
    })
  }

  const err = errors.fields
  return (
    <form id={FORM_ID} className="pv-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}

      {creating ? (
        <fieldset className="pv-new">
          <legend>Nova cliente</legend>
          <div className="pv-grid">
            <Field id="pf-fullName" label="Nome *" autoComplete="off" placeholder="Mariana Fontes Ribeiro" value={nc.fullName} onChange={(e) => putNc('fullName', e.target.value)} error={err.fullName} />
            <Field
              id="pf-phone"
              label="Telefone *"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="(63) 99612-4478"
              value={maskPhone(nc.phone)}
              onChange={(e) => putNc('phone', phoneDigits(e.target.value))}
              error={err.phone}
            />
            <Field id="pf-birthDate" label="Nascimento *" type="date" max={todayISO()} value={nc.birthDate} onChange={(e) => putNc('birthDate', e.target.value)} error={err.birthDate} />
            <Field
              id="pf-cpf"
              label="CPF *"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={maskCPF(nc.cpf)}
              onChange={(e) => putNc('cpf', onlyDigits(e.target.value).slice(0, 11))}
              error={err.cpf}
            />
          </div>
          <button type="button" className="pv-link-btn" onClick={() => setCreating(false)}>
            Escolher cliente já cadastrada
          </button>
        </fieldset>
      ) : (
        <CustomerPicker
          id="pf-customerId"
          label="Cliente *"
          value={v.customerId}
          onChange={(id) => put('customerId', id)}
          allowCreate={can('cliente.create')}
          onCreateRequest={() => {
            put('customerId', null)
            setCreating(true)
          }}
          error={err.customerId}
        />
      )}

      <div className="pv-grid">
        <Field id="pf-date" label="Data *" type="date" value={v.date} onChange={(e) => put('date', e.target.value)} error={err.date} />
        <Field id="pf-time" label="Horário" type="time" value={v.time} onChange={(e) => put('time', e.target.value)} error={err.time} />
        <Field as="select" label="Atendente" value={attendant} onChange={(e) => put('attendant', e.target.value)}>
          {!meUser && <option value="">{me ? `${me} (você)` : 'Eu (padrão)'}</option>}
          {(users.data ?? []).map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </Field>
        <Field
          label="Evento pretendido"
          list="pf-events"
          placeholder="Casamento"
          autoComplete="off"
          value={v.eventType}
          onChange={(e) => put('eventType', e.target.value)}
        />
        <Field id="pf-eventDate" label="Data do evento" type="date" value={v.eventDate} onChange={(e) => put('eventDate', e.target.value)} error={err.eventDate} />
        <Field id="pf-budget" label="Orçamento até (R$)" type="number" inputMode="decimal" min={0} step={10} placeholder="900" value={v.budget} onChange={(e) => put('budget', e.target.value)} error={err.budget} />
        <Field as="textarea" full label="Observações" placeholder="Quer ver longos em tons neutros. Só consegue vir depois das 19h." value={v.notes} onChange={(e) => put('notes', e.target.value)} />
      </div>
      <datalist id="pf-events">
        {EVENTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </form>
  )
}
