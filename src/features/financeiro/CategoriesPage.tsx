import { useState } from 'react'
import { useArchiveFinCategory, useDeleteFinCategory, useFinCategories } from '@/data/hooks-financeiro'
import type { FinCategory, FinCategoryType } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Badge, Button, Card, EmptyState, useToast } from '@/ui'
import '../acervo/acervo.css'
import { FinanceNav } from './FinanceNav'
import { CategoryModal } from './modals/CategoryModal'
import { ConfirmModal } from './modals/ConfirmModal'
import './financeiro.css'

type Cat = FinCategory & { usageCount: number }
type ModalState = { kind: 'new'; type: FinCategoryType } | { kind: 'edit' | 'archive' | 'delete'; row: Cat }

/**
 * Financeiro · Categorias (spec §2.2.4, `financeiro.geral`): receitas e despesas lado a lado. Categorias do
 * sistema não se alteram nem se excluem; as usadas só podem ser arquivadas, as sem uso podem ser excluídas.
 */
export function CategoriesPage() {
  const toast = useToast()
  const cats = useFinCategories()
  const archive = useArchiveFinCategory()
  const del = useDeleteFinCategory()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = cats.data ?? []

  async function run(action: () => Promise<unknown>, title: string) {
    try {
      await action()
      toast({ title, tone: 'ok' })
      setModal(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const section = (type: FinCategoryType, title: string) => {
    const rows = list.filter((c) => c.type === type)
    return (
      <Card title={title} aria-label={title} flush actions={<Button size="sm" icon="plus" onClick={() => setModal({ kind: 'new', type })}>{`Nova categoria de ${type}`}</Button>}>
        {rows.length === 0 ? (
          <EmptyState icon="tag" title="Nenhuma categoria" description="Crie categorias para classificar lançamentos." />
        ) : (
          rows.map((c) => (
            <div key={c.id} className={c.archived ? 'fx-cat archived' : 'fx-cat'}>
              <span className="fx-cat-dot" style={{ background: c.color }} aria-hidden="true" />
              <span className="fx-cat-n">{c.name}</span>
              {c.isSystem && <Badge tone="stone" dot={false}>Sistema</Badge>}
              {c.archived && <Badge tone="stone" dot={false}>Arquivada</Badge>}
              <span className="fx-cat-u">{c.usageCount} lançamento(s)</span>
              {!c.isSystem && (
                <div className="fx-row-act">
                  <Button size="sm" aria-label={`Editar ${c.name}`} onClick={() => setModal({ kind: 'edit', row: c })}>Editar</Button>
                  {c.archived ? (
                    <Button size="sm" aria-label={`Desarquivar ${c.name}`} onClick={() => void run(() => archive.mutateAsync({ id: c.id, archived: false }), 'Categoria desarquivada')}>Desarquivar</Button>
                  ) : (
                    <Button size="sm" aria-label={`Arquivar ${c.name}`} onClick={() => { setError(null); setModal({ kind: 'archive', row: c }) }}>Arquivar</Button>
                  )}
                  {c.usageCount === 0 && <Button size="sm" aria-label={`Excluir ${c.name}`} onClick={() => { setError(null); setModal({ kind: 'delete', row: c }) }}>Excluir</Button>}
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    )
  }

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Categorias</h1>
          <p className="ac-sub">{cats.data ? `${list.length} categoria(s)` : 'Carregando…'}</p>
        </div>
        <div className="ac-actions">
          <Button variant="primary" icon="plus" onClick={() => setModal({ kind: 'new', type: 'despesa' })}>Nova categoria</Button>
        </div>
      </header>
      <FinanceNav />
      <div className="ac-body">
        <div className="fx-grid2">
          {section('receita', 'Receitas')}
          {section('despesa', 'Despesas')}
        </div>
      </div>
      {modal?.kind === 'new' && <CategoryModal defaultType={modal.type} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <CategoryModal category={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'archive' && (
        <ConfirmModal
          title="Arquivar categoria"
          message="Ela deixa de aparecer nos formulários, mas os lançamentos antigos continuam classificados."
          confirmLabel="Arquivar"
          pending={archive.isPending}
          error={error}
          onConfirm={() => void run(() => archive.mutateAsync({ id: modal.row.id }), 'Categoria arquivada')}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'delete' && (
        <ConfirmModal
          title="Excluir categoria"
          message={`Excluir "${modal.row.name}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          pending={del.isPending}
          error={error}
          onConfirm={() => void run(() => del.mutateAsync(modal.row.id), 'Categoria excluída')}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
