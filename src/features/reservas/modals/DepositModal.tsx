import { useState, type FormEvent } from 'react'
import { useReturnDeposit } from '@/data/hooks-reservas'
import { PAYMENT_METHOD } from '@/data/labels-ops'
import type { PaymentMethod, ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Field, Modal, useToast } from '@/ui'

/** Devolver caução: escolhe a forma da devolução (padrão PIX); estorna a caução retida, sem mexer no saldo. */
export function DepositModal({ r, onClose }: { r: ReservationDetail; onClose(): void }) {
  const refund = useReturnDeposit(r.id)
  const toast = useToast()
  const [method, setMethod] = useState<PaymentMethod>('pix')

  function submit(e: FormEvent) {
    e.preventDefault()
    refund.mutate(method, {
      onSuccess: () => {
        toast({ title: 'Caução devolvida', description: `${r.code} · estorno de ${brl(r.balance.caucao)} lançado.` })
        onClose()
      },
      onError: (err) => toast({ title: 'Não foi possível devolver a caução', description: errorMessage(err), tone: 'error' }),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Devolver caução"
      description={`${r.code} · caução retida ${brl(r.balance.caucao)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rd-deposit" disabled={refund.isPending}>
            Devolver caução
          </Button>
        </>
      }
    >
      <form id="rd-deposit" className="rd-form" onSubmit={submit}>
        <Field as="select" label="Forma da devolução" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {Object.entries(PAYMENT_METHOD).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Field>
      </form>
    </Modal>
  )
}
