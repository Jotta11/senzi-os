/** Categorias financeiras em memória (spec §2.3.6): nome único por tipo, sistema intocável, excluir só sem uso. */
import { reservationReceivables } from '@/domain/finance'
import { normalize } from '@/lib/format'
import { FIN_CAT } from '../fixture/finance'
import type { FinanceiroSource } from '../source-financeiro'
import { SourceError, type FinCategory } from '../types'
import type { MockCtx } from './context'

type Categorias = Pick<FinanceiroSource, 'listFinCategories' | 'createFinCategory' | 'updateFinCategory' | 'archiveFinCategory' | 'deleteFinCategory'>

const PALETTE = ['#7A2E3A', '#5E6B3C', '#1D4E63', '#B4633F', '#A98BC4', '#C9A961', '#3C3F46', '#C98A99']

export function financeiroCategorias(ctx: MockCtx): Categorias {
  const { db, run, fail } = ctx
  const find = (id: string): FinCategory => {
    const c = db.finCategories.find((x) => x.id === id)
    if (!c) throw new SourceError('NAO_ENCONTRADO')
    return c
  }
  const usage = (id: string): number =>
    db.payables.filter((p) => p.categoryId === id).length +
    db.receivables.filter((r) => r.categoryId === id).length +
    (id === FIN_CAT.locacao ? reservationReceivables(db).length : 0)
  const duplicated = (name: string, type: FinCategory['type'], ignore?: string) =>
    db.finCategories.some((c) => c.id !== ignore && c.type === type && normalize(c.name) === normalize(name))
  const notSystem = (c: FinCategory) => {
    if (c.isSystem) throw new SourceError('CATEGORIA_SISTEMA')
  }

  return {
    listFinCategories: () => run(() => db.finCategories.map((c) => ({ ...c, usageCount: usage(c.id) }))),

    createFinCategory: (i) =>
      run(() => {
        if (!i.name?.trim()) fail([{ code: 'NOME_CATEGORIA_OBRIGATORIO', field: 'name' }])
        if (duplicated(i.name, i.type)) fail([{ code: 'CATEGORIA_DUPLICADA', field: 'name' }])
        const c: FinCategory = { id: ctx.newId('fc'), name: i.name.trim(), type: i.type, color: i.color ?? PALETTE[db.finCategories.length % PALETTE.length]!, isSystem: false, archived: false }
        db.finCategories.push(c)
        return c
      }),

    updateFinCategory: (id, i) =>
      run(() => {
        const c = find(id)
        notSystem(c)
        const name = i.name ?? c.name
        const type = i.type ?? c.type
        if (!name.trim()) fail([{ code: 'NOME_CATEGORIA_OBRIGATORIO', field: 'name' }])
        if (type !== c.type && usage(id) > 0) fail([{ code: 'CATEGORIA_EM_USO', field: 'type' }])
        if (duplicated(name, type, id)) fail([{ code: 'CATEGORIA_DUPLICADA', field: 'name' }])
        Object.assign(c, { name: name.trim(), type, color: i.color ?? c.color })
        return c
      }),

    archiveFinCategory: (id, archived = true) =>
      run(() => {
        const c = find(id)
        notSystem(c)
        c.archived = archived
        return c
      }),

    deleteFinCategory: (id) =>
      run(() => {
        const c = find(id)
        notSystem(c)
        if (usage(id) > 0) throw new SourceError('CATEGORIA_EM_USO')
        db.finCategories.splice(db.finCategories.indexOf(c), 1)
      }),
  }
}
