/* Seções 1 (negócio), 2 (compras) e 5 (clientes) da Inteligência. Cada card mantém título, meta, rótulos e vazios
   do protótipo (spec dashboard §2.2.1); os visuais novos da reorganização (§2.2.2) entram ao lado. */
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { IntelReport, PressureRow } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Card, DataTable, EmptyState, type Column } from '@/ui'
import { BarList, ColumnChart, LineChart } from '../financeiro/charts'
import { brl0, pct } from '../financeiro/period'
import { PressureScatter, SplitBar } from './intelCharts'
import { num1, occZone, pct1, plural, sectionOf, times, type SectionMeta } from './intelShared'

const SIZE_COLORS = ['var(--vivo)', 'var(--t-wine)', 'var(--t-ochre)', 'var(--t-teal)', 'var(--t-indigo)', 'var(--t-stone)']

/** Seção da página: âncora, número, rótulo curto e a pergunta de negócio como título. */
export function IntelSection({ meta, n, lead, children }: { meta: SectionMeta; n: number; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={meta.id} className="in-sec" aria-labelledby={`${meta.id}-h`}>
      <header className="in-sec-h">
        <p className="eyebrow">
          {n} · {meta.eyebrow}
        </p>
        <h2 id={`${meta.id}-h`} className="display">
          {meta.title}
        </h2>
        {lead && <p className="in-sec-lead">{lead}</p>}
      </header>
      {children}
    </section>
  )
}

const meta = (s: string) => <span className="muted tiny">{s}</span>

/** 1. Como está o negócio? — evolução mensal e ticket por categoria. */
export function SectionNegocio({ r }: { r: IntelReport }) {
  const k = r.kpis
  return (
    <IntelSection
      meta={sectionOf('negocio')}
      n={1}
      lead={`${plural(k.rentals, 'locação', 'locações')} (itens) e ${brl0(k.revenue)} no período — ticket de ${brl0(k.avgTicket)} por locação (item).`}
    >
      <div className="in-grid in-grid-wide">
        <Card title="Faturamento e locações por mês" meta={meta('valor das locações pela data de retirada')}>
          {r.kpis.rentals === 0 ? (
            <EmptyState icon="inteligencia" title="Sem locações no período" />
          ) : (
            <>
              <p className="in-chart-h">Faturamento</p>
              <LineChart ariaLabel="Faturamento das locações por mês" name="Faturamento" format={brl0} points={r.monthly.map((m) => ({ label: m.label, value: m.revenue }))} />
              <p className="in-chart-h">Locações</p>
              <ColumnChart ariaLabel="Locações por mês" format={(n) => String(n)} columns={r.monthly.map((m) => ({ label: m.label, value: m.rentals }))} />
            </>
          )}
        </Card>
        <Card id="card-ticket-categoria" title="Ticket por categoria" meta={meta('valor médio por locação (item)')} flush>
          {r.ticketByCategory.length === 0 ? (
            <EmptyState icon="tag" title="Sem locações no período" />
          ) : (
            <>
              <BarList
                ariaLabel="Ticket médio por categoria"
                format={brl0}
                rows={r.ticketByCategory.map((c) => ({ label: c.category, value: c.avgTicket, note: plural(c.rentals, 'locação', 'locações') }))}
              />
              <p className="in-foot">
                Ticket médio geral: <b>{brl0(k.avgTicket)}</b> por locação (item). O ticket do Dashboard é por reserva.
              </p>
            </>
          )}
        </Card>
      </div>
    </IntelSection>
  )
}

function pressureCols(label: string, full: boolean): Column<PressureRow>[] {
  const cols: Column<PressureRow>[] = [
    { key: 'k', header: label, render: (p) => <b>{p.key}</b> },
    { key: 'n', header: 'Peças', align: 'right', render: (p) => p.garments },
  ]
  if (full) {
    cols.push({ key: 'l', header: 'Locações', align: 'right', render: (p) => p.rentals }, { key: 'pv', header: 'Provas', align: 'right', render: (p) => p.fittings })
  }
  cols.push(
    {
      key: 'o',
      header: 'Ocupação',
      align: 'right',
      className: 'fx-money',
      render: (p) => {
        const z = occZone(p.occupancy)
        return (
          <>
            {pct1(p.occupancy)}
            {z && <span className="in-zone" style={{ color: z.color }}> · {z.label}</span>}
          </>
        )
      },
    },
    { key: 'p', header: 'Pressão', align: 'right', className: 'fx-money', render: (p) => <b>{num1(p.pressure)}×</b> },
  )
  return cols
}

/** 2. O que devo comprar? — demanda (tamanho, cor, ocupação) contra a oferta (peças por segmento). */
export function SectionComprar({ r }: { r: IntelReport }) {
  const [dim, setDim] = useState<'size' | 'category'>('size')
  const scatter = (dim === 'size' ? r.pressureBySize : r.pressureByCategory).map((p) => ({ key: p.key, pressure: p.pressure, occupancy: p.occupancy }))
  return (
    <IntelSection meta={sectionOf('comprar')} n={2} lead="Onde a procura por peça supera o que o acervo oferece — a próxima compra deveria seguir essa pressão.">
      <div className="in-grid">
        <Card id="card-tamanhos" title="Tamanhos mais procurados" meta={meta('locações no período')}>
          {r.sizes.length === 0 ? (
            <EmptyState icon="regua" title="Sem dados" />
          ) : (
            <ColumnChart
              ariaLabel="Locações por tamanho no período"
              format={times}
              columns={r.sizes.map((s, i) => ({ label: `Tam. ${s.size}`, value: s.rentals, color: SIZE_COLORS[i % SIZE_COLORS.length] }))}
            />
          )}
        </Card>
        <Card id="card-cores" title="Cores mais procuradas" meta={meta('locações por cor')} flush>
          {r.colors.length === 0 ? (
            <EmptyState icon="gota" title="Sem dados no período" />
          ) : (
            <BarList
              ariaLabel="Locações por cor no período"
              format={times}
              rows={r.colors.slice(0, 8).map((c) => ({ label: c.color, value: c.rentals, note: `${c.inStock} no acervo`, color: c.hex }))}
            />
          )}
        </Card>
        <Card id="card-ocupacao" title="Ocupação por categoria" meta={meta('dias alugados ÷ dias disponíveis')} flush>
          <BarList
            ariaLabel="Ocupação por categoria"
            format={pct1}
            rows={r.occupancyByCategory.map((c) => {
              const z = occZone(c.rate)
              return { label: c.category, value: c.rate, note: [plural(c.garments, 'peça', 'peças'), z?.label].filter(Boolean).join(' · '), color: z?.color ?? 'var(--vivo)' }
            })}
          />
          <p className="in-foot">Faixas: atenção &gt; 14% · falta acervo &gt; 25%. Acima de 25% é sinal de que falta acervo.</p>
        </Card>
        <Card
          title="Pressão × ocupação"
          meta={meta('canto superior direito = comprar mais')}
          actions={
            <div className="ac-seg" role="group" aria-label="Segmento da dispersão">
              <button type="button" aria-pressed={dim === 'size'} onClick={() => setDim('size')}>
                Tamanho
              </button>
              <button type="button" aria-pressed={dim === 'category'} onClick={() => setDim('category')}>
                Categoria
              </button>
            </div>
          }
        >
          <PressureScatter points={scatter} ariaLabel={`Pressão × ocupação por ${dim === 'size' ? 'tamanho' : 'categoria'}`} />
        </Card>
        <Card id="card-pressao-tamanho" title="Pressão do acervo por tamanho" meta={meta('procuras por peça — não volume absoluto')} flush className="in-span2">
          <DataTable caption="Pressão do acervo por tamanho" columns={pressureCols('Tamanho', true)} rows={r.pressureBySize} rowKey={(p) => p.key} />
          <p className="in-foot">
            Pressão = (locações + metade das provas) ÷ peças do segmento. Um tamanho com muitas locações pode simplesmente ter muitas peças; a pressão corrige isso.
          </p>
        </Card>
        <Card title="Pressão por categoria" meta={meta('onde falta acervo')} flush className="in-span2">
          <DataTable caption="Pressão por categoria" columns={pressureCols('Categoria', false)} rows={r.pressureByCategory} rowKey={(p) => p.key} />
        </Card>
      </div>
    </IntelSection>
  )
}

type TopCustomer = IntelReport['topCustomers'][number]

/** 5. Quem são as clientes? — quem mais aluga e quanto a recorrência pesa na receita. */
export function SectionClientes({ r }: { r: IntelReport }) {
  const href = useAppHref()
  const navigate = useNavigate()
  const k = r.kpis
  const cr = r.customerRevenue
  const cols: Column<TopCustomer>[] = [
    {
      key: 'c',
      header: 'Cliente',
      render: (c) => (
        <>
          <Link to={href(`/clientes/${c.customerId}`)}>{c.name}</Link>
          {c.city && <span className="fx-sub-t">{c.city}</span>}
        </>
      ),
    },
    { key: 'l', header: 'Locações', align: 'right', render: (c) => c.rentals },
    { key: 't', header: 'Total', align: 'right', className: 'fx-money', render: (c) => <b>{brl0(c.spent)}</b> },
    { key: 'k', header: 'Ticket', align: 'right', className: 'fx-money', render: (c) => brl0(c.ticket) },
  ]
  return (
    <IntelSection
      meta={sectionOf('clientes')}
      n={5}
      lead={`${k.activeCustomers} de ${k.totalCustomers} clientes já alugaram; ${pct(k.recurrenceRate)} delas voltaram pelo menos uma segunda vez (todo o histórico).`}
    >
      <div className="in-grid">
        <Card title="Clientes que mais alugam" meta={meta('top 8 por gasto · todo o histórico')} flush>
          <DataTable caption="Clientes que mais alugam" columns={cols} rows={r.topCustomers} rowKey={(c) => c.customerId} onRowClick={(c) => navigate(href(`/clientes/${c.customerId}`))} empty={<EmptyState icon="clientes" title="Nenhuma cliente com locação ainda" />} />
        </Card>
        <Card id="card-recorrentes" title="Receita de recorrentes vs. novas" meta={meta('receita acumulada · reservas realizadas')}>
          <SplitBar
            ariaLabel="Receita de clientes recorrentes e de clientes com uma locação"
            format={brl0}
            parts={[
              { label: 'Recorrentes', value: cr.recurrent, detail: plural(cr.recurrentCount, 'cliente', 'clientes') },
              { label: 'Uma locação só', value: cr.single, detail: plural(cr.singleCount, 'cliente', 'clientes') },
            ]}
          />
          <p className="in-foot in-foot-flat">Recorrente = cliente com 2 ou mais reservas realizadas. Clientes ativas = já alugaram alguma vez.</p>
        </Card>
      </div>
    </IntelSection>
  )
}
