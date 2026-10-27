import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { dataKeys, useCustomer } from '@/data/hooks'
import { useCreateDraft, useSettings, useUpdateDraft } from '@/data/hooks-reservas'
import { useDataSource } from '@/data/source'
import { SourceError, type Channel, type Garment, type ReservationDetail, type ReservationInput } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { addDays, brl, todayISO } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Button, Modal, useToast } from '@/ui'
import { numOrNull } from '../acervo/formErrors'
import { CustomerForm } from '../clientes/CustomerForm'
import { AuthorizeExceptionDialog } from '../exceptions/AuthorizeExceptionDialog'
import { ReservationFields, type FormValues } from './ReservationFields'

export type ReservationFormProps = {
  open: boolean
  onClose(): void
  /** Editar rascunho: preenche tudo a partir dele. */
  draft?: ReservationDetail
  /** Nova reserva: ponto de partida (ficha da cliente/peça, conversão de prova). */
  initial?: { customerId?: string; garmentIds?: string[]; fittingId?: string; eventDate?: string; eventType?: string }
}

const days = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)

/**
 * Nova reserva / Editar rascunho (modal largo). Conflito de agenda é só aviso; desconto acima do limite pede PIN de
 * administrador; criar leva à ficha da reserva. Resolve as peças iniciais antes de montar o formulário.
 */
export function ReservationForm({ open, onClose, draft, initial }: ReservationFormProps) {
  const src = useDataSource()
  const ids = draft ? [] : (initial?.garmentIds ?? [])
  const loaded = useQueries({ queries: ids.map((id) => ({ queryKey: dataKeys.garment(id), queryFn: () => src.getGarment(id), enabled: open })) })
  if (!open) return null
  if (loaded.some((q) => q.isPending)) return null
  const start = draft ? draft.garments : loaded.flatMap((q) => (q.data ? [q.data] : []))
  return <Controller onClose={onClose} draft={draft} initial={initial} start={start} />
}

function Controller({ onClose, draft, initial, start }: Omit<ReservationFormProps, 'open'> & { start: Garment[] }) {
  const create = useCreateDraft()
  const update = useUpdateDraft(draft?.id ?? '')
  const settings = useSettings()
  const { can } = usePermissions()
  const toast = useToast()
  const navigate = useNavigate()
  const href = useAppHref()
  const tempId = useId()
  const errorsRef = useRef<HTMLDivElement>(null)

  const [v, setV] = useState<FormValues>(() => {
    if (draft) {
      const ev = draft.eventDate ?? ''
      return {
        customerId: draft.customerId,
        eventDate: ev,
        pickupOffset: ev ? days(ev, draft.pickupDate) : 2,
        returnOffset: ev ? days(draft.returnDueDate, ev) : 1,
        eventType: draft.eventType ?? '',
        venue: draft.eventVenue ?? '',
        channel: draft.channel,
        discount: draft.discount ? String(draft.discount) : '',
        notes: draft.notes ?? '',
      }
    }
    return {
      customerId: initial?.customerId ?? null,
      eventDate: initial?.eventDate ?? addDays(todayISO(), 10),
      pickupOffset: 2,
      returnOffset: 1,
      eventType: initial?.eventType ?? 'Casamento',
      venue: '',
      channel: 'loja' as Channel,
      discount: '',
      notes: '',
    }
  })
  const [picked, setPicked] = useState<Garment[]>(start)
  const [errors, setErrors] = useState<string[]>([])
  const [authOpen, setAuthOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState(false)
  const customer = useCustomer(v.customerId ?? undefined).data ?? null
  const put = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }))

  const pickup = v.eventDate ? addDays(v.eventDate, -v.pickupOffset) : ''
  const returnDue = v.eventDate ? addDays(v.eventDate, v.returnOffset) : ''
  const pending = create.isPending || update.isPending
  const discount = numOrNull(v.discount) ?? 0
  const gross = picked.reduce((s, g) => s + g.rentalPrice, 0)

  useEffect(() => {
    if (errors.length) errorsRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [errors])

  function toggle(g: Garment) {
    setPicked((p) => (p.some((x) => x.id === g.id) ? p.filter((x) => x.id !== g.id) : [...p, g]))
  }
  function swap(fromId: string, to: Garment) {
    setPicked((p) => (p.some((x) => x.id === to.id) ? p.filter((x) => x.id !== fromId) : p.map((x) => (x.id === fromId ? to : x))))
  }

  function fail(err: unknown) {
    if (err instanceof SourceError && err.issues?.some((i) => i.code === 'DESCONTO_ACIMA_LIMITE')) {
      setErrors([])
      setAuthOpen(true)
      return
    }
    const issues = err instanceof SourceError ? (err.issues?.length ? err.issues : [{ code: err.code }]) : []
    const list = issues.length
      ? issues.map((i) => (i.code === 'DESCONTO_MAIOR_QUE_BRUTO' && err instanceof SourceError && err.hint ? err.hint : errorMessage(i.code)))
      : [errorMessage(err)]
    const unique = [...new Set(list)]
    setErrors(unique)
    toast({ title: 'Revise a reserva', description: unique[0], tone: 'error' })
  }

  function submit(e?: FormEvent, exceptionId?: string) {
    e?.preventDefault()
    if (pending) return
    const frozen = new Map((draft?.items ?? []).map((i) => [i.garmentId, i.unitPrice]))
    const input: ReservationInput = {
      customerId: v.customerId ?? '',
      eventDate: v.eventDate,
      eventType: v.eventType.trim() || undefined,
      eventVenue: v.venue.trim() || undefined,
      pickupDate: pickup,
      returnDueDate: returnDue,
      channel: v.channel,
      discount,
      notes: v.notes.trim() || undefined,
      ...(initial?.fittingId && !draft ? { fittingId: initial.fittingId } : {}),
      items: picked.map((g) => ({ garmentId: g.id, unitPrice: frozen.get(g.id) ?? g.rentalPrice })),
    }
    setErrors([])
    if (draft) {
      update.mutate(
        { input, exceptionId },
        {
          onSuccess: () => {
            toast({ title: 'Rascunho atualizado', description: draft.code })
            onClose()
          },
          onError: fail,
        },
      )
    } else {
      create.mutate(
        { input, exceptionId },
        {
          onSuccess: (r) => {
            toast({ title: 'Reserva criada', description: `${r.code} · rascunho` })
            navigate(href(`/reservas/${r.id}`), { replace: true })
          },
          onError: fail,
        },
      )
    }
  }

  const limit = settings.data?.discountLimitPercent ?? 15
  const pct = gross > 0 ? Math.round((discount / gross) * 1000) / 10 : 0

  return (
    <>
      <Modal
        open={!authOpen}
        onClose={onClose}
        size="lg"
        title={draft ? 'Editar rascunho' : 'Nova reserva'}
        description="A disponibilidade é verificada contra o calendário de cada peça, incluindo o buffer de higienização"
        footer={
          <>
            <span className="rs-foot-note tiny muted">O rascunho não bloqueia a peça. O calendário só é reservado ao confirmar.</span>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" form="rs-form" disabled={pending}>
              {draft ? 'Salvar alterações' : 'Criar rascunho'}
            </Button>
          </>
        }
      >
        <form id="rs-form" className="rs-form" onSubmit={submit} noValidate>
          {errors.length > 0 && (
            <div ref={errorsRef} className="note red rs-errors" role="alert" tabIndex={-1}>
              <div>
                <b>Corrija antes de continuar:</b>
                {errors.map((m) => (
                  <p key={m}>• {m}</p>
                ))}
              </div>
            </div>
          )}
          <ReservationFields
            v={v}
            put={put}
            picked={picked}
            canDiscount={can('reserva.discount')}
            canCreateCustomer={can('cliente.create')}
            onNewCustomer={() => setNewCustomer(true)}
            customer={customer}
            pickup={pickup}
            returnDue={returnDue}
            onToggle={toggle}
            onSwap={swap}
            ignoreReservationId={draft?.id}
            discount={discount}
            gross={gross}
          />
        </form>
      </Modal>

      {authOpen && (
        <AuthorizeExceptionDialog
          kind="desconto_acima_limite"
          refType="reserva_rascunho"
          refId={draft?.id ?? `tmp-${tempId}`}
          maxAmount={discount}
          detail={`O desconto de ${brl(discount)} representa ${pct.toLocaleString('pt-BR')}% do valor das peças, acima do limite de ${limit}% da casa.`}
          onAuthorized={(id) => {
            setAuthOpen(false)
            submit(undefined, id)
          }}
          onCancel={() => setAuthOpen(false)}
        />
      )}
      <CustomerForm
        open={newCustomer}
        onClose={() => setNewCustomer(false)}
        onCreated={(c) => {
          put('customerId', c.id)
          setNewCustomer(false)
        }}
      />
    </>
  )
}
