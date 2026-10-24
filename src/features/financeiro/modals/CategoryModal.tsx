import { useState, type FormEvent } from 'react'
import { useCreateFinCategory, useUpdateFinCategory } from '@/data/hooks-financeiro'
import type { FinCategory, FinCategoryType } from '@/data/types'
import { Button, Field, Modal, useToast } from '@/ui'
import { NO_ERRORS, sourceErrors, type FormErrors } from '../../acervo/formErrors'
import { CATEGORY_COLORS } from './categoryColors'
import { TopError } from './formKit'
import '../financeiro.css'

const FIELDS = ['name', 'type'] as const
const ID = 'fx-cat-form'

export type CategoryModalProps = { category?: FinCategory & { usageCount?: number }; defaultType?: FinCategoryType; onClose(): void }

/** "Nova categoria" / "Editar categoria" (spec §2.3.6). O tipo trava depois de haver lançamentos. */
export function CategoryModal({ category, defaultType = 'despesa', onClose }: CategoryModalProps) {
  const editing = !!category
  const create = useCreateFinCategory()
  const update = useUpdateFinCategory()
  const toast = useToast()
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<FinCategoryType>(category?.type ?? defaultType)
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]!)
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const typeLocked = editing && (category.usageCount ?? 0) > 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      if (category) await update.mutateAsync({ id: category.id, input: { name, color, ...(typeLocked ? {} : { type }) } })
      else await create.mutateAsync({ name, type, color })
      toast({ title: 'Categoria salva', tone: 'ok' })
      onClose()
    } catch (err) {
      setErrors(sourceErrors(err, FIELDS))
    }
  }

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={editing ? 'Editar categoria' : 'Nova categoria'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={ID} disabled={create.isPending || update.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={ID} className="fx-form" onSubmit={submit} noValidate>
        <TopError message={errors.top} />
        <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.fields.name} />
        <fieldset className="fx-radios">
          <legend>Tipo</legend>
          {(['receita', 'despesa'] as const).map((t) => (
            <label key={t} className="fx-chk">
              <input type="radio" name="fx-cat-type" checked={type === t} disabled={typeLocked} onChange={() => setType(t)} />
              {t === 'receita' ? 'Receita' : 'Despesa'}
            </label>
          ))}
        </fieldset>
        <fieldset className="fx-swatches">
          <legend>Cor</legend>
          {CATEGORY_COLORS.map((c) => (
            <label key={c}>
              <input type="radio" name="fx-cat-color" aria-label={`Cor ${c}`} checked={color === c} onChange={() => setColor(c)} />
              <span style={{ background: c }} />
            </label>
          ))}
        </fieldset>
      </form>
    </Modal>
  )
}
