import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCustomers } from '@/data/hooks'
import type { Customer, CustomerSort } from '@/data/types'
import { brl, dateBR, maskPhone } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, DataTable, EmptyState, SearchInput, type Column } from '@/ui'
import { CustomerForm } from './CustomerForm'
import '../acervo/acervo.css'
import './clientes.css'

export const PAGE_SIZE = 30

const SORTS: [CustomerSort, string][] = [
  ['nome', 'A–Z'],
  ['gasto', 'Maior gasto'],
  ['locacoes', 'Mais locações'],
  ['recentes', 'Mais recentes'],
]
const isSort = (v: string | null): v is CustomerSort => SORTS.some(([k]) => k === v)

/** Iniciais do primeiro e do último nome ("Mariana Fontes Ribeiro" → "MR"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0]![0]!
  const last = parts.length > 1 ? parts.at(-1)![0]! : ''
  return (first + last).toLocaleUpperCase('pt-BR')
}

/**
 * Clientes — lista (protótipo `UI.VIEWS.clientes` + `UI.customerRow`). Busca e ordenação na URL
 * (`?q=&ordem=`), 30 por página com "Carregar mais". Total gasto e Ticket só com `financeiro.view`.
 * "Nova cliente" (`cliente.create`) põe `?nova=1` na URL (com `&ideal=<peça>` já abre com o modelo ideal);
 * cadastrar navega para a ficha.
 */
export function ClientesListPage() {
  const { can } = usePermissions()
  const canMoney = can('financeiro.view')
  const href = useAppHref()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const ordemRaw = params.get('ordem')
  const sort: CustomerSort = isSort(ordemRaw) ? ordemRaw : 'nome'

  const fkey = `${q}|${sort}`
  const [more, setMore] = useState({ key: fkey, pages: 1 })
  const pages = more.key === fkey ? more.pages : 1

  const search = useCustomers(q, sort, { limit: PAGE_SIZE * pages, offset: 0 })
  const all = useCustomers('', 'nome', { limit: 1, offset: 0 })
  const items = useMemo(() => search.data?.items ?? [], [search.data])
  const total = search.data?.total ?? 0
  const registered = all.data?.total

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

  function closeForm() {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('nova')
      next.delete('ideal')
      return next
    })
  }

  const creating = params.get('nova') === '1' && can('cliente.create')
  const toCustomer = (c: Customer) => href(`/clientes/${c.id}`)

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Clientes</h1>
          <p className="ac-sub">{registered != null ? `${registered} cadastradas` : ' '}</p>
        </div>
        <div className="ac-actions">
          {can('cliente.create') && (
            <Button variant="primary" icon="plus" onClick={() => setParam('nova', '1')}>
              Nova cliente
            </Button>
          )}
        </div>
      </header>

      <div className="ac-body">
        <section className="card ac-filters" aria-label="Busca de clientes">
          <div className="ac-search-row cl-search-row">
            <SearchInput
              value={q}
              onChange={(v) => setParam('q', v.trim() || null, true)}
              label="Buscar cliente"
              placeholder="Nome, telefone, Instagram, CPF ou código…"
            />
            <div className="ac-seg" role="group" aria-label="Ordenar por">
              {SORTS.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={sort === k} onClick={() => setParam('ordem', k === 'nome' ? null : k, true)}>
                  {l}
                </button>
              ))}
            </div>
            <span className="ac-count" aria-live="polite">
              {search.data ? `${total} ${total === 1 ? 'resultado' : 'resultados'}` : ''}
            </span>
          </div>
        </section>

        {!search.data ? (
          <section className="card cl-skel" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i}>
                <i />
                <b />
                <b />
              </span>
            ))}
          </section>
        ) : items.length === 0 ? (
          <section className="card">
            <EmptyState title="Nenhuma cliente encontrada" description="Ajuste a busca ou cadastre uma nova cliente." />
          </section>
        ) : (
          <section className="card ac-table">
            <DataTable caption="Clientes" columns={columns(canMoney, toCustomer)} rows={items} rowKey={(c) => c.id} onRowClick={(c) => navigate(toCustomer(c))} />
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

      <CustomerForm open={creating} onClose={closeForm} initialIdealGarmentId={params.get('ideal')} onCreated={(c) => navigate(toCustomer(c))} />
    </div>
  )
}

function columns(canMoney: boolean, to: (c: Customer) => string): Column<Customer>[] {
  const cols: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: (c) => (
        <span className="cl-who">
          <span className="cl-avatar" aria-hidden="true">
            {initials(c.fullName)}
          </span>
          <span className="cl-who-t">
            <span className="cl-who-l">
              <Link className="cl-name" to={to(c)} onClick={(e) => e.stopPropagation()}>
                {c.fullName}
              </Link>
              {c.vip && <Badge tone="wine">VIP</Badge>}
            </span>
            <span className="mono cl-code">{c.code}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contato',
      render: (c) => (
        <span className="cl-two">
          <span className="cl-phone">{maskPhone(c.phone) || '—'}</span>
          {c.instagram && <span className="muted tiny">{c.instagram}</span>}
        </span>
      ),
    },
    {
      key: 'city',
      header: 'Cidade',
      render: (c) =>
        c.city ? (
          <span className="cl-city">
            {c.city}
            {c.state && <span className="muted"> · {c.state}</span>}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'rentals', header: 'Locações', align: 'right', render: (c) => c.stats.rentals },
  ]
  if (canMoney) {
    cols.push(
      { key: 'spent', header: 'Total gasto', align: 'right', render: (c) => brl(c.stats.spent, { cents: false }) },
      {
        key: 'ticket',
        header: 'Ticket',
        align: 'right',
        render: (c) => (c.stats.rentals ? brl(c.stats.spent / c.stats.rentals, { cents: false }) : <span className="muted">—</span>),
      },
    )
  }
  cols.push({
    key: 'next',
    header: 'Próximo evento',
    render: (c) => (c.stats.nextEvent ? <span className="cl-next">{dateBR(c.stats.nextEvent)}</span> : <span className="muted">—</span>),
  })
  return cols
}
