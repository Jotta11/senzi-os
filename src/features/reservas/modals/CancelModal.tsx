import { useState, type FormEvent } from 'react'
import { useCancelReservation, useMarkNoShow } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Field, Icon, Modal, useToast } from '@/ui'

export type CancelModalProps = { r: ReservationDetail; mode: 'cancel' | 'noshow'; onClose(): void; onRefund(): void; canRefund: boolean }

/** Cancelar reserva (motivo obrigatório; nota com a política quando já há pagamento) ou marcar no-show. */
export function CancelModal({ r, mode, onClose, onRefund, canRefund }: CancelModalProps) {
  const cancel = useCancelReservation(r.id)
  const noShow = useMarkNoShow(r.id)
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const received = r.balance.pago > 0
  const isCancel = mode === 'cancel'
  const busy = cancel.isPending || noShow.isPending

  function fail(err: unknown) {
    setError(errorMessage(err))
    toast({ title: isCancel ? 'Não foi possível cancelar' : 'Não foi possível marcar o no-show', description: errorMessage(err), tone: 'error' })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (isCancel) {
      if (!reason.trim()) return setError(errorMessage('MOTIVO_OBRIGATORIO'))
      cancel.mutate(reason.trim(), {
        onSuccess: () => {
          toast({ title: 'Reserva cancelada', description: `${r.code} · peças liberadas no calendário.` })
          onClose()
        },
        onError: fail,
      })
    } else {
      noShow.mutate(undefined, {
        onSuccess: () => {
          toast({ title: 'No-show registrado', description: `${r.code} · peças liberadas no calendário.` })
          onClose()
        },
        onError: fail,
      })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isCancel ? 'Cancelar reserva' : 'Marcar no-show'}
      description={`${r.code} · ${r.customer.fullName}`}
      footer={
        <>
          <Button onClick={onClose}>Voltar</Button>
          <Button variant="danger" type="submit" form="rd-cancel" disabled={busy}>
            {isCancel ? 'Cancelar reserva' : 'Marcar no-show'}
          </Button>
        </>
      }
    >
      <form id="rd-cancel" className="rd-form" onSubmit={submit} noValidate>
        {isCancel ? (
          <>
            <p>
              Cancelar <b>{r.code}</b>? As peças voltam ao acervo e o calendário é liberado imediatamente. Pagamentos já recebidos seguem lançados e devem ser estornados separadamente, conforme a política de cancelamento do contrato.
            </p>
            <Field as="textarea" label="Motivo do cancelamento" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={error} />
          </>
        ) : (
          <>
            <p>
              Marcar <b>{r.code}</b> como no-show? A cliente não compareceu para a retirada: as peças voltam ao acervo e o calendário é liberado.
            </p>
            {error && (
              <p className="note red" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {received && (
          <div className="note amber">
            <Icon name="alerta" size={14} />
            <span>
              Já foram recebidos {brl(r.balance.pago)}. {isCancel ? 'Política do contrato (cláusula 7): até 15 dias antes da retirada devolução integral; entre 14 e 7 dias, retenção de 30%; a menos de 7 dias, 50%.' : 'No não comparecimento a retenção é integral (cláusula 7.4).'}{' '}
              {canRefund && (
                <button type="button" className="rs-alt" onClick={onRefund}>
                  Lançar estorno
                </button>
              )}
            </span>
          </div>
        )}
      </form>
    </Modal>
  )
}
