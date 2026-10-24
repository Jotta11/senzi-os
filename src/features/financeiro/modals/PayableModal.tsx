import { useState, type FormEvent } from 'react'
import { useCreatePayable, useFinCategories, useUpdatePayable } from '@/data/hooks-financeiro'
import { RECURRENCE } from '@/data/labels-ops'
import type { Payable, PaymentMethod, Recurrence } from '@/data/types'
import { Button, Field, Modal, useToast } from '@/ui'
import { NO_ERRORS, numOrNull, sourceErrors, type FormErrors } from '../../acervo/formErrors'
import { fixAmountMessage } from './amountMessage'
import { MethodField, TopError } from './formKit'
import '../financeiro.css'

const FIELDS = ['description', 'categoryId', 'amount', 'dueDate', 'recurrenceEnd', 'paidAt'] as const
const ID = 'fx-payable'

export type PayableModalProps = { today: string; payable?: Payable; suppliers: string[]; onClose(): void }

/** "Nova despesa" / "Editar despesa" (spec §2.3.4): recorrência opcional e "Já paga". */
export function PayableModal({ today, payable, suppliers, onClose }: PayableModalProps) {
  const editing = !!payable
  const cats = useFinCategories()
  const create = useCreatePayable()
  const update = useUpdatePayable()
  const toast = useToast()
  const [description, setDescription] = useState(payable?.description ?? '')
  const [supplier, setSupplier] = useState(payable?.supplier ?? '')
  const [categoryId, setCategoryId] = useState(payable?.categoryId ?? '')
  const [amount, setAmount] = useState(payable ? String(payable.amount) : '')
  const [dueDate, setDueDate] = useState(payable?.dueDate ?? today)
  const [recurrence, setRecurrence] = useState<Recurrence>(payable?.recurrence ?? 'nenhuma')
  const [recurrenceEnd, setRecurrenceEnd] = useState(payable?.recurrenceEnd ?? '')
  const [paid, setPaid] = useState(false)
  const [paidAt, setPaidAt] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [notes, setNotes] = useState(payable?.notes ?? '')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)

  const options = (cats.data ?? []).filter((c) => c.type === 'despesa' && !c.archived)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const input = {
      description,
      supplier: supplier.trim() || null,
      categoryId,
      amount: numOrNull(amount) ?? Number.NaN,
      dueDate,
      recurrence,
      recurrenceEnd: recurrence !== 'nenhuma' && recurrenceEnd ? recurrenceEnd : null,
      notes: notes.trim() || null,
    }
    try {
      if (payable) await update.mutateAsync({ id: payable.id, input })
      else await create.mutateAsync({ ...input, ...(paid ? { paid: true, paidAt, method } : {}) })
      toast({ title: 'Despesa salva', tone: 'ok' })
      onClose()
    } catch (err) {
      setErrors(fixAmountMessage(sourceErrors(err, FIELDS), ['amount', 'paidAmount']))
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={editing ? 'Editar despesa' : 'Nova despesa'}
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
        <div className="fx-fields">
          <div className="full">
            <Field label="Descrição" placeholder="Aluguel da loja, conta de luz…" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.fields.description} />
          </div>
          <div>
            <Field label="Fornecedor" list="fx-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <datalist id="fx-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <Field as="select" label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.fields.categoryId}>
            <option value="">Selecione…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Field>
          <Field label="Valor (R$)" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.fields.amount} />
          <Field label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.fields.dueDate} />
          <Field as="select" label="Recorrência" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            {(Object.keys(RECURRENCE) as Recurrence[]).map((k) => (
              <option key={k} value={k}>
                {RECURRENCE[k]}
              </option>
            ))}
          </Field>
          {recurrence !== 'nenhuma' && (
            <Field label="Repetir até" type="date" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} error={errors.fields.recurrenceEnd} hint="Vazio = sem data final." />
          )}
          {!editing && (
            <label className="fx-chk full">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Já paga
            </label>
          )}
          {paid && !editing && (
            <>
              <Field label="Pago em" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} error={errors.fields.paidAt} />
              <MethodField value={method} onChange={setMethod} />
            </>
          )}
          <div className="full">
            <Field label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  )
}
