import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useFittingKpis, useFittings } from '@/data/hooks-agenda'
import { FITTING_STATE } from '@/data/labels-ops'
import type { FittingFilter, FittingListRow } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, Card, Chips, DataTable, EmptyState, type ChipOption, type Column } from '@/ui'
import { pct, plural, whenShort } from './fittingFormat'
import { ScheduleFittingModal } from './ScheduleFittingModal'
import '../acervo/acervo.css'
import './provas.css'

const PAGE = 50
const FILTERS: ChipOption<FittingFilter>[] = [
  { value: 'abertas', label: 'Em aberto' },
  { value: 'convertidas', label: 'Convertidas' },
  { value: 'perdidas', label: 'Sem conversão' },
  { value: 'todas', label: 'Todas' },
]
const isFilter = (v: string | null): v is FittingFilter => !!v && FILTERS.some((f) => f.value === v)

/** Provas — lista: tiles de conversão, filtros por situação e tabela (mais recente primeiro). Filtro na URL (`?f=`). */
export function ProvasListPage() {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const fp = params.get('f')
  const filter: FittingFilter = isFilter(fp) ? fp : 'abertas'
  const [more, setMore] = useState({ key: filter, pages: 1 })
  const pages = more.key === filter ? more.pages : 1
  const [scheduling, setScheduling] = useState(false)

  const kpis = useFittingKpis()
  const list = useFittings(filter, { limit: PAGE * pages, offset: 0 })
  const k = kpis.data
  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0

  const subtitle = k ? `${plural(k.total, 'sessão', 'sessões')} · ${pct(k.rate)} de conversão` : ' '

  const columns: Column<FittingListRow>[] = [
    {
      key: 'code',
      header: 'Prova',
      className: 'mono pv-code',
      render: (r) => (
        <Link to={href(`/provas/${r.id}`)} onClick={(e) => e.stopPropagation()}>
          {r.code}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (r) => (
        <span className="pv-cust">
          <b>{r.customerName || '—'}</b>
          <span className="muted tiny">{r.eventType ?? ''}</span>
        </span>
      ),
    },
    { key: 'when', header: 'Quando', className: 'mono', render: (r) => whenShort(r.scheduledAt) },
    { key: 'items', header: 'Peças', align: 'right', render: (r) => r.itemCount },
    {
      key: 'result',
      header: 'Resultado',
      render: (r) =>
        r.itemCount > 0 ? (
          `${plural(r.approvedCount, 'aprovada', 'aprovadas')} · ${plural(r.discardedCount, 'descartada', 'descartadas')}`
        ) : (
          <span className="muted">sem registro</span>
        ),
    },
    {
      key: 'state',
      header: 'Situação',
      render: (r) => <Badge tone={FITTING_STATE[r.state].tone}>{FITTING_STATE[r.state].label}</Badge>,
    },
  ]

  function setFilter(f: FittingFilter) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (f === 'abertas') next.delete('f')
        else next.set('f', f)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Provas</h1>
          <p className="ac-sub">{subtitle}</p>
        </div>
        <div className="ac-actions">
          {can('prova.manage') && (
            <Button variant="primary" icon="plus" onClick={() => setScheduling(true)}>
              Agendar prova
            </Button>
          )}
        </div>
      </header>

      <div className="ac-body">
        <dl className="pv-tiles" aria-label="Números das provas">
          <Tile label="Em aberto" value={k ? String(k.open) : '—'} sub="agendadas ou em curso" />
          <Tile label="Convertidas" value={k ? String(k.converted) : '—'} sub="viraram reserva" />
          <Tile label="Sem conversão" value={k ? String(k.lost) : '—'} sub="cliente não fechou" />
          <Tile label="Taxa de conversão" value={k ? pct(k.rate) : '—'} sub={k ? `sobre ${plural(k.closed, 'prova encerrada', 'provas encerradas')}` : ' '} />
        </dl>

        <section className="card pv-filters" aria-label="Filtros das provas">
          <Chips label="Situação" options={FILTERS} value={filter} onChange={setFilter} />
        </section>

        {list.data && rows.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma prova neste filtro" description="Agende uma prova a partir da ficha da cliente ou da agenda." />
          </Card>
        ) : (
          <Card flush className="ac-table">
            <DataTable caption="Provas" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => navigate(href(`/provas/${r.id}`))} />
          </Card>
        )}

        {rows.length > 0 && rows.length < total && (
          <div className="pv-more">
            <span className="muted tiny">
              Mostrando {rows.length} de {total}
            </span>
            <Button onClick={() => setMore({ key: filter, pages: pages + 1 })} disabled={list.isFetching}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>

      <ScheduleFittingModal open={scheduling} onClose={() => setScheduling(false)} />
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="pv-tile">
      <dt>{label}</dt>
      <dd>
        <b className="display">{value}</b>
        <span className="tiny muted">{sub}</span>
      </dd>
    </div>
  )
}

