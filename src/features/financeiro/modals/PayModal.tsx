import { useState, type FormEvent } from 'react'
import { usePayPayable } from '@/data/hooks-financeiro'
import type { Payable, PaymentMethod } from '@/data/types'
import { brl } from '@/lib/format'
import { Button, Field, Modal, useToast } from '@/ui'
import { NO_ERRORS, numOrNull, sourceErrors, type FormErrors } from '../../acervo/formErrors'
import { fixAmountMessage } from './amountMessage'
import { MethodField, TopError } from './formKit'
import '../financeiro.css'

const FIELDS = ['paidAmount', 'paidAt'] as const
const ID = 'fx-pay'

/** Baixa de conta a pagar: só integral; o valor pode ser ajustado para juros ou desconto (spec §2.3.5). */
export function PayModal({ today, payable, onClose }: { today: string; payable: Payable; onClose(): void }) {
  const pay = usePayPayable()
  const toast = useToast()
  const [paidAmount, setPaidAmount] = useState(payable.amount.toFixed(2))
  const [paidAt, setPaidAt] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await pay.mutateAsync({ id: payable.id, input: { paidAmount: numOrNull(paidAmount) ?? Number.NaN, paidAt, method, notes: notes.trim() || null } })
      toast({ title: 'Pagamento registrado', tone: 'ok' })
      onClose()
    } catch (err) {
      setErrors(fixAmountMessage(sourceErrors(err, FIELDS), ['amount', 'paidAmount']))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Pagar"
      description={`${payable.description} · ${brl(payable.amount)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={ID} disabled={pay.isPending}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <form id={ID} className="fx-form" onSubmit={submit} noValidate>
        <TopError message={errors.top} />
        <div className="fx-fields">
          <Field label="Valor pago" type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} error={errors.fields.paidAmount} hint="Pagamento integral. Ajuste só para juros ou desconto." />
          <Field label="Pago em" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} error={errors.fields.paidAt} />
          <MethodField value={method} onChange={setMethod} />
          <Field label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}
