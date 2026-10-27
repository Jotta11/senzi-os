import { useState, type FormEvent } from 'react'
import { useReturnDeposit } from '@/data/hooks-reservas'
import { PAYMENT_METHOD } from '@/data/labels-ops'
import type { PaymentMethod, ReservationDetail } from '@/data/types'
import { round2 } from '@/domain/money'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Field, Modal, useToast } from '@/ui'

/**
 * Devolver caução: escolhe a forma da devolução (padrão PIX) e, se a inspeção achou dano, quanto a loja retém e por quê.
 * A parte devolvida é estornada; a retida sai da custódia e vira receita. Não mexe no saldo da locação.
 */
export function DepositModal({ r, onClose }: { r: ReservationDetail; onClose(): void }) {
  const refund = useReturnDeposit(r.id)
  const toast = useToast()
  const held = r.balance.caucao
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [retainText, setRetainText] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({})

  const kept = retainText.trim() === '' ? 0 : Number(retainText.replace(',', '.'))
  const back = Number.isFinite(kept) ? Math.max(0, round2(held - kept)) : held

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!Number.isFinite(kept) || kept < 0) next.amount = errorMessage('VALOR_INVALIDO')
    else if (kept > held + 0.005) next.amount = `O valor retido não pode passar da caução (${brl(held)}).`
    if (kept > 0 && !reason.trim()) next.reason = 'Diga por que a loja vai reter parte da caução.'
    setErrors(next)
    if (next.amount || next.reason) return
    refund.mutate(
      { method, retain: kept > 0 ? { amount: kept, reason } : undefined },
      {
        onSuccess: () => {
          toast({
            title: kept > 0 ? 'Caução acertada' : 'Caução devolvida',
            description: kept > 0 ? `${r.code} · ${brl(back)} devolvidos, ${brl(kept)} retidos como receita.` : `${r.code} · estorno de ${brl(held)} lançado.`,
          })
          onClose()
        },
        onError: (err) => toast({ title: 'Não foi possível devolver a caução', description: errorMessage(err), tone: 'error' }),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Devolver caução"
      description={`${r.code} · caução retida ${brl(held)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rd-deposit" disabled={refund.isPending}>
            {kept > 0 && back === 0 ? 'Reter caução' : 'Devolver caução'}
          </Button>
        </>
      }
    >
      <form id="rd-deposit" className="rd-form" onSubmit={submit}>
        <Field
          label="Valor retido pela loja (R$)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="0,00"
          value={retainText}
          onChange={(e) => setRetainText(e.target.value)}
          hint="Só se a inspeção achou dano ou perda. Deixe em branco para devolver tudo."
          error={errors.amount}
        />
        {kept > 0 && (
          <Field as="textarea" label="Motivo da retenção" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        )}
        {back > 0 && (
          <Field as="select" label="Forma da devolução" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Field>
        )}
        <p className="tiny muted">
          Volta para a cliente: <b>{brl(back)}</b>
          {kept > 0 && Number.isFinite(kept) ? ` · fica com a loja: ${brl(Math.min(kept, held))}` : ''}
        </p>
      </form>
    </Modal>
  )
}
