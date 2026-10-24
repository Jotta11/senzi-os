/* Seções 3 (peças que não rendem) e 4 (provas) da Inteligência. Custo, receita do capital parado e payback
   exigem `acervo.cost` (spec dashboard §5). Linhas levam à ficha da peça. */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { GARMENT_STATE } from '@/data/labels'
import type { GarmentState, IntelReport } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Badge, Card, Chips, DataTable, EmptyState, type Column } from '@/ui'
import { BarList } from '../financeiro/charts'
import { brl0, pct } from '../financeiro/period'
import { IntelSection } from './IntelSections'
import { Funnel } from './intelCharts'
import { num1, plural, sectionOf, times } from './intelShared'

const meta = (s: string) => <span className="muted tiny">{s}</span>

/** Código (mono) + nome com link para a ficha. */
function GarmentCell({ id, code, name }: { id: string; code: string; name: string }) {
  const href = useAppHref()
  return (
    <span className="in-gcell">
      <span className="mono tiny muted">{code}</span>
      <Link to={href(`/acervo/${id}`)}>{name}</Link>
    </span>
  )
}

type Idle = IntelReport['idleCapital'][number]
type Paid = IntelReport['paidBack'][number]
type NotRented = IntelReport['fittedNotRented'][number]
type Rare = IntelReport['rarelyFitted'][number]

/** 3. Quais peças não estão rendendo? — capital parado, receita por peça e quem já se pagou. */
export function SectionRendimento({ r }: { r: IntelReport }) {
  const { can } = usePermissions()
  const cost = can('acervo.cost')
  const href = useAppHref()
  const navigate = useNavigate()
  const [sort, setSort] = useState<'custo' | 'parada'>('custo')
  const [state, setState] = useState<GarmentState | ''>('')
  const [side, setSide] = useState<'top' | 'bottom'>('top')
  const open = (id: string) => navigate(href(`/acervo/${id}`))

  const states = [...new Set(r.idleCapital.map((g) => g.state))]
  const idle = r.idleCapital
    .filter((g) => !state || g.state === state)
    .sort((a, b) =>
      sort === 'parada' ? (b.idleDays ?? 1e9) - (a.idleDays ?? 1e9) || (b.cost ?? 0) - (a.cost ?? 0) : cost ? (b.cost ?? 0) - (a.cost ?? 0) : a.code.localeCompare(b.code),
    )
  const idleCols: Column<Idle>[] = [
    { key: 'p', header: 'Peça', render: (g) => <GarmentCell id={g.garmentId} code={g.code} name={g.name} /> },
    { key: 'e', header: 'Estado', render: (g) => <Badge tone={GARMENT_STATE[g.state].tone}>{GARMENT_STATE[g.state].label}</Badge> },
    ...(cost
      ? [
          { key: 'c', header: 'Custo', align: 'right' as const, className: 'fx-money', render: (g: Idle) => (g.cost == null ? '—' : brl0(g.cost)) },
          { key: 'r', header: 'Receita', align: 'right' as const, className: 'fx-money', render: (g: Idle) => brl0(g.revenue) },
        ]
      : []),
    { key: 'd', header: 'Parada há', align: 'right', render: (g) => (g.idleDays == null ? <span className="in-never">nunca alugada</span> : `${g.idleDays} dias`) },
  ]
  const paidCols: Column<Paid>[] = [
    { key: 'p', header: 'Peça', render: (g) => <GarmentCell id={g.garmentId} code={g.code} name={g.name} /> },
    { key: 'i', header: 'Investimento', align: 'right', className: 'fx-money', render: (g) => brl0(g.cost) },
    { key: 'r', header: 'Receita', align: 'right', className: 'fx-money', render: (g) => <b>{brl0(g.revenue)}</b> },
    { key: 'x', header: 'Payback', align: 'right', className: 'fx-money', render: (g) => `${num1(g.payback)}×` },
    { key: 'n', header: 'Pagou em', align: 'right', render: (g) => plural(g.rentalsToPayback, 'locação', 'locações') },
  ]
  const revenue = side === 'top' ? r.revenueByGarment : r.revenueByGarmentBottom

  return (
    <IntelSection meta={sectionOf('rendimento')} n={3} lead={`Peças sem locação há mais de ${r.idleAlertDays} dias (ou nunca alugadas), o que cada peça faturou e quais já devolveram o investimento.`}>
      <div className="in-grid">
        <Card id="card-capital" title="Capital parado" meta={meta('peças sem locação recente')} flush>
          <div className="in-tools">
            {states.length > 1 && (
              <Chips<GarmentState | ''>
                label="Estado da peça"
                value={state}
                onChange={setState}
                options={[{ value: '', label: 'Todos' }, ...states.map((s) => ({ value: s, label: GARMENT_STATE[s].label }))]}
              />
            )}
            <div className="ac-seg" role="group" aria-label="Ordenar capital parado">
              <button type="button" aria-pressed={sort === 'custo'} onClick={() => setSort('custo')}>
                {cost ? 'Maior custo' : 'Peça'}
              </button>
              <button type="button" aria-pressed={sort === 'parada'} onClick={() => setSort('parada')}>
                Parada há mais tempo
              </button>
            </div>
          </div>
          <DataTable
            caption="Capital parado"
            columns={idleCols}
            rows={idle}
            rowKey={(g) => g.garmentId}
            onRowClick={(g) => open(g.garmentId)}
            empty={<EmptyState icon="check" title="Acervo inteiro girando" description={`Nenhuma peça parada há mais de ${r.idleAlertDays} dias.`} />}
          />
          {cost && idle.length > 0 && (
            <p className="in-foot">
              {plural(idle.length, 'peça', 'peças')} · <b>{brl0(idle.reduce((s, g) => s + (g.cost ?? 0), 0))}</b> de capital parado (custo de aquisição).
            </p>
          )}
        </Card>
        <Card
          title="Receita por peça"
          meta={meta(side === 'top' ? 'top 8 no período' : '8 menores no período')}
          flush
          actions={
            <div className="ac-seg" role="group" aria-label="Receita por peça">
              <button type="button" aria-pressed={side === 'top'} onClick={() => setSide('top')}>
                Maiores
              </button>
              <button type="button" aria-pressed={side === 'bottom'} onClick={() => setSide('bottom')}>
                Menores
              </button>
            </div>
          }
        >
          {revenue.length === 0 ? (
            <EmptyState icon="moeda" title="Sem locações no período" />
          ) : (
            <>
              <BarList
                ariaLabel="Receita por peça no período"
                format={brl0}
                rows={revenue.map((g) => ({ label: g.name, value: g.revenue, note: times(g.rentals), color: g.hex, href: href(`/acervo/${g.garmentId}`) }))}
              />
              <p className="in-foot">A barra usa a cor real da peça.</p>
            </>
          )}
        </Card>
        {cost && (
          <Card id="card-pagas" title="Peças que já se pagaram" meta={meta('receita acumulada ≥ custo de aquisição · todo o histórico')} flush className="in-span2">
            <DataTable
              caption="Peças que já se pagaram"
              columns={paidCols}
              rows={[...r.paidBack].sort((a, b) => b.payback - a.payback)}
              rowKey={(g) => g.garmentId}
              onRowClick={(g) => open(g.garmentId)}
              empty={<EmptyState icon="moeda" title="Nenhuma peça se pagou ainda" />}
            />
          </Card>
        )}
      </div>
    </IntelSection>
  )
}

const signal = (g: NotRented) => (g.alterations > 0 ? `${g.alterations} pediram ajuste` : g.discards > 0 ? `${g.discards} descarte(s)` : 'sem sinal claro')

/** 4. As provas viram locação? — funil do período, conversão por peça e as peças que encantam e não fecham. */
export function SectionProvas({ r }: { r: IntelReport }) {
  const href = useAppHref()
  const navigate = useNavigate()
  const f = r.fittingFunnel
  const open = (id: string) => navigate(href(`/acervo/${id}`))
  const notCols: Column<NotRented>[] = [
    { key: 'p', header: 'Peça', render: (g) => <GarmentCell id={g.garmentId} code={g.code} name={g.name} /> },
    { key: 'pv', header: 'Provas', align: 'right', render: (g) => g.fittings },
    { key: 'l', header: 'Locações', align: 'right', render: (g) => g.converted },
    { key: 'c', header: 'Conversão', align: 'right', render: (g) => <b className="fx-neg">{pct(g.rate ?? 0)}</b> },
    { key: 's', header: 'Sinal', render: signal },
  ]
  const rareCols: Column<Rare>[] = [
    { key: 'p', header: 'Peça', render: (g) => <GarmentCell id={g.garmentId} code={g.code} name={g.name} /> },
    { key: 'pv', header: 'Provas', align: 'right', render: (g) => g.fittings },
    { key: 'l', header: 'Locações', align: 'right', render: (g) => g.rentals },
  ]
  return (
    <IntelSection
      meta={sectionOf('provas')}
      n={4}
      lead={
        r.kpis.fittingConversion == null
          ? 'Nenhuma prova encerrada no período.'
          : `${pct(r.kpis.fittingConversion)} das provas encerradas no período viraram reserva (${f.converted} de ${f.closed}; “concluída” sem reserva não conta).`
      }
    >
      <div className="in-grid">
        <Card id="card-funil" title="Funil de prova" meta={meta('provas agendadas no período')}>
          <Funnel
            ariaLabel="Funil de prova no período"
            steps={[
              { label: 'Agendadas', value: f.scheduled, note: 'no período' },
              { label: 'Realizadas', value: f.held },
              { label: 'Convertidas', value: f.converted },
            ]}
          />
          <p className="in-foot in-foot-flat">
            Taxa de conversão: <b>{r.kpis.fittingConversion == null ? '—' : pct(r.kpis.fittingConversion)}</b> sobre {plural(f.closed, 'prova encerrada', 'provas encerradas')} (convertida, perdida ou não compareceu).
          </p>
        </Card>
        <Card title="Conversão de prova por peça" meta={meta('quem encanta e fecha')} flush>
          {r.fittingConversionByGarment.length === 0 ? (
            <EmptyState icon="prova" title="Ainda sem provas suficientes" description="Registre o resultado das provas para alimentar este indicador." />
          ) : (
            <BarList
              ariaLabel="Conversão de prova por peça"
              format={pct}
              rows={r.fittingConversionByGarment.map((g) => ({ label: g.name, value: g.rate, note: `${g.converted}/${g.fittings}`, color: g.hex, href: href(`/acervo/${g.garmentId}`) }))}
            />
          )}
        </Card>
        <Card id="card-encanta" title="Encanta e não fecha" meta={meta('muita prova, pouca locação')} flush>
          <DataTable
            caption="Encanta e não fecha"
            columns={notCols}
            rows={r.fittedNotRented.slice(0, 8)}
            rowKey={(g) => g.garmentId}
            onRowClick={(g) => open(g.garmentId)}
            empty={<EmptyState icon="coracao" title="Nenhuma peça nesse padrão" description="Quem prova, leva." />}
          />
        </Card>
        <Card id="card-pouco-provadas" title="Quase nunca provadas" meta={meta('até 1 prova e até 1 locação · todo o histórico')} flush>
          <DataTable
            caption="Quase nunca provadas"
            columns={rareCols}
            rows={r.rarelyFitted}
            rowKey={(g) => g.garmentId}
            onRowClick={(g) => open(g.garmentId)}
            empty={<EmptyState icon="olho" title="Todas as peças estão sendo provadas" />}
          />
        </Card>
      </div>
    </IntelSection>
  )
}
