import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useMarkReady, useRemoveDraftItem, useReservation, useSettings } from '@/data/hooks-reservas'
import { longDay } from './reservaFormat'
import type { AvailabilityResult, PaymentKind, ReservationDetail } from '@/data/types'
import { SourceError } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { todayISO } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, EmptyState, Icon, Tabs, buttonClass, useToast, type TabItem } from '@/ui'
import { RESERVATION_STATE } from '@/data/labels-ops'
import { ContractTab } from './ContractTab'
import { HistoryTab } from './HistoryTab'
import { AddItemModal } from './modals/AddItemModal'
import { CancelModal } from './modals/CancelModal'
import { ConfirmModal } from './modals/ConfirmModal'
import { ConflictModal } from './modals/ConflictModal'
import { DepositModal } from './modals/DepositModal'
import { PaymentModal } from './modals/PaymentModal'
import { PickupModal } from './modals/PickupModal'
import { ReturnModal } from './modals/ReturnModal'
import { SignContractModal } from './modals/SignContractModal'
import { WhatsAppModal } from './modals/WhatsAppModal'
import { PaymentsTab } from './PaymentsTab'
import type { WaKey } from './whatsapp'
import { ReservationForm } from './ReservationForm'
import { ReservationItems } from './ReservationItems'
import { ReservationNotices } from './ReservationNotices'
import { ReservationSide } from './ReservationSide'
import '../acervo/acervo.css'
import '../acervo/garment.css'
import './reservas.css'
import './reserva-detail.css'

type Dialog = 'edit' | 'confirm' | 'payment' | 'pickup' | 'return' | 'sign' | 'cancel' | 'noshow' | 'whatsapp' | 'add' | 'conflict' | 'refund' | 'deposit' | null
type TabKey = 'pagamentos' | 'contrato' | 'historico'

/** Ficha da reserva: cabeçalho com ações por estado e permissão (spec §2.2), faixas, lateral, peças e abas. */
export function ReservationPage() {
  const { id } = useParams()
  const q = useReservation(id)
  const href = useAppHref()
  if (q.isPending) {
    return (
      <div className="ac-page gp-page" aria-busy="true">
        <div className="gp-skel">
          <i />
          <i />
        </div>
      </div>
    )
  }
  if (!q.data) {
    return (
      <div className="ac-page gp-page">
        <header className="ac-head gp-head">
          <div className="ac-title">
            <Link to={href('/reservas')} className="gp-back">
              <Icon name="chevronL" size={13} /> Reservas
            </Link>
            <h1 className="display">Reserva não encontrada</h1>
          </div>
        </header>
        <div className="ac-body">
          <section className="card">
            <EmptyState icon="reservas" title="Reserva não encontrada" description="O link pode estar incompleto ou a reserva foi removida." action={<Link to={href('/reservas')} className="btn">Voltar às reservas</Link>} />
          </section>
        </div>
      </div>
    )
  }
  return <Ficha r={q.data} />
}

function Ficha({ r }: { r: ReservationDetail }) {
  const { can } = usePermissions()
  const href = useAppHref()
  const toast = useToast()
  const today = todayISO()
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [waKey, setWaKey] = useState<WaKey | undefined>()
  const [payInit, setPayInit] = useState<{ kind: PaymentKind; amount: number } | undefined>()
  const [conflicts, setConflicts] = useState<AvailabilityResult[]>([])
  const ready = useMarkReady(r.id)
  const removeItem = useRemoveDraftItem(r.id)
  const close = () => setDialog(null)
  const launch = (initial?: { kind: PaymentKind; amount: number }) => {
    setPayInit(initial)
    setDialog('payment')
  }

  const st = RESERVATION_STATE[r.state]
  const s = r.state
  const pending = r.items.some((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue')
  const outNow = r.items.some((i) => i.itemState === 'retirado')
  const pickedAny = r.items.some((i) => i.itemState === 'retirado' || i.itemState === 'devolvido' || i.itemState === 'inspecionado')
  const money = can('financeiro.view')
  const due = r.balance.due
  const phone = r.customer.phone.replace(/\D/g, '')
  const show = {
    edit: s === 'rascunho' && can('reserva.create'),
    confirm: s === 'rascunho' && can('reserva.confirm'),
    pay: (s === 'confirmada' || s === 'pronta_retirada') && due > 0.005 && can('financeiro.payment'),
    pickup: (s === 'confirmada' || s === 'pronta_retirada' || s === 'retirada') && pending && can('reserva.pickup'),
    ret: outNow && can('reserva.return'),
    inspect: (s === 'devolvida' || s === 'em_inspecao') && can('operacao.inspect'),
    ready: s === 'confirmada' && can('reserva.pickup'),
    noshow: (s === 'confirmada' || s === 'pronta_retirada') && r.pickupDate < today && can('reserva.cancel'),
    cancel: (s === 'rascunho' || s === 'confirmada' || s === 'pronta_retirada') && can('reserva.cancel'),
    wa: s !== 'rascunho' && can('reserva.view') && can('cliente.view'),
    os: s !== 'rascunho' && can('reserva.view'),
  }

  function markReady() {
    ready.mutate(undefined, {
      onSuccess: () => toast({ title: 'Reserva pronta para retirada', description: r.code }),
      onError: (err) => toast({ title: 'Não foi possível atualizar', description: errorMessage(err), tone: 'error' }),
    })
  }
  function removeDraft(itemId: string) {
    removeItem.mutate(itemId, {
      onSuccess: () => toast({ title: 'Peça removida', description: `${r.code} · contrato regerado.` }),
      onError: (err) => {
        const needsPin = err instanceof SourceError && (err.code === 'DESCONTO_ACIMA_LIMITE' || err.issues?.some((i) => i.code === 'DESCONTO_ACIMA_LIMITE'))
        toast({
          title: 'Não foi possível remover a peça',
          description: needsPin ? 'Sem essa peça o desconto passaria do limite da casa. Use "Editar rascunho" para ajustar o desconto e autorizar com PIN.' : errorMessage(err),
          tone: 'error',
        })
      },
    })
  }
  const tabs: TabItem[] = [
    ...(money
      ? [{ key: 'pagamentos', label: <TabLabel n={r.payments.length}>Pagamentos</TabLabel>, content: () => <PaymentsTab r={r} onLaunch={launch} onReturnDeposit={() => setDialog('deposit')} /> }]
      : []),
    { key: 'contrato', label: 'Contrato', content: () => <ContractTab r={r} onSign={() => setDialog('sign')} onWhatsApp={() => { setWaKey('contrato'); setDialog('whatsapp') }} /> },
    { key: 'historico', label: 'Histórico', content: () => <HistoryTab r={r} /> },
  ]
  const aba = params.get('aba')
  const selected = tabs.some((t) => t.key === aba) ? (aba as TabKey) : tabs[0]!.key
  function selectTab(key: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('aba', key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="ac-page gp-page rd-page">
      <header className="ac-head gp-head">
        <div className="ac-title">
          <Link to={href('/reservas')} className="gp-back">
            <Icon name="chevronL" size={13} /> Reservas
          </Link>
          <h1 className="display">{r.code}</h1>
          <p className="ac-sub">
            {r.customer.fullName} · {r.eventType || 'Evento'} {r.eventDate ? `em ${longDay(r.eventDate)}` : ''} <Badge tone={st.tone}>{st.label}</Badge>
          </p>
        </div>
        <div className="ac-actions rd-actions">
          {show.edit && <Button icon="editar" onClick={() => setDialog('edit')}>Editar rascunho</Button>}
          {show.confirm && <Button variant="primary" icon="check" onClick={() => setDialog('confirm')}>Confirmar reserva</Button>}
          {show.pay && <Button icon="moeda" onClick={() => launch()}>Registrar pagamento</Button>}
          {show.pickup && (
            <Button variant={due <= 0.005 ? 'primary' : 'secondary'} icon="presente" onClick={() => setDialog('pickup')}>
              {pickedAny ? 'Retirar o restante' : 'Registrar retirada'}
            </Button>
          )}
          {show.ret && <Button variant="primary" icon="refresh" onClick={() => setDialog('return')}>Registrar devolução</Button>}
          {show.inspect && (
            <Link to={href('/operacao')} className={buttonClass('primary')}>
              <Icon name="operacao" size={14} /> Inspecionar peças
            </Link>
          )}
          {show.ready && <Button icon="check" disabled={ready.isPending} onClick={markReady}>Marcar como pronta para retirada</Button>}
          {show.noshow && <Button icon="x" onClick={() => setDialog('noshow')}>Marcar no-show</Button>}
          {show.cancel && <Button icon="x" onClick={() => setDialog('cancel')}>Cancelar</Button>}
          {show.wa && (
            <Button icon="seta" disabled={!phone} title={phone ? undefined : 'Cliente sem telefone'} onClick={() => { setWaKey(undefined); setDialog('whatsapp') }}>
              Enviar no WhatsApp
            </Button>
          )}
          {show.os && (
            <Link to={href(`/reservas/${r.id}/os`)} className="btn">
              <Icon name="doc" size={14} /> Gerar PDF da OS
            </Link>
          )}
        </div>
      </header>

      <div className="ac-body">
        <ReservationNotices r={r} today={today} settings={settings.data} />
        <div className="gp-profile">
          <ReservationSide r={r} today={today} />
          <div className="gp-main rd-main">
            <ReservationItems r={r} canEditDraft={can('reserva.create')} onAdd={() => setDialog('add')} onRemove={removeDraft} removing={removeItem.isPending} />
            <Tabs label="Ficha da reserva" tabs={tabs} selected={selected} onSelect={selectTab} className="gp-tabs" />
          </div>
        </div>
      </div>

      {dialog === 'edit' && <ReservationForm open onClose={close} draft={r} />}
      {dialog === 'confirm' && (
        <ConfirmModal
          r={r}
          onClose={close}
          onRefused={(c) => {
            setConflicts(c)
            setDialog('conflict')
          }}
        />
      )}
      {dialog === 'conflict' && <ConflictModal r={r} conflicts={conflicts} onClose={close} />}
      {dialog === 'payment' && <PaymentModal r={r} initial={payInit} onClose={close} />}
      {dialog === 'deposit' && <DepositModal r={r} onClose={close} />}
      {dialog === 'refund' && <PaymentModal r={r} initial={{ kind: 'estorno', amount: r.balance.pago, fromDeposit: false }} onClose={close} />}
      {dialog === 'pickup' && <PickupModal r={r} onClose={close} onReceive={() => launch()} />}
      {dialog === 'return' && <ReturnModal r={r} onClose={close} />}
      {dialog === 'sign' && <SignContractModal r={r} onClose={close} />}
      {(dialog === 'cancel' || dialog === 'noshow') && <CancelModal r={r} mode={dialog === 'cancel' ? 'cancel' : 'noshow'} onClose={close} onRefund={() => setDialog('refund')} canRefund={can('financeiro.payment')} />}
      {dialog === 'whatsapp' && <WhatsAppModal r={r} initialKey={waKey} onClose={close} />}
      {dialog === 'add' && <AddItemModal r={r} onClose={close} />}
    </div>
  )
}

function TabLabel({ n, children }: { n: number; children: string }) {
  return (
    <>
      {children}{' '}
      <span className="rd-tab-n" aria-hidden="true">
        {n}
      </span>
      <span className="sr-only">({n})</span>
    </>
  )
}
