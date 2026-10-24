import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useAcervoInvestment, useCategories, useGarmentCounts, useGarmentEconomics, useGarmentSearch } from '@/data/hooks'
import { GARMENT_STATE, STATE_GROUP_LABEL } from '@/data/labels'
import type { Garment, GarmentEconomics, GarmentFilters, SizeEquiv, StateGroup } from '@/data/types'
import { brl } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, Chips, DataTable, EmptyState, SearchInput, type ChipOption, type Column } from '@/ui'
import { GarmentCard } from './GarmentCard'
import './acervo.css'

export const PAGE_SIZE = 24

type Mode = 'galeria' | 'lista'
const MODE_KEY = 'senzi.acervo.modo'

/** Galeria/Lista lembrado por navegador; leitura e escrita protegidas (modo privado, storage bloqueado). */
function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'lista' ? 'lista' : 'galeria'
  } catch {
    return 'galeria'
  }
}
function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    /* sem storage: vale só nesta visita */
  }
}

const GROUPS: Exclude<StateGroup, 'todos'>[] = ['disponivel', 'reservado', 'em_uso', 'ciclo', 'bloqueado']
const SIZE_FILTERS: SizeEquiv[] = ['P', 'M', 'G', 'GG']
/** Só os grupos que os chips de Estado oferecem: `?st=todos` (baixadas incluídas, nenhum chip marcado) ou valores
 *  desconhecidos caem no padrão (tudo menos baixadas, "Qualquer estado"). */
const isGroup = (v: string | null): v is Exclude<StateGroup, 'todos'> => !!v && (GROUPS as string[]).includes(v)
const isSize = (v: string | null): v is SizeEquiv => !!v && (SIZE_FILTERS as string[]).includes(v)

const times = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`

/**
 * Acervo — lista (protótipo `UI.VIEWS.acervo`). Filtros na URL (`?q=&cat=&st=&tam=`), Galeria/Lista em
 * `localStorage` (`?view=lista|galeria` força um modo sem gravar), 24 por página com "Carregar mais".
 * Custos (investidos, Receita, Payback) só com `acervo.cost` — sem ela a fonte nem é consultada.
 * "Nova peça" (`acervo.create`) põe `?nova=1` na URL; o formulário que lê esse parâmetro vem na Task 3.
 */
export function AcervoListPage() {
  const { can } = usePermissions()
  const canCost = can('acervo.cost')
  const href = useAppHref()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const cat = params.get('cat') || null
  const stRaw = params.get('st')
  const st = isGroup(stRaw) ? stRaw : undefined
  const tamRaw = params.get('tam')
  const size = isSize(tamRaw) ? tamRaw : null

  const base = useMemo(() => ({ q: q || undefined, cat, size }), [q, cat, size])
  const filters = useMemo<GarmentFilters>(() => ({ ...base, stateGroup: st }), [base, st])

  // "Carregar mais" volta para a 1ª página sempre que os filtros mudam
  const fkey = JSON.stringify(filters)
  const [more, setMore] = useState({ key: fkey, pages: 1 })
  const pages = more.key === fkey ? more.pages : 1

  const [storedMode, setStoredMode] = useState<Mode>(readMode)
  const viewParam = params.get('view')
  const mode: Mode = viewParam === 'lista' || viewParam === 'galeria' ? viewParam : storedMode

  const search = useGarmentSearch(filters, { limit: PAGE_SIZE * pages, offset: 0 })
  const counts = useGarmentCounts(base)
  const summary = useGarmentCounts({})
  const invested = useAcervoInvestment(canCost)
  const categories = useCategories()

  const items = useMemo(() => search.data?.items ?? [], [search.data])
  const total = search.data?.total ?? 0
  const ids = useMemo(() => items.map((g) => g.id), [items])
  const econ = useGarmentEconomics(ids, canCost && mode === 'lista')
  const econById = useMemo(() => new Map((econ.data ?? []).map((e) => [e.garmentId, e])), [econ.data])

  function setParam(key: string, value: string | null, replace = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace },
    )
  }

  function chooseMode(m: Mode) {
    saveMode(m)
    setStoredMode(m)
    if (viewParam) setParam('view', null, true)
  }

  // Total do cabeçalho (e "investidos") contam só as peças ativas: exclui `baixado` de propósito,
  // diferente do protótipo (que somava as 28) — peça baixada não infla o acervo.
  const s = summary.data
  const subtitle = s
    ? `${s.ativas} ${s.ativas === 1 ? 'peça' : 'peças'} · ${s.disponivel} ${s.disponivel === 1 ? 'disponível' : 'disponíveis'}` +
      (canCost && invested.data != null ? ` · ${brl(invested.data, { cents: false })} investidos` : '')
    : ' '

  const catOptions: ChipOption<string>[] = [
    { value: '', label: 'Todas as categorias' },
    ...(categories.data ?? []).map((c) => ({ value: c.slug, label: c.name })),
  ]
  const stateOptions: ChipOption<string>[] = [
    { value: '', label: STATE_GROUP_LABEL.todos, count: counts.data?.ativas },
    ...GROUPS.map((g) => ({ value: g, label: STATE_GROUP_LABEL[g], count: counts.data?.[g] })),
  ]
  const sizeOptions: ChipOption<string>[] = [{ value: '', label: 'Todos' }, ...SIZE_FILTERS.map((z) => ({ value: z, label: z }))]

  const loading = !search.data
  const toGarment = (g: Garment) => href(`/acervo/${g.id}`)

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Acervo</h1>
          <p className="ac-sub">{subtitle}</p>
        </div>
        <div className="ac-actions">
          <div className="ac-seg" role="group" aria-label="Modo de exibição">
            {(['galeria', 'lista'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => chooseMode(m)}>
                {m === 'galeria' ? 'Galeria' : 'Lista'}
              </button>
            ))}
          </div>
          {can('acervo.create') && (
            <Button variant="primary" icon="plus" onClick={() => setParam('nova', '1')}>
              Nova peça
            </Button>
          )}
        </div>
      </header>

      <div className="ac-body">
        <section className="card ac-filters" aria-label="Filtros do acervo">
          <div className="ac-search-row">
            <SearchInput
              value={q}
              onChange={(v) => setParam('q', v.trim() || null, true)}
              label="Buscar peça"
              placeholder="Buscar por código, nome, cor ou tecido…"
            />
            <span className="ac-count" aria-live="polite">
              {search.data ? `${total} ${total === 1 ? 'resultado' : 'resultados'}` : ''}
            </span>
          </div>
          <div className="ac-chip-row">
            <span className="ac-chip-l" aria-hidden="true">
              Categoria
            </span>
            <Chips label="Categoria" options={catOptions} value={cat ?? ''} onChange={(v) => setParam('cat', v || null)} />
          </div>
          <div className="ac-chip-row">
            <span className="ac-chip-l" aria-hidden="true">
              Estado
            </span>
            <Chips label="Estado" options={stateOptions} value={st ?? ''} onChange={(v) => setParam('st', v || null)} />
          </div>
          <div className="ac-chip-row">
            <span className="ac-chip-l" aria-hidden="true">
              Tamanho
            </span>
            <Chips label="Tamanho" options={sizeOptions} value={size ?? ''} onChange={(v) => setParam('tam', v || null)} />
          </div>
        </section>

        {loading ? (
          <ul className="ac-gallery" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="gcard gc-skel">
                <span className="gc-ph" />
                <span className="gc-meta">
                  <i />
                  <i />
                  <i />
                </span>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <section className="card">
            <EmptyState title="Nenhuma peça encontrada" description="Ajuste os filtros ou cadastre uma nova peça." />
          </section>
        ) : mode === 'galeria' ? (
          <ul className="ac-gallery" aria-label="Peças do acervo">
            {items.map((g) => (
              <li key={g.id}>
                <GarmentCard garment={g} to={toGarment(g)} />
              </li>
            ))}
          </ul>
        ) : (
          <section className="card ac-table">
            <DataTable
              caption="Peças do acervo"
              columns={columns(canCost, econById, toGarment)}
              rows={items}
              rowKey={(g) => g.id}
              onRowClick={(g) => navigate(toGarment(g))}
            />
          </section>
        )}

        {items.length > 0 && items.length < total && (
          <div className="ac-more">
            <span className="muted tiny">
              Mostrando {items.length} de {total}
            </span>
            <Button onClick={() => setMore({ key: fkey, pages: pages + 1 })} disabled={search.isFetching}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function columns(canCost: boolean, econ: Map<string, GarmentEconomics>, to: (g: Garment) => string): Column<Garment>[] {
  const cols: Column<Garment>[] = [
    { key: 'code', header: 'Código', className: 'mono ac-td-code', render: (g) => g.code },
    {
      key: 'name',
      header: 'Peça',
      render: (g) => (
        <span className="ac-td-name">
          <Link to={to(g)} onClick={(e) => e.stopPropagation()}>
            {g.name}
          </Link>
          <span className="muted tiny">{g.fabric}</span>
        </span>
      ),
    },
    {
      key: 'color',
      header: 'Cor',
      render: (g) => (
        <span className="ac-td-color">
          <i style={{ background: g.colorHex }} aria-hidden="true" />
          {g.colorPrimary}
        </span>
      ),
    },
    { key: 'size', header: 'Tam.', render: (g) => g.labelSize },
    {
      key: 'state',
      header: 'Estado',
      render: (g) => <Badge tone={GARMENT_STATE[g.state].tone}>{GARMENT_STATE[g.state].label}</Badge>,
    },
    { key: 'price', header: 'Locação', align: 'right', render: (g) => brl(g.rentalPrice, { cents: false }) },
  ]
  if (canCost) {
    cols.push(
      { key: 'revenue', header: 'Receita', align: 'right', render: (g) => (econ.has(g.id) ? brl(econ.get(g.id)!.revenue, { cents: false }) : '—') },
      {
        key: 'payback',
        header: 'Payback',
        align: 'right',
        render: (g) => {
          const e = econ.get(g.id)
          if (!e || e.payback == null) return '—'
          return <span className={e.paidBack ? 'ac-paid' : undefined}>{times(e.payback)}</span>
        },
      },
    )
  }
  return cols
}
