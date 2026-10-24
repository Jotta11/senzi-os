import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCancelReceivable, useFinCategories, useReceivables } from '@/data/hooks-financeiro'
import { RECEIVABLE_STATUS } from '@/data/labels-ops'
import type { Receivable } from '@/data/types'
import type { ReceivableFilter } from '@/data/source-financeiro'
import { falta, receivableStatus } from '@/domain/finance'
import { errorMessage } from '@/lib/errorMessages'
import { brl, dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, Card, Chips, DataTable, EmptyState, Field, SearchInput, useToast, type Column } from '@/ui'
import '../acervo/acervo.css'
import { FinanceNav } from './FinanceNav'
import { ConfirmModal } from './modals/ConfirmModal'
import { ReceivableModal } from './modals/ReceivableModal'
import { ReceiveModal } from './modals/ReceiveModal'
import { ParcelPaymentModal } from './ParcelPaymentModal'
import { brl0, usePeriod, type ListRange } from './period'
import { PeriodSeg } from './PeriodSeg'
import { Tiles } from './Tiles'
import './financeiro.css'

const STATUS = [
  { value: 'abertas', label: 'Em aberto' },
  { value: 'vencidas', label: 'Vencidas' },
  { value: 'recebidas', label: 'Recebidas' },
  { value: 'todas', label: 'Todas' },
] as const

type ModalState = { kind: 'new' } | { kind: 'edit' | 'receive' | 'cancel' | 'parcel'; row: Receivable }

/**
 * Financeiro · Contas a Receber (spec §2.2.2, `financeiro.geral`). Parcelas de reserva são geradas pela reserva
 * ("Registrar pagamento" abre o modal da reserva); lançamentos avulsos podem ser recebidos, editados e cancelados.
 */
export function ReceivablesPage() {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = usePeriod<ListRange>(true)
  const status = (STATUS.find((s) => s.value === params.get('status'))?.value ?? 'abertas') as ReceivableFilter['status']
  const origin = (['reservas', 'avulsas'].includes(params.get('origem') ?? '') ? params.get('origem') : 'todas') as ReceivableFilter['origin']
  const categoryId = params.get('categoria') || null
  const q = params.get('q') ?? ''
  const setParam = (k: string, v: string | null) =>
    setParams((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })

  const list = useReceivables({ status, origin, categoryId, q, range })
  const cats = useFinCategories()
  const cancel = useCancelReceivable()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const d = list.data
  const today = d?.today ?? ''
  const catName = (id: string | null) => (cats.data ?? []).find((c) => c.id === id)?.name ?? '—'
  const rows = d?.rows ?? []
  const sumRows = rows.filter((r) => !r.isCustody)

  const columns: Column<Receivable>[] = [
    {
      key: 'venc',
      header: 'Vencimento',
      className: 'mono',
      render: (r) => <span className={receivableStatus(r, today) === 'vencido' ? 'fx-late' : undefined}>{dateBR(r.dueDate)}</span>,
    },
    {
      key: 'desc',
      header: 'Descrição',
      render: (r) => (
        <>
          {r.reservationId ? <Link to={href(`/reservas/${r.reservationId}`)}>{r.description}</Link> : r.description}
          {r.isCustody && (
            <span className="fx-sub-t">
              <Badge tone="stone" dot={false}>Caução — custódia</Badge>
            </span>
          )}
        </>
      ),
    },
    { key: 'cli', header: 'Cliente', render: (r) => r.customerName ?? r.payerName ?? '—' },
    { key: 'ori', header: 'Origem', render: (r) => (r.source === 'reserva' ? <Badge tone="wine" dot={false}>Reserva</Badge> : <Badge tone="stone" dot={false}>Avulso</Badge>) },
    { key: 'cat', header: 'Categoria', render: (r) => (r.isCustody ? '—' : catName(r.categoryId)) },
    { key: 'val', header: 'Valor', align: 'right', className: 'fx-money', render: (r) => brl(r.amount) },
    { key: 'pago', header: 'Pago', align: 'right', className: 'fx-money', render: (r) => brl(r.paidAmount) },
    { key: 'falta', header: 'Falta', align: 'right', className: 'fx-money', render: (r) => <b>{brl(falta(r))}</b> },
    {
      key: 'st',
      header: 'Status',
      render: (r) => {
        const s = RECEIVABLE_STATUS[receivableStatus(r, today)]
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
    },
    {
      key: 'acoes',
      header: <span className="sr-only">Ações</span>,
      align: 'right',
      render: (r) => {
        const open = r.status === 'aberto' || r.status === 'parcial'
        const nm = (a: string) => `${a} · ${r.description}`
        return (
          <div className="fx-row-act" onClick={(e) => e.stopPropagation()}>
            {r.source === 'reserva' && open && can('financeiro.payment') && (
              <Button size="sm" aria-label={nm('Registrar pagamento')} onClick={() => setModal({ kind: 'parcel', row: r })}>Registrar pagamento</Button>
            )}
            {r.source === 'avulso' && open && (
              <>
                <Button size="sm" variant="primary" aria-label={nm('Receber')} onClick={() => setModal({ kind: 'receive', row: r })}>Receber</Button>
                {r.status === 'aberto' && <Button size="sm" aria-label={nm('Editar')} onClick={() => setModal({ kind: 'edit', row: r })}>Editar</Button>}
                <Button size="sm" aria-label={nm('Cancelar')} onClick={() => { setCancelError(null); setModal({ kind: 'cancel', row: r }) }}>Cancelar</Button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  async function confirmCancel(row: Receivable) {
    try {
      await cancel.mutateAsync(row.id)
      toast({ title: 'Lançamento cancelado', tone: 'ok' })
      setModal(null)
    } catch (err) {
      setCancelError(errorMessage(err))
    }
  }

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Contas a Receber</h1>
          <p className="ac-sub">{d ? `${brl0(d.totals.open)} em aberto · ${brl0(d.totals.overdue)} vencido` : 'Carregando…'}</p>
        </div>
        <div className="ac-actions">
          <PeriodSeg value={range} onChange={setRange} allowAll />
          <Button variant="primary" icon="plus" onClick={() => setModal({ kind: 'new' })}>Novo lançamento</Button>
        </div>
      </header>
      <FinanceNav />
      <div className="ac-body">
        {d && (
          <Tiles
            label="Resumo das contas a receber"
            tiles={[
              { label: 'A receber', value: brl0(d.totals.open), desc: `${rows.filter((r) => !r.isCustody && (r.status === 'aberto' || r.status === 'parcial')).length} parcela(s)` },
              { label: 'Vencido', value: brl0(d.totals.overdue), desc: `${rows.filter((r) => receivableStatus(r, today) === 'vencido').length} vencida(s)`, tone: d.totals.overdue > 0 ? 'alert' : undefined },
              { label: 'Vence em 7 dias', value: brl0(d.totals.dueIn7), desc: 'próximos 7 dias' },
              { label: 'Recebido no período', value: brl0(d.totals.receivedInRange), desc: 'regime de caixa' },
            ]}
          />
        )}
        <Card className="fx-card-flush">
          <div className="fx-filters">
            <Chips label="Situação" options={STATUS.map((s) => ({ value: s.value, label: s.label }))} value={status} onChange={(v) => setParam('status', v === 'abertas' ? null : v)} />
            <div className="fx-filter-row">
              <Field as="select" label="Origem" value={origin} onChange={(e) => setParam('origem', e.target.value === 'todas' ? null : e.target.value)}>
                <option value="todas">Todas</option>
                <option value="reservas">Reservas</option>
                <option value="avulsas">Avulsas</option>
              </Field>
              <Field as="select" label="Categoria" value={categoryId ?? ''} onChange={(e) => setParam('categoria', e.target.value || null)}>
                <option value="">Todas</option>
                {(cats.data ?? []).filter((c) => c.type === 'receita').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Field>
              <SearchInput label="Buscar por cliente, descrição ou código da reserva" value={q} onChange={(v) => setParam('q', v || null)} placeholder="Buscar por cliente, descrição ou código da reserva" />
            </div>
          </div>
          <DataTable
            caption="Contas a receber"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => r.reservationId && navigate(href(`/reservas/${r.reservationId}`))}
            empty={<EmptyState icon="moeda" title="Nada a receber" description="Nenhuma conta em aberto neste filtro." />}
          />
          {rows.length > 0 && (
            <p className="fx-foot">
              <span>Total conforme filtros</span>
              <span>Valor <b>{brl(sumRows.reduce((s, r) => s + r.amount, 0))}</b></span>
              <span>Pago <b>{brl(sumRows.reduce((s, r) => s + r.paidAmount, 0))}</b></span>
              <span>Falta <b>{brl(sumRows.reduce((s, r) => s + falta(r), 0))}</b></span>
            </p>
          )}
        </Card>
      </div>
      {modal?.kind === 'new' && <ReceivableModal today={today} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <ReceivableModal today={today} receivable={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'receive' && <ReceiveModal today={today} receivable={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'parcel' && <ParcelPaymentModal parcel={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'cancel' && (
        <ConfirmModal
          title="Cancelar lançamento"
          message={`Cancelar "${modal.row.description}"? Ele deixa de contar como a receber.`}
          confirmLabel="Cancelar lançamento"
          pending={cancel.isPending}
          error={cancelError}
          onConfirm={() => void confirmCancel(modal.row)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
