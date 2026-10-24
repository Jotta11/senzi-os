import { useState, type FormEvent } from 'react'
import { useReceiveReceivable } from '@/data/hooks-financeiro'
import type { PaymentMethod, Receivable } from '@/data/types'
import { SourceError } from '@/data/types'
import { falta } from '@/domain/finance'
import { brl } from '@/lib/format'
import { Button, Field, Modal, useToast } from '@/ui'
import { NO_ERRORS, numOrNull, sourceErrors, type FormErrors } from '../../acervo/formErrors'
import { MethodField, TopError } from './formKit'
import '../financeiro.css'

const FIELDS = ['amount', 'receivedAt'] as const
const ID = 'fx-receive'

/** Baixa de conta a receber avulsa (parcial permitido) — spec §2.3.3. */
export function ReceiveModal({ today, receivable, onClose }: { today: string; receivable: Receivable; onClose(): void }) {
  const receive = useReceiveReceivable()
  const toast = useToast()
  const left = falta(receivable)
  const [amount, setAmount] = useState(left.toFixed(2))
  const [receivedAt, setReceivedAt] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await receive.mutateAsync({ id: receivable.id, input: { amount: numOrNull(amount) ?? Number.NaN, receivedAt, method, notes: notes.trim() || null } })
      toast({ title: 'Recebimento registrado', tone: 'ok' })
      onClose()
    } catch (err) {
      const e2 = sourceErrors(err, FIELDS)
      if (err instanceof SourceError && err.issues?.some((i) => i.code === 'VALOR_EXCEDE_SALDO')) e2.fields.amount = `O valor excede o que falta receber (${brl(left)}).`
      setErrors(e2)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Receber"
      description={`${receivable.description} · falta ${brl(left)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={ID} disabled={receive.isPending}>
            Confirmar recebimento
          </Button>
        </>
      }
    >
      <form id={ID} className="fx-form" onSubmit={submit} noValidate>
        <TopError message={errors.top} />
        <div className="fx-fields">
          <Field label="Valor recebido" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.fields.amount} />
          <Field label="Recebido em" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} error={errors.fields.receivedAt} />
          <MethodField value={method} onChange={setMethod} />
          <Field label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}
