import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCategories } from '@/data/hooks'
import { useIntelReport } from '@/data/hooks-intel'
import type { IntelPeriod, IntelReport } from '@/data/types'
import { Field, Icon } from '@/ui'
import '../acervo/acervo.css'
import '../financeiro/financeiro.css'
import { brl0, pct } from '../financeiro/period'
import { Insights } from './Insights'
import { scrollToId, SECTIONS } from './intelShared'
import { SectionClientes, SectionComprar, SectionNegocio } from './IntelSections'
import { SectionProvas, SectionRendimento } from './IntelSectionsPecas'
import './intel.css'

const PERIODS: { value: IntelPeriod; label: string }[] = [
  { value: 90, label: '90 dias' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '12 meses' },
]

/** Período (`?periodo=90|365`, padrão 180) e categoria (`?cat=slug`) na URL, com `replace`. */
function useIntelFilters(): { days: IntelPeriod; cat: string | null; set(k: 'periodo' | 'cat', v: string | null): void } {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('periodo'))
  const days: IntelPeriod = raw === 90 || raw === 365 ? raw : 180
  const set = (k: 'periodo' | 'cat', v: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v == null || (k === 'periodo' && v === '180')) next.delete(k)
        else next.set(k, v)
        return next
      },
      { replace: true },
    )
  return { days, cat: params.get('cat') || null, set }
}

type Tile = { label: string; value: string; detail: string; target: string; alert?: boolean }

function tilesOf(r: IntelReport): Tile[] {
  const k = r.kpis
  return [
    { label: 'Locações', value: String(k.rentals), detail: 'no período', target: 'sec-negocio' },
    { label: 'Faturamento', value: brl0(k.revenue), detail: 'valor das locações', target: 'sec-negocio' },
    { label: 'Ticket médio', value: brl0(k.avgTicket), detail: 'por locação (item)', target: 'card-ticket-categoria' },
    { label: 'Clientes ativas', value: String(k.activeCustomers), detail: `de ${k.totalCustomers} cadastradas`, target: 'sec-clientes' },
    { label: 'Taxa de recorrência', value: pct(k.recurrenceRate), detail: `${k.recurrentCount} clientes voltaram`, target: 'card-recorrentes' },
    { label: 'Peças paradas', value: String(k.idleGarments), detail: `sem locação há ${r.idleAlertDays}+ dias`, target: 'card-capital', alert: k.idleGarments > 0 },
    { label: 'Conversão de prova', value: k.fittingConversion == null ? '—' : pct(k.fittingConversion), detail: `${k.closedFittings} provas encerradas`, target: 'sec-provas' },
  ]
}

/** Âncora que rola suavemente (sem mexer na rota). */
function Jump({ to, className, children, current }: { to: string; className?: string; children: ReactNode; current?: boolean }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      aria-current={current ? 'location' : undefined}
      onClick={(e) => {
        e.preventDefault()
        scrollToId(to)
      }}
    >
      {children}
    </a>
  )
}

/** Seção visível no topo (para destacar a aba-âncora); sem `IntersectionObserver` (testes), fica na primeira. */
function useActiveSection(ready: boolean): string {
  const [active, setActive] = useState(SECTIONS[0]!.id)
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-90px 0px -55% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [ready])
  return active
}

/**
 * Inteligência (spec `dashboard-inteligencia.md` §2.2 + Decisão 12): cabeçalho com período e categoria, faixa
 * Cranberry com os 7 indicadores, "Leitura do período" (insights) e 5 seções por pergunta de negócio com abas-âncora.
 * Rota protegida por `inteligencia.view`; custos por `acervo.cost`.
 */
export function IntelPage() {
  const { can } = usePermissions()
  const { days, cat, set } = useIntelFilters()
  const cats = useCategories()
  const q = useIntelReport(days, cat)
  const r = q.data
  const active = useActiveSection(!!r)
  const catName = cat ? (cats.data?.find((c) => c.slug === cat)?.name ?? cat) : null
  const insights = r ? r.insights.filter((i) => !i.requires || can(i.requires)) : []

  return (
    <div className="ac-page in-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Inteligência</h1>
          <p className="ac-sub">
            {r
              ? `${r.kpis.rentals} locações · ${brl0(r.kpis.revenue)} · ticket ${brl0(r.kpis.avgTicket)} nos últimos ${r.period.days} dias${catName ? ` · ${catName}` : ''}`
              : 'Carregando…'}
          </p>
        </div>
        <div className="ac-actions in-filters">
          <Field as="select" label="Categoria" value={cat ?? ''} onChange={(e) => set('cat', e.target.value || null)}>
            <option value="">Todas as categorias</option>
            {(cats.data ?? []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Field>
          <div className="ac-seg" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button key={p.value} type="button" aria-pressed={days === p.value} onClick={() => set('periodo', String(p.value))}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="ac-body in-body">
        {!r ? (
          q.isError ? (
            <p className="note red">
              <Icon name="alerta" size={15} />
              <span>
                <b>Não foi possível carregar a Inteligência.</b> Tente atualizar a página.
              </span>
            </p>
          ) : (
            <p className="muted" role="status" aria-busy="true">
              Carregando o relatório…
            </p>
          )
        ) : (
          <>
            {catName && (
              <p className="note info in-cat-note">
                <Icon name="filtro" size={15} />
                <span>
                  Mostrando só <b>{catName}</b>. Clientes, taxa de conversão e funil de prova seguem com a loja toda.
                </span>
              </p>
            )}
            <ul className="in-kpis" aria-label="Indicadores do período">
              {tilesOf(r).map((t) => (
                <li key={t.label}>
                  <Jump to={t.target} className={t.alert ? 'in-kpi alert' : 'in-kpi'}>
                    <span className="in-kpi-l">{t.label}</span>
                    <b className="display">{t.value}</b>
                    <span className="in-kpi-d">
                      {t.detail}
                      {t.alert && <span className="in-kpi-flag">atenção</span>}
                    </span>
                  </Jump>
                </li>
              ))}
            </ul>

            <Insights insights={insights} />

            <nav className="in-nav" aria-label="Seções da Inteligência">
              {SECTIONS.map((s, i) => (
                <Jump key={s.id} to={s.id} current={active === s.id}>
                  <span className="in-nav-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  {s.title}
                </Jump>
              ))}
            </nav>

            <SectionNegocio r={r} />
            <SectionComprar r={r} />
            <SectionRendimento r={r} />
            <SectionProvas r={r} />
            <SectionClientes r={r} />
          </>
        )}
      </div>
    </div>
  )
}
