import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDeletePayable, useFinCategories, usePayables } from '@/data/hooks-financeiro'
import { PAYABLE_STATUS, RECURRENCE } from '@/data/labels-ops'
import type { PayableFilter } from '@/data/source-financeiro'
import type { Payable } from '@/data/types'
import { payableStatus } from '@/domain/finance'
import { errorMessage } from '@/lib/errorMessages'
import { brl, dateBR } from '@/lib/format'
import { Badge, Button, Card, Chips, DataTable, EmptyState, Field, Icon, SearchInput, useToast, type Column } from '@/ui'
import '../acervo/acervo.css'
import { FinanceNav } from './FinanceNav'
import { ConfirmModal } from './modals/ConfirmModal'
import { PayableModal } from './modals/PayableModal'
import { PayModal } from './modals/PayModal'
import { brl0, usePeriod, type ListRange } from './period'
import { PeriodSeg } from './PeriodSeg'
import { Tiles } from './Tiles'
import './financeiro.css'

const STATUS = [
  { value: 'abertas', label: 'Em aberto' },
  { value: 'vencidas', label: 'Vencidas' },
  { value: 'pagas', label: 'Pagas' },
  { value: 'todas', label: 'Todas' },
] as const

type ModalState = { kind: 'new' } | { kind: 'edit' | 'pay' | 'delete'; row: Payable }

/**
 * Financeiro · Contas a Pagar (spec §2.2.3, `financeiro.geral`). Despesas automáticas (Operação e aquisição)
 * são somente leitura: só podem ser pagas; editar e excluir ficam de fora.
 */
export function PayablesPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = usePeriod<ListRange>(true)
  const status = (STATUS.find((s) => s.value === params.get('status'))?.value ?? 'abertas') as PayableFilter['status']
  const recurrence = (['unica', 'recorrente'].includes(params.get('recorrencia') ?? '') ? params.get('recorrencia') : 'todas') as PayableFilter['recurrence']
  const categoryId = params.get('categoria') || null
  const q = params.get('q') ?? ''
  const setParam = (k: string, v: string | null) =>
    setParams((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })

  const list = usePayables({ status, categoryId, recurrence, q, range })
  const all = usePayables({ status: 'todas', categoryId: null, recurrence: 'todas', q: '', range: 'tudo' })
  const cats = useFinCategories()
  const del = useDeletePayable()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [delError, setDelError] = useState<string | null>(null)
  const d = list.data
  const today = d?.today ?? ''
  const rows = d?.rows ?? []
  const suppliers = useMemo(() => [...new Set((all.data?.rows ?? []).map((p) => p.supplier).filter((s): s is string => !!s))].sort(), [all.data])
  const catName = (id: string) => (cats.data ?? []).find((c) => c.id === id)?.name ?? '—'

  const columns: Column<Payable>[] = [
    { key: 'venc', header: 'Vencimento', className: 'mono', render: (p) => <span className={payableStatus(p, today) === 'vencida' ? 'fx-late' : undefined}>{dateBR(p.dueDate)}</span> },
    {
      key: 'desc',
      header: 'Descrição',
      render: (p) => (
        <>
          {p.recurrence !== 'nenhuma' && <Icon name="refresh" size={12} />} {p.description}{' '}
          {p.source !== 'manual' && <Badge tone="stone" dot={false}>Automática</Badge>}
          {(p.supplier || p.garmentId) && <span className="fx-sub-t">{[p.supplier, p.recurrence !== 'nenhuma' ? RECURRENCE[p.recurrence] : null].filter(Boolean).join(' · ')}</span>}
        </>
      ),
    },
    { key: 'cat', header: 'Categoria', render: (p) => catName(p.categoryId) },
    { key: 'val', header: 'Valor', align: 'right', className: 'fx-money', render: (p) => <b>{brl(p.amount)}</b> },
    {
      key: 'st',
      header: 'Status',
      render: (p) => {
        const s = PAYABLE_STATUS[payableStatus(p, today)]
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
    },
    { key: 'pago', header: 'Pago em', className: 'mono', render: (p) => (p.paidAt ? dateBR(p.paidAt) : '—') },
    {
      key: 'acoes',
      header: <span className="sr-only">Ações</span>,
      align: 'right',
      render: (p) => {
        const nm = (a: string) => `${a} · ${p.description}`
        return (
          <div className="fx-row-act">
            {p.status === 'aberta' && <Button size="sm" variant="primary" aria-label={nm('Pagar')} onClick={() => setModal({ kind: 'pay', row: p })}>Pagar</Button>}
            {p.source === 'manual' && p.status === 'aberta' && <Button size="sm" aria-label={nm('Editar')} onClick={() => setModal({ kind: 'edit', row: p })}>Editar</Button>}
            {p.source === 'manual' && <Button size="sm" aria-label={nm('Excluir')} onClick={() => { setDelError(null); setModal({ kind: 'delete', row: p }) }}>Excluir</Button>}
          </div>
        )
      },
    },
  ]

  async function confirmDelete(row: Payable) {
    try {
      await del.mutateAsync(row.id)
      toast({ title: 'Despesa excluída', tone: 'ok' })
      setModal(null)
    } catch (err) {
      setDelError(errorMessage(err))
    }
  }

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Contas a Pagar</h1>
          <p className="ac-sub">{d ? `${brl0(d.totals.open)} em aberto · ${brl0(d.totals.overdue)} vencido` : 'Carregando…'}</p>
        </div>
        <div className="ac-actions">
          <PeriodSeg value={range} onChange={setRange} allowAll />
          <Button variant="primary" icon="plus" onClick={() => setModal({ kind: 'new' })}>Nova despesa</Button>
        </div>
      </header>
      <FinanceNav />
      <div className="ac-body">
        {d && (
          <Tiles
            label="Resumo das contas a pagar"
            tiles={[
              { label: 'A pagar', value: brl0(d.totals.open), desc: 'em aberto' },
              { label: 'Vencido', value: brl0(d.totals.overdue), desc: 'contas vencidas', tone: d.totals.overdue > 0 ? 'alert' : undefined },
              { label: 'Vence em 7 dias', value: brl0(d.totals.dueIn7), desc: 'próximos 7 dias' },
              { label: 'Pago no período', value: brl0(d.totals.paidInRange), desc: 'regime de caixa' },
            ]}
          />
        )}
        <Card className="fx-card-flush">
          <div className="fx-filters">
            <Chips label="Situação" options={STATUS.map((s) => ({ value: s.value, label: s.label }))} value={status} onChange={(v) => setParam('status', v === 'abertas' ? null : v)} />
            <div className="fx-filter-row">
              <Field as="select" label="Categoria" value={categoryId ?? ''} onChange={(e) => setParam('categoria', e.target.value || null)}>
                <option value="">Todas</option>
                {(cats.data ?? []).filter((c) => c.type === 'despesa').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Field>
              <Field as="select" label="Recorrência" value={recurrence} onChange={(e) => setParam('recorrencia', e.target.value === 'todas' ? null : e.target.value)}>
                <option value="todas">Todas</option>
                <option value="unica">Única</option>
                <option value="recorrente">Recorrente</option>
              </Field>
              <SearchInput label="Buscar por descrição ou fornecedor" value={q} onChange={(v) => setParam('q', v || null)} placeholder="Buscar por descrição ou fornecedor" />
            </div>
          </div>
          <DataTable
            caption="Contas a pagar"
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            empty={<EmptyState icon="moeda" title="Nenhuma despesa" description="Lance a primeira despesa da Senzi para acompanhar o que vence." />}
          />
          {rows.length > 0 && (
            <p className="fx-foot">
              <span>Total conforme filtros</span>
              <span>Valor <b>{brl(rows.reduce((s, p) => s + p.amount, 0))}</b></span>
            </p>
          )}
        </Card>
      </div>
      {modal?.kind === 'new' && <PayableModal today={today} suppliers={suppliers} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <PayableModal today={today} payable={modal.row} suppliers={suppliers} onClose={() => setModal(null)} />}
      {modal?.kind === 'pay' && <PayModal today={today} payable={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'delete' && (
        <ConfirmModal
          title="Excluir despesa"
          message={`Excluir "${modal.row.description}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          pending={del.isPending}
          error={delError}
          onConfirm={() => void confirmDelete(modal.row)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
