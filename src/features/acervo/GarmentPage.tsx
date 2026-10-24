import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCategories, useGarment, useGarmentEconomics } from '@/data/hooks'
import { useGarmentMaintenances } from '@/data/hooks-operacao'
import { useGarmentReservations } from '@/data/hooks-reservas'
import { BLOCK_KIND, FIT_RUNS_LABEL, GARMENT_STATE, LENGTH_LABEL, STRETCH_LABEL } from '@/data/labels'
import type { Garment } from '@/data/types'
import { brl, dateBR, todayISO } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, EmptyState, Icon, Silhouette, Tabs, buttonClass, type TabItem } from '@/ui'
import { GarmentFittingsPane } from '../provas/FittingPanes'
import { ReservationsPane } from '../reservas/ReservationsPane'
import { BlockModal } from './BlockModal'
import { CalendarPane } from './CalendarPane'
import { STRIP_DAYS, freeDays } from './calendarDays'
import { FitModal } from './FitModal'
import { GarmentForm } from './GarmentForm'
import { MaintenancePane } from './MaintenancePane'
import { MeasurementsModal } from './MeasurementsModal'
import { PhotosPanel } from './PhotosPanel'
import './acervo.css'
import './garment.css'

type TabKey = 'calendario' | 'fotos' | 'historico' | 'reservas' | 'provas' | 'manutencoes' | 'financeiro' | 'medidas'
type Dialog = 'edit' | 'block' | 'fit' | 'measure' | null

const cm = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cm`)
const times = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
const dash = (s: string | null | undefined) => (s && s.trim() ? s : '—')

/**
 * Ficha da peça (protótipo `garmentDetail`): cabeçalho `código · categoria · marca` com Bloquear/Editar, cartão
 * lateral e abas Calendário, Fotos, Histórico, Reservas, Provas, Manutenções, Financeiro (só `acervo.cost`) e Caimento e medidas.
 * A aba ativa fica na URL (`?aba=`), então dá para compartilhar o link direto de uma aba.
 */
export function GarmentPage() {
  const { id } = useParams()
  const q = useGarment(id)
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
            <Link to={href('/acervo')} className="gp-back">
              <Icon name="chevronL" size={13} /> Acervo
            </Link>
          </div>
        </header>
        <div className="ac-body">
          <section className="card">
            <EmptyState
              title="Peça não encontrada"
              description="Pode ter sido removida do acervo."
              action={
                <Link to={href('/acervo')} className="btn">
                  Voltar ao acervo
                </Link>
              }
            />
          </section>
        </div>
      </div>
    )
  }
  return <Ficha garment={q.data} />
}

function Ficha({ garment: g }: { garment: Garment }) {
  const { can } = usePermissions()
  const canCost = can('acervo.cost')
  const canEdit = can('acervo.edit')
  const href = useAppHref()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)
  const reservations = useGarmentReservations(g.id, can('reserva.view'))
  const ops = useGarmentMaintenances(g.id, can('operacao.view'))
  const opsCount = (ops.data?.maintenances.length ?? 0) + (ops.data?.inspections.length ?? 0)

  const tabs: TabItem[] = [
    { key: 'calendario', label: 'Calendário', content: () => <CalendarPane garment={g} /> },
    { key: 'fotos', label: 'Fotos', content: () => <PhotosPanel garment={g} /> },
    { key: 'historico', label: 'Histórico', content: () => <HistoryPane garment={g} /> },
    ...(can('reserva.view')
      ? [
          {
            key: 'reservas',
            label: (
              <>
                Reservas{' '}
                <span className="rd-tab-n" aria-hidden="true">
                  {reservations.data?.length ?? 0}
                </span>
                <span className="sr-only">({reservations.data?.length ?? 0})</span>
              </>
            ),
            content: () => <ReservationsPane rows={reservations.data} show="cliente" loading={reservations.isPending} />,
          },
        ]
      : []),
    ...(can('prova.view') ? [{ key: 'provas', label: 'Provas', content: () => <GarmentFittingsPane garment={g} /> }] : []),
    ...(can('operacao.view')
      ? [
          {
            key: 'manutencoes',
            label: (
              <>
                Manutenções{' '}
                <span className="rd-tab-n" aria-hidden="true">
                  {opsCount}
                </span>
                <span className="sr-only">({opsCount})</span>
              </>
            ),
            content: () => <MaintenancePane garment={g} />,
          },
        ]
      : []),
    ...(canCost ? [{ key: 'financeiro', label: 'Financeiro', content: () => <FinancePane garment={g} /> }] : []),
    {
      key: 'medidas',
      label: 'Caimento e medidas',
      content: () => <FitPane garment={g} canEdit={canEdit} canCost={canCost} onFit={() => setDialog('fit')} onMeasure={() => setDialog('measure')} />,
    },
  ]
  const aba = params.get('aba')
  const selected = tabs.some((t) => t.key === aba) ? (aba as TabKey) : 'calendario'

  function selectTab(key: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (key === 'calendario') next.delete('aba')
        else next.set('aba', key)
        return next
      },
      { replace: true },
    )
  }

  const sub = [g.code, g.categoryName, g.brandName].filter(Boolean).join(' · ')

  return (
    <div className="ac-page gp-page">
      <header className="ac-head gp-head">
        <div className="ac-title">
          <Link to={href('/acervo')} className="gp-back">
            <Icon name="chevronL" size={13} /> Acervo
          </Link>
          <h1 className="display">{g.name}</h1>
          <p className="ac-sub mono-code">{sub}</p>
        </div>
        <div className="ac-actions">
          {can('acervo.block') && (
            <Button icon="tag" onClick={() => setDialog('block')}>
              Bloquear
            </Button>
          )}
          {canEdit && (
            <Button icon="editar" onClick={() => setDialog('edit')}>
              Editar
            </Button>
          )}
          {can('reserva.create') && (
            <Link to={href(`/reservas?nova=1&peca=${g.id}`)} className={buttonClass('primary')}>
              <Icon name="plus" size={15} /> Reservar
            </Link>
          )}
        </div>
      </header>

      <div className="ac-body">
        <div className="gp-profile">
          <SideCard garment={g} />
          <div className="gp-main">
            {canCost ? <EconomicsBand garment={g} /> : <AvailabilityBand garment={g} />}
            <Tabs label="Ficha da peça" tabs={tabs} selected={selected} onSelect={selectTab} className="gp-tabs" />
          </div>
        </div>
      </div>

      <GarmentForm open={dialog === 'edit'} onClose={close} garment={g} />
      <BlockModal open={dialog === 'block'} onClose={close} garment={g} />
      <FitModal open={dialog === 'fit'} onClose={close} garment={g} />
      <MeasurementsModal open={dialog === 'measure'} onClose={close} garment={g} />
    </div>
  )
}

/* ------------------------------------------------------------ cartão lateral */

function SideCard({ garment: g }: { garment: Garment }) {
  const categories = useCategories()
  const st = GARMENT_STATE[g.state]
  const today = todayISO()
  const next = g.blocks.filter((b) => b.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0]
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  const catDays = categories.data?.find((c) => c.slug === g.categorySlug)?.cleaningDays
  const days = g.cleaningDays ?? catDays
  const rows: [string, ReactNode][] = [
    [
      'Tamanho',
      <>
        {g.labelSize} ({g.sizeEquiv})
      </>,
    ],
    [
      'Cor',
      <span className="gp-color">
        <i style={{ background: g.colorHex }} aria-hidden="true" />
        {g.colorPrimary}
      </span>,
    ],
    ['Tecido', dash(g.fabric)],
    ['Comprimento', LENGTH_LABEL[g.length]],
    ['Decote', dash(g.neckline)],
    ['Manga', dash(g.sleeve)],
    ['Estilo', dash(g.style)],
    ['Ocasiões', g.occasions.length ? g.occasions.join(', ') : '—'],
    ['Localização', dash(g.location)],
    ['Buffer', days == null ? '—' : `${days} ${days === 1 ? 'dia' : 'dias'} de higienização`],
  ]
  return (
    <aside className="card gp-side" aria-label="Resumo da peça">
      <div className="gp-side-ph" style={{ '--tint': g.colorHex || '#8C8C8C' } as CSSProperties}>
        {cover ? (
          <img src={cover.url} alt={`${g.name} — foto de capa`} />
        ) : (
          <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} label={`${g.name} — ${g.colorPrimary}`} code={g.code} />
        )}
      </div>
      <div className="gp-side-b">
        <div className="spread">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="gp-price display">{brl(g.rentalPrice, { cents: false })}</span>
        </div>
        {next ? (
          <div className="note info">
            <Icon name="relogio" size={15} />
            <span>
              <b>Próximo compromisso:</b> {BLOCK_KIND[next.kind].label} de {dateBR(next.from).slice(0, 5)} a {dateBR(next.to).slice(0, 5)}
            </span>
          </div>
        ) : g.state === 'disponivel' ? (
          <div className="note green">
            <Icon name="check" size={15} />
            <span>Livre e sem compromissos futuros.</span>
          </div>
        ) : null}
        <dl className="gp-kv">
          {rows.map(([k, val]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>
        {g.fitNotes && (
          <div className="note info">
            <Icon name="editar" size={15} />
            <span>
              <b>Caimento.</b> {g.fitNotes}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}

/* ------------------------------------------------------- faixa de números */

type Kpi = { label: string; value: string; note: string }

/** Faixa Cranberry acima das abas (protótipo `garmentDetail`, linha de KPIs) — destaque sobre o fundo claro. */
function KpiBand({ items, busy }: { items: Kpi[]; busy?: boolean }) {
  return (
    <dl className="gp-kpis" aria-busy={busy || undefined}>
      {items.map((k) => (
        <div key={k.label}>
          <dt>{k.label}</dt>
          <dd className="display">{k.value}</dd>
          <dd className="gp-kpi-note">{k.note}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Com `acervo.cost`: locações, receita, resultado e payback. */
function EconomicsBand({ garment: g }: { garment: Garment }) {
  const ids = useMemo(() => [g.id], [g.id])
  const econ = useGarmentEconomics(ids, true)
  const e = econ.data?.[0]
  const rentals = e?.rentals ?? 0
  const revenue = e?.revenue ?? 0
  const cost = g.acquisitionCost
  const result = revenue - (cost ?? 0)
  const last = e?.lastRental ?? null
  const missing = cost && !e?.paidBack ? Math.max(1, Math.ceil((cost - revenue) / g.rentalPrice)) : 0
  const pending = !econ.data
  const v = (s: string) => (pending ? '—' : s)
  return (
    <KpiBand
      busy={pending}
      items={[
        { label: 'Locações', value: v(String(rentals)), note: last ? `última ${dateBR(last).slice(0, 5)}` : rentals ? 'desde a compra' : 'nenhuma ainda' },
        { label: 'Receita', value: v(brl(revenue, { cents: false })), note: rentals ? `média ${brl(revenue / rentals, { cents: false })}/locação` : 'sem locações' },
        {
          label: 'Resultado',
          value: v(cost == null ? '—' : brl(result, { cents: false })),
          note: cost == null ? 'sem custo registrado' : result >= 0 ? 'acima do investimento' : 'abaixo do investimento',
        },
        {
          label: 'Payback',
          value: v(rentals === 0 || e?.payback == null ? '—' : times(e.payback)),
          note: e?.paidBack ? 'investimento recuperado' : missing ? `faltam ${missing} ${missing === 1 ? 'locação' : 'locações'}` : 'sem custo registrado',
        },
      ]}
    />
  )
}

/** Sem `acervo.cost` (Atendimento): só o que ajuda a atender — disponibilidade, próximo compromisso e higienização. */
function AvailabilityBand({ garment: g }: { garment: Garment }) {
  const categories = useCategories()
  const today = todayISO()
  const free = freeDays(g.blocks, today)
  const next = g.blocks.filter((b) => b.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0]
  const days = g.cleaningDays ?? categories.data?.find((c) => c.slug === g.categorySlug)?.cleaningDays
  return (
    <KpiBand
      items={[
        { label: 'Dias livres', value: String(free), note: `nos próximos ${STRIP_DAYS} dias` },
        { label: 'Próximo compromisso', value: next ? dateBR(next.from).slice(0, 5) : '—', note: next ? BLOCK_KIND[next.kind].label.toLowerCase() : 'agenda livre' },
        { label: 'Higienização', value: days == null ? '—' : `${days} ${days === 1 ? 'dia' : 'dias'}`, note: 'entre uma locação e outra' },
      ]}
    />
  )
}

/* ---------------------------------------------------------------- histórico */

function HistoryPane({ garment: g }: { garment: Garment }) {
  const items = g.history.slice(0, 60)
  return (
    <section className="card">
      <div className="card-h">
        <h3>Linha do tempo da peça</h3>
        <span className="muted tiny">
          {g.history.length} {g.history.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>
      <div className="card-b">
        <ol className="gp-tline">
          {items.map((h, i) => (
            <li key={`${h.at}-${i}`} className="ev">
              <span className="dt">{dateBR(h.at)}</span>
              <span className="ln" aria-hidden="true">
                <i data-tone={GARMENT_STATE[h.to].tone} />
              </span>
              <span className="bd">
                <span className="t2">{h.reason || GARMENT_STATE[h.to].label}</span>
                <span className="n2">
                  {h.from ? `${GARMENT_STATE[h.from].label} → ` : ''}
                  {GARMENT_STATE[h.to].label} · {h.userName}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- financeiro */

function FinancePane({ garment: g }: { garment: Garment }) {
  const ids = useMemo(() => [g.id], [g.id])
  const econ = useGarmentEconomics(ids, true)
  const e = econ.data?.[0]
  if (!econ.data) return <section className="card gp-skel-card" aria-busy="true" />
  const revenue = e?.revenue ?? 0
  const rentals = e?.rentals ?? 0
  const cost = g.acquisitionCost
  const result = revenue - (cost ?? 0)
  const missing = cost && !e?.paidBack ? Math.max(1, Math.ceil((cost - revenue) / g.rentalPrice)) : 0
  const lines: [string, string, string?][] = [
    ['Locações', String(rentals)],
    ['Receita acumulada', brl(revenue), 'pos'],
    ['Custo de aquisição', cost == null ? '—' : `− ${brl(cost)}`],
    ['Valor de referência', g.retailReference == null ? '—' : brl(g.retailReference)],
  ]
  return (
    <section className="card">
      <div className="card-h">
        <h3>Economia da peça</h3>
        <span className="muted tiny">receita − aquisição</span>
      </div>
      <div className="card-b gp-fin">
        <div className="gp-fin-tiles">
          <div>
            <span className="eyebrow">Receita</span>
            <b className="display">{brl(revenue, { cents: false })}</b>
            <span className="tiny muted">{rentals ? `média ${brl(revenue / rentals, { cents: false })} por locação` : 'nenhuma locação'}</span>
          </div>
          <div>
            <span className="eyebrow">Payback</span>
            <b className={e?.paidBack ? 'display gp-pos' : 'display'}>{rentals === 0 || e?.payback == null ? '—' : times(e.payback)}</b>
            <span className="tiny muted">{e?.paidBack ? 'investimento recuperado' : missing ? `${missing} ${missing === 1 ? 'locação' : 'locações'} para o zero a zero` : 'sem custo registrado'}</span>
          </div>
        </div>
        <dl className="gp-fin-lines">
          {lines.map(([k, v, tone]) => (
            <div key={k} className="spread">
              <dt className="muted">{k}</dt>
              <dd className={tone === 'pos' ? 'num gp-pos' : 'num'}>{v}</dd>
            </div>
          ))}
          <hr className="sep" />
          <div className="spread gp-fin-result">
            <dt>Resultado econômico</dt>
            <dd className={`num display ${result >= 0 ? 'gp-pos' : 'gp-neg'}`}>{brl(result)}</dd>
          </div>
        </dl>
        {rentals === 0 ? (
          <div className="note info">
            <Icon name="relogio" size={15} />
            <span>Receita e despesas aparecem quando reservas e manutenções estiverem ativas.</span>
          </div>
        ) : e?.paidBack ? (
          <div className="note green">
            <Icon name="check" size={15} />
            <span>
              <b>Investimento recuperado.</b> A peça devolveu {times(e.payback!)} o que custou, em {rentals} {rentals === 1 ? 'locação' : 'locações'}.
            </span>
          </div>
        ) : cost ? (
          <div className="note info">
            <Icon name="relogio" size={15} />
            <span>
              <b>
                {missing === 1 ? 'Falta 1 locação' : `Faltam ${missing} locações`}
              </b>{' '}
              para recuperar o investimento de {brl(cost, { cents: false })}, ao preço atual de {brl(g.rentalPrice, { cents: false })}.
            </span>
          </div>
        ) : (
          <div className="note info">
            <Icon name="relogio" size={15} />
            <span>Sem custo de aquisição registrado.</span>
          </div>
        )}
        <p className="tiny muted">Higienização e manutenção entram na conta quando a Operação estiver ativa. Valores desta prévia são fictícios.</p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------- caimento e medidas */

function FitPane({
  garment: g,
  canEdit,
  canCost,
  onFit,
  onMeasure,
}: {
  garment: Garment
  canEdit: boolean
  canCost: boolean
  onFit(): void
  onMeasure(): void
}) {
  const m = g.measurement
  return (
    <div className="gp-stack">
      <section className="card">
        <div className="card-h">
          <h3>Caimento observado</h3>
          <span className="muted tiny gp-h-note">o que a equipe aprendeu vestindo esta peça em clientes reais</span>
          {canEdit && (
            <div className="actions">
              <Button size="sm" icon="editar" onClick={onFit}>
                Atualizar
              </Button>
            </div>
          )}
        </div>
        <div className="card-b gp-stack-sm">
          {g.fitRuns ? (
            <div className={`note ${g.fitRuns === 'fiel' ? 'green' : 'amber'}`}>
              <Icon name="regua" size={15} />
              <span>
                <b>{FIT_RUNS_LABEL[g.fitRuns]}.</b>
                {g.commonAlteration && <> Ajuste mais comum: {g.commonAlteration}.</>}
              </span>
            </div>
          ) : (
            <div className="note info">
              <Icon name="regua" size={15} />
              <span>Caimento ainda não registrado.{canEdit && ' Depois de algumas provas, registre aqui o que a equipe observou.'}</span>
            </div>
          )}
          <div className="gp-two">
            <dl className="gp-kv wide">
              <div>
                <dt>Busto confortável até</dt>
                <dd>{cm(g.bustComfortCm)}</dd>
              </div>
              <div>
                <dt>Cintura máxima observada</dt>
                <dd>{cm(g.waistMaxCm)}</dd>
              </div>
              <div>
                <dt>Quadril máximo observado</dt>
                <dd>{cm(g.hipMaxCm)}</dd>
              </div>
            </dl>
            <dl className="gp-kv wide">
              <div>
                <dt>Elasticidade do tecido</dt>
                <dd>{m.stretch ? STRETCH_LABEL[m.stretch] : '—'}</dd>
              </div>
              <div>
                <dt>Barra prevista para salto</dt>
                <dd>{cm(g.hemHeelCm)}</dd>
              </div>
            </dl>
          </div>
          {g.fitNotes && (
            <div className="note info">
              <Icon name="editar" size={15} />
              <span>
                <b>Observação da equipe.</b> {g.fitNotes}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h3>Medidas da peça</h3>
          <span className="muted tiny gp-h-note">confrontar com as medidas da cliente antes de prometer</span>
          {canEdit && (
            <div className="actions">
              <Button size="sm" icon="regua" onClick={onMeasure}>
                Atualizar
              </Button>
            </div>
          )}
        </div>
        <div className="card-b">
          <dl className="gp-measures">
            {(
              [
                ['Busto', cm(m.bustCm)],
                ['Cintura', cm(m.waistCm)],
                ['Quadril', cm(m.hipCm)],
                ['Ombro', cm(m.shoulderCm)],
                ['Comprimento total', cm(m.totalLengthCm)],
                ['Sobra de barra', cm(m.hemAllowanceCm)],
                ['Elasticidade', m.stretch ? STRETCH_LABEL[m.stretch] : '—'],
                ...(canCost ? [['Valor de referência', g.retailReference == null ? '—' : brl(g.retailReference)]] : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={v === '—' ? 'muted' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  )
}
