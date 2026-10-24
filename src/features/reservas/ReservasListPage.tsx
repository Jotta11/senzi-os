import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useFitting } from '@/data/hooks-agenda'
import { useReservations, useReservationSummary } from '@/data/hooks-reservas'
import { FIT_OUTCOME, RESERVATION_STATE } from '@/data/labels-ops'
import type { PayStatus, ReservationFilter, ReservationRow } from '@/data/types'
import { brl, dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, Card, Chips, DataTable, EmptyState, type ChipOption, type Column, type Tone } from '@/ui'
import { ReservationForm } from './ReservationForm'
import '../acervo/acervo.css'
import './reservas.css'

const PAGE = 50
/** Ordem dos chips da spec §2.1. */
const FILTERS: ChipOption<ReservationFilter>[] = [
  { value: 'ativas', label: 'Ativas' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'rascunhos', label: 'Rascunhos' },
  { value: 'com_saldo', label: 'Com saldo' },
  { value: 'rua', label: 'Fora da loja' },
  { value: 'inspecao', label: 'Em inspeção' },
  { value: 'futuras', label: 'Futuras' },
  { value: 'encerradas', label: 'Encerradas' },
  { value: 'todas', label: 'Todas' },
]
const PAY: Record<PayStatus, { label: string; tone: Tone }> = {
  nao_pago: { label: 'Não pago', tone: 'red' },
  parcial: { label: 'Parcial', tone: 'amber' },
  pago: { label: 'Pago', tone: 'green' },
}
const FORM_PARAMS = ['nova', 'cliente', 'peca', 'prova']

/** Reservas — lista com filtros em chips (`?f=`) e formulário "Nova reserva" (`?nova=1&cliente=&peca=&prova=`). */
export function ReservasListPage() {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const money = can('financeiro.view')
  const options = FILTERS.filter((f) => money || f.value !== 'com_saldo')
  const fp = params.get('f')
  const filter: ReservationFilter = options.find((o) => o.value === fp)?.value ?? 'ativas'
  const [more, setMore] = useState({ key: filter, pages: 1 })
  const pages = more.key === filter ? more.pages : 1

  const summary = useReservationSummary()
  const list = useReservations(filter, { limit: PAGE * pages, offset: 0 })
  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0

  // Formulário aberto pela URL; vindo de prova, espera a prova carregar para preencher o início
  const wantsForm = params.get('nova') === '1' && can('reserva.create')
  const fittingId = params.get('prova') ?? undefined
  const fitting = useFitting(wantsForm ? fittingId : undefined)
  const formOpen = wantsForm && (!fittingId || !fitting.isPending)
  const fit = fitting.data
  const initial = (() => {
    const base = { customerId: params.get('cliente') ?? undefined, garmentIds: params.get('peca') ? [params.get('peca')!] : undefined }
    if (!fit) return base
    return {
      customerId: fit.session.customerId,
      garmentIds: fit.items.filter((i) => FIT_OUTCOME[i.outcome].positive === true).map((i) => i.garmentId),
      fittingId: fit.session.id,
      eventDate: fit.session.eventDate ?? undefined,
      eventType: fit.session.eventType ?? undefined,
    }
  })()

  function setFilter(f: ReservationFilter) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (f === 'ativas') next.delete('f')
        else next.set('f', f)
        return next
      },
      { replace: true },
    )
  }
  function openForm() {
    setParams((prev) => new URLSearchParams([...prev.entries(), ['nova', '1']]), { replace: true })
  }
  function closeForm() {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const k of FORM_PARAMS) next.delete(k)
        return next
      },
      { replace: true },
    )
  }

  const subtitle = summary.data ? `${summary.data.active} em curso${money ? ` · ${brl(summary.data.toReceive, { cents: false })} a receber` : ''}` : ' '

  const columns: Column<ReservationRow>[] = [
    {
      key: 'code',
      header: 'Reserva',
      className: 'mono rs-code',
      render: (r) => (
        <Link to={href(`/reservas/${r.id}`)} onClick={(e) => e.stopPropagation()}>
          {r.code}
        </Link>
      ),
    },
    { key: 'customer', header: 'Cliente', render: (r) => <b className="rs-cust">{r.customerName || '—'}</b> },
    {
      key: 'garments',
      header: 'Peças',
      render: (r) => (
        <span className="rs-garments">
          {r.garments.map((g) => (
            <span key={g.code}>
              <span className="mono tiny">{g.code}</span> {g.shortName}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'event',
      header: 'Evento',
      render: (r) => (
        <span className="rs-event">
          <span className="mono">{r.eventDate ? dateBR(r.eventDate).slice(0, 5) : '—'}</span>
          <span className="muted tiny">{r.eventType ?? ''}</span>
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Retirada → Devolução',
      render: (r) => (
        <span className="rs-event">
          <span className="mono">
            {dateBR(r.pickupDate).slice(0, 5)} → {dateBR(r.returnDueDate).slice(0, 5)}
          </span>
          {r.daysLate > 0 && <span className="rs-late">{r.daysLate}d de atraso</span>}
        </span>
      ),
    },
    { key: 'state', header: 'Estado', render: (r) => <Badge tone={RESERVATION_STATE[r.state].tone}>{RESERVATION_STATE[r.state].label}</Badge> },
    ...(money
      ? ([
          {
            key: 'pay',
            header: 'Pagamento',
            render: (r) => (r.payStatus ? <Badge tone={PAY[r.payStatus].tone}>{PAY[r.payStatus].label}</Badge> : <span className="muted">—</span>),
          },
          {
            key: 'value',
            header: 'Valor',
            align: 'right',
            render: (r) => (
              <span className="rs-event rs-value">
                <span className="mono">{brl(r.totalNet, { cents: false })}</span>
                {r.due > 0 && <span className="muted tiny">falta {brl(r.due)}</span>}
              </span>
            ),
          },
        ] satisfies Column<ReservationRow>[])
      : []),
  ]

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Reservas</h1>
          <p className="ac-sub">{subtitle}</p>
        </div>
        <div className="ac-actions">
          {can('reserva.create') && (
            <Button variant="primary" icon="plus" onClick={openForm}>
              Nova reserva
            </Button>
          )}
        </div>
      </header>

      <div className="ac-body">
        <section className="card rs-filters" aria-label="Filtros das reservas">
          <Chips label="Filtro" options={options} value={filter} onChange={setFilter} />
        </section>

        {list.data && rows.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma reserva neste filtro" description="Troque o filtro acima ou crie uma nova reserva." />
          </Card>
        ) : (
          <Card flush className="ac-table">
            <DataTable caption="Reservas" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => navigate(href(`/reservas/${r.id}`))} />
          </Card>
        )}

        {rows.length > 0 && rows.length < total && (
          <div className="rs-more">
            <span className="muted tiny">
              Mostrando {rows.length} de {total}
            </span>
            <Button onClick={() => setMore({ key: filter, pages: pages + 1 })} disabled={list.isFetching}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>

      <ReservationForm open={formOpen} onClose={closeForm} initial={initial} />
    </div>
  )
}
