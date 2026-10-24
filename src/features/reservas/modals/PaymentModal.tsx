import { useState, type FormEvent } from 'react'
import { useRegisterPayment } from '@/data/hooks-reservas'
import { PAYMENT_KIND, PAYMENT_METHOD } from '@/data/labels-ops'
import { SourceError, type PaymentKind, type PaymentMethod, type ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Field, Icon, Modal, useToast } from '@/ui'
import { numOrNull } from '../../acervo/formErrors'

const HINT: Record<PaymentKind, string> = {
  sinal: 'Entrada paga na reserva. Abate o valor devido.',
  saldo: 'Restante do valor da locação.',
  integral: 'Pagamento único do total.',
  caucao: 'Garantia retida. NÃO abate o valor devido e deve ser devolvida na finalização.',
  multa: 'Cobrança por atraso ou dano.',
  estorno: 'Devolução de valor à cliente — inclusive da caução.',
}

export type PaymentModalProps = { r: ReservationDetail; initial?: { kind: PaymentKind; amount: number; fromDeposit?: boolean }; onClose(): void }

/** Lançar pagamento (spec §3.4). O valor acompanha o tipo (saldo, caução sugerida, estorno). */
export function PaymentModal({ r, initial, onClose }: PaymentModalProps) {
  const pay = useRegisterPayment(r.id)
  const toast = useToast()
  const b = r.balance
  const [kind, setKind] = useState<PaymentKind>(initial?.kind ?? (b.pago > 0 ? 'saldo' : 'sinal'))
  const [fromDeposit, setFromDeposit] = useState(initial?.fromDeposit ?? b.caucao > 0)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [amount, setAmount] = useState((initial?.amount ?? b.due).toFixed(2))
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | undefined>()

  const suggest = (k: PaymentKind, dep: boolean) => (k === 'caucao' ? r.depositSuggested : k === 'estorno' ? (dep && b.caucao > 0 ? b.caucao : b.pago) : b.due)
  function pickKind(k: PaymentKind) {
    setKind(k)
    setAmount(suggest(k, fromDeposit).toFixed(2))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = numOrNull(amount)
    if (value == null || !Number.isFinite(value) || value <= 0) return setError(errorMessage('VALOR_INVALIDO'))
    setError(undefined)
    const refersTo = kind === 'estorno' && fromDeposit && b.caucao > 0 ? 'caucao' : null
    pay.mutate(
      { kind, method, amount: value, reference: reference.trim() || null, notes: notes.trim() || null, refersTo },
      {
        onSuccess: (res) => {
          const left = res.balance.due
          const title = kind === 'caucao' ? `Caução de ${brl(value)} retida.` : kind === 'estorno' ? `Estorno de ${brl(value)} registrado.` : left > 0.005 ? `Ainda faltam ${brl(left)}.` : 'Reserva quitada.'
          toast({ title: 'Pagamento lançado', description: title })
          onClose()
        },
        onError: (err) => {
          const msg = err instanceof SourceError && err.code === 'VALOR_EXCEDE_SALDO' && err.hint ? `O valor excede o saldo em aberto (${err.hint}).` : errorMessage(err)
          setError(msg)
          toast({ title: 'Revise o lançamento', description: msg, tone: 'error' })
        },
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Lançar pagamento"
      description={`${r.code} · saldo ${brl(b.due)}${b.caucao > 0 ? ` · caução retida ${brl(b.caucao)}` : ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rd-pay" disabled={pay.isPending}>
            Lançar pagamento
          </Button>
        </>
      }
    >
      <form id="rd-pay" className="rd-form" onSubmit={submit} noValidate>
        <div className="rd-grid">
          <Field as="select" label="Tipo" value={kind} onChange={(e) => pickKind(e.target.value as PaymentKind)} hint={HINT[kind]}>
            {Object.entries(PAYMENT_KIND).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Field>
          <Field as="select" label="Forma" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Field>
          {kind === 'estorno' && b.caucao > 0 && (
            <Field
              as="select"
              label="Estornar de"
              value={fromDeposit ? 'caucao' : 'receita'}
              onChange={(e) => {
                const dep = e.target.value === 'caucao'
                setFromDeposit(dep)
                setAmount(suggest('estorno', dep).toFixed(2))
              }}
            >
              <option value="caucao">Caução retida</option>
              <option value="receita">Valor pago</option>
            </Field>
          )}
          <Field label="Valor (R$)" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={error} />
          <Field label="Referência" placeholder="E2E do PIX, NSU, link" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Field label="Observação" placeholder="Sinal recebido na prova" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {r.depositSuggested > 0 && <p className="tiny muted">Caução sugerida para esta peça: {brl(r.depositSuggested)} — facultativa.</p>}
        <p className="note info">
          <Icon name="moeda" size={14} />
          <span>Uma reserva aceita vários lançamentos: sinal, saldo, caução, multa e estorno convivem. A caução não abate o valor devido — ela é retida e devolvida no fim.</span>
        </p>
      </form>
    </Modal>
  )
}
