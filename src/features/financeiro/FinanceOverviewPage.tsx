import { Link, useNavigate } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useFinanceOverview, usePayables } from '@/data/hooks-financeiro'
import { PAYMENT_KIND, PAYMENT_METHOD as METHOD_LABEL } from '@/data/labels-ops'
import type { FinanceOverview } from '@/data/types'
import { monthAbbr } from '@/domain/dates'
import { addDays, brl, dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, buttonClass, Card, DataTable, EmptyState, type Column } from '@/ui'
import '../acervo/acervo.css'
import { BarList, LineChart } from './charts'
import { DueSoon } from './DueSoon'
import { FinanceNav } from './FinanceNav'
import { brl0, pct, rangeText, usePeriod } from './period'
import { PeriodSeg } from './PeriodSeg'
import { Tiles, type Tile } from './Tiles'
import './financeiro.css'


type Latest = FinanceOverview['latest'][number]

/**
 * Financeiro · Visão geral (spec `operacao-financeiro.md` §2.2.1). Tiles, faturamento por mês, a receber,
 * formas de pagamento e últimos lançamentos. Sem `financeiro.consolidated`: só Recebido, A receber e Caução;
 * sem `financeiro.geral`: sem atalhos nem "vencendo nos próximos 7 dias".
 */
export function FinanceOverviewPage() {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const [range, setRange] = usePeriod()
  const q = useFinanceOverview(range)
  const consolidated = can('financeiro.consolidated')
  const geral = can('financeiro.geral')
  const paidList = usePayables({ status: 'pagas', categoryId: null, recurrence: 'todas', q: '', range }, consolidated)
  const o = q.data
  const today = o?.to ?? ''

  const tiles: Tile[] = o
    ? [
        { label: 'Recebido', value: brl0(o.received), desc: `${o.receivedCount} lançamento(s)` },
        { label: 'A receber', value: brl0(o.toReceive), desc: `${o.receivableRows.length} reserva(s) em aberto`, tone: o.toReceive > 0 ? 'alert' : undefined },
        { label: 'Caução em custódia', value: brl0(o.custody), desc: 'retida até a devolução · não entra no resultado' },
        ...(consolidated
          ? [
              { label: 'Pago', value: brl0(o.paid ?? 0), desc: paidList.data ? `${paidList.data.rows.length} conta(s)` : 'contas pagas no período' },
              { label: 'Resultado', value: brl0(o.result ?? 0), desc: 'regime de caixa · sem caução', tone: (o.result ?? 0) < 0 ? ('neg' as const) : undefined },
              { label: 'Custo operacional', value: brl0(o.operatingCost ?? 0), desc: 'higienização, ajustes e reparos' },
              { label: 'Margem operacional', value: o.operatingMargin == null ? '—' : pct(o.operatingMargin), desc: 'antes de custo fixo e aquisição' },
              { label: 'Investido em acervo', value: brl0(o.acquisitionInvested ?? 0), desc: 'no período' },
            ]
          : []),
      ]
    : []

  const receivableCols: Column<FinanceOverview['receivableRows'][number]>[] = [
    { key: 'cod', header: 'Reserva', render: (r) => <Link to={href(`/reservas/${r.reservationId}`)} className="mono fx-nowrap">{r.code}</Link> },
    { key: 'cli', header: 'Cliente', render: (r) => r.customerName },
    {
      key: 'ret',
      header: 'Retirada',
      className: 'mono',
      render: (r) => <span className={r.pickupDate <= addDays(today, 2) ? 'fx-late' : undefined}>{dateBR(r.pickupDate)}</span>,
    },
    { key: 'tot', header: 'Total', align: 'right', className: 'fx-money', render: (r) => brl(r.devido) },
    { key: 'fal', header: 'Falta', align: 'right', className: 'fx-money', render: (r) => <b>{brl(r.due)}</b> },
  ]
  const latestCols: Column<Latest>[] = [
    { key: 'data', header: 'Data', className: 'mono', render: (l) => dateBR(l.paidAt) },
    { key: 'res', header: 'Reserva', render: (l) => (l.reservationId ? <Link to={href(`/reservas/${l.reservationId}`)} className="mono fx-nowrap">{l.code}</Link> : '—') },
    { key: 'cli', header: 'Cliente', render: (l) => l.customerName ?? '—' },
    {
      key: 'tipo',
      header: 'Tipo',
      render: (l) => (
        <>
          {PAYMENT_KIND[l.kind]} {l.kind === 'caucao' && <Badge tone="stone" dot={false}>custódia</Badge>}
        </>
      ),
    },
    { key: 'forma', header: 'Forma', render: (l) => METHOD_LABEL[l.method] },
    { key: 'valor', header: 'Valor', align: 'right', className: 'fx-money', render: (l) => <b className={l.amount < 0 ? 'fx-neg' : undefined}>{brl(l.amount)}</b> },
  ]

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Financeiro</h1>
          <p className="ac-sub">{o ? `${brl0(o.received)} recebidos nos ${rangeText(range)} · ${brl0(o.toReceive)} a receber` : 'Carregando…'}</p>
        </div>
        <div className="ac-actions">
          {geral && (
            <>
              <Link to={href('/financeiro/receber')} className={buttonClass()}>Ver contas a receber</Link>
              <Link to={href('/financeiro/pagar')} className={buttonClass()}>Ver contas a pagar</Link>
            </>
          )}
          <PeriodSeg value={range} onChange={setRange} />
        </div>
      </header>
      <FinanceNav />
      <div className="ac-body">
        {!o ? (
          <p className="muted" role="status" aria-busy="true">Carregando o financeiro…</p>
        ) : (
          <>
            <Tiles tiles={tiles} label="Resumo financeiro" />
            <Card title="Faturamento recebido por mês" meta={<span className="muted tiny">últimos 12 meses · regime de caixa</span>}>
              <LineChart
                ariaLabel="Faturamento recebido por mês, últimos 12 meses"
                format={brl0}
                points={o.monthly.map((m) => ({ label: monthAbbr(m.k), value: m.v }))}
                secondary={consolidated ? { name: 'Pago', points: o.monthly.map((m) => ({ label: monthAbbr(m.k), value: m.paid ?? 0 })) } : undefined}
              />
            </Card>
            <div className="fx-grid2">
              <Card
                title="A receber"
                flush
                className="fx-card-flush"
                meta={o.toReceive > 0 ? <Badge tone="amber">{brl0(o.toReceive)}</Badge> : <Badge tone="green">nada em aberto</Badge>}
              >
                <DataTable
                  caption="A receber"
                  columns={receivableCols}
                  rows={o.receivableRows}
                  rowKey={(r) => r.reservationId}
                  onRowClick={(r) => navigate(href(`/reservas/${r.reservationId}`))}
                  empty={<EmptyState icon="moeda" title="Nada a receber" description="Nenhuma reserva com valor em aberto." />}
                />
                {o.pendingCharges.length > 0 && (
                  <>
                    <p className="eyebrow fx-sub-h">Cobranças lançadas e pendentes</p>
                    <ul className="fx-list">
                      {o.pendingCharges.map((c, i) => (
                        <li key={i}>
                          <span className="grow">
                            {PAYMENT_KIND[c.kind]} · {c.customerName} {c.notes}
                          </span>
                          <b className="fx-money">{brl(c.amount)}</b>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
              <Card title="Formas de pagamento" meta={<span className="muted tiny">{rangeText(range)}</span>} flush>
                {o.byMethod.length === 0 ? (
                  <EmptyState icon="moeda" title="Sem recebimentos no período" />
                ) : (
                  <BarList format={brl0} rows={o.byMethod.map((m) => ({ label: m.label, value: m.total, note: `${m.count}×` }))} />
                )}
              </Card>
            </div>
            {geral && <DueSoon today={today} />}
            <Card title="Últimos lançamentos" meta={<span className="muted tiny">{o.latest.length} de {o.latest.length}</span>} flush className="fx-card-flush">
              <DataTable
                caption="Últimos lançamentos"
                columns={latestCols}
                rows={o.latest}
                rowKey={(l) => `${l.paidAt}-${l.reservationId}-${l.kind}-${l.amount}`}
                onRowClick={(l) => l.reservationId && navigate(href(`/reservas/${l.reservationId}`))}
                empty={<EmptyState icon="moeda" title="Sem lançamentos" description="Nenhum pagamento no período." />}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
