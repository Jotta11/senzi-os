import { useState, type FormEvent } from 'react'
import { useCreateReceivable, useFinCategories, useUpdateReceivable } from '@/data/hooks-financeiro'
import type { Receivable } from '@/data/types'
import type { PaymentMethod } from '@/data/types'
import { Button, Field, Modal, useToast } from '@/ui'
import { CustomerPicker } from '../../agenda/CustomerPicker'
import { NO_ERRORS, numOrNull, sourceErrors, type FormErrors } from '../../acervo/formErrors'
import { fixAmountMessage } from './amountMessage'
import { MethodField, TopError } from './formKit'
import '../financeiro.css'

const FIELDS = ['description', 'categoryId', 'amount', 'dueDate', 'receivedAt'] as const
const ID = 'fx-rec'

export type ReceivableModalProps = { today: string; receivable?: Receivable; onClose(): void }

/** Conta a receber avulsa: "Novo lançamento" / "Editar lançamento" (spec §2.3.2). */
export function ReceivableModal({ today, receivable, onClose }: ReceivableModalProps) {
  const editing = !!receivable
  const cats = useFinCategories()
  const create = useCreateReceivable()
  const update = useUpdateReceivable()
  const toast = useToast()
  const [description, setDescription] = useState(receivable?.description ?? '')
  const [customerId, setCustomerId] = useState<string | null>(receivable?.customerId ?? null)
  const [payer, setPayer] = useState(receivable?.payerName ?? '')
  const [categoryId, setCategoryId] = useState(receivable?.categoryId ?? '')
  const [amount, setAmount] = useState(receivable ? String(receivable.amount) : '')
  const [dueDate, setDueDate] = useState(receivable?.dueDate ?? today)
  const [received, setReceived] = useState(false)
  const [receivedAt, setReceivedAt] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [notes, setNotes] = useState(receivable?.notes ?? '')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)

  const options = (cats.data ?? []).filter((c) => c.type === 'receita' && !c.archived)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const input = {
      description,
      customerId,
      payerName: customerId ? null : payer.trim() || null,
      categoryId,
      amount: numOrNull(amount) ?? Number.NaN,
      dueDate,
      notes: notes.trim() || null,
    }
    try {
      if (receivable) await update.mutateAsync({ id: receivable.id, input })
      else await create.mutateAsync({ ...input, ...(received ? { received: true, receivedAt, method } : {}) })
      toast({ title: 'Lançamento salvo', tone: 'ok' })
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
      title={editing ? 'Editar lançamento' : 'Novo lançamento'}
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
            <Field label="Descrição" placeholder="Venda de acessório, aluguel de espaço…" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.fields.description} />
          </div>
          <CustomerPicker label="Cliente (opcional)" value={customerId} onChange={setCustomerId} />
          {!customerId && <Field label="Pagador" placeholder="Nome de quem vai pagar" value={payer} onChange={(e) => setPayer(e.target.value)} />}
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
          {!editing && (
            <label className="fx-chk full">
              <input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} /> Já recebido
            </label>
          )}
          {received && !editing && (
            <>
              <Field label="Recebido em" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} error={errors.fields.receivedAt} />
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
