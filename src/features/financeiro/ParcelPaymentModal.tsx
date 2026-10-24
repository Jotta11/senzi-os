import { useReservation } from '@/data/hooks-reservas'
import type { PaymentKind, Receivable } from '@/data/types'
import { falta } from '@/domain/finance'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Modal } from '@/ui'
import { PaymentModal } from '../reservas/modals/PaymentModal'

/** "Registrar pagamento" de uma parcela de reserva: abre o modal da reserva com tipo e valor da parcela (saldo→Saldo, multa→Multa por atraso). */
export function ParcelPaymentModal({ parcel, onClose }: { parcel: Receivable; onClose(): void }) {
  const q = useReservation(parcel.reservationId ?? undefined)
  if (!q.data)
    return (
      <Modal open size="sm" onClose={onClose} title="Registrar pagamento" footer={<Button onClick={onClose}>Fechar</Button>}>
        {q.isError ? <p role="alert">{errorMessage(q.error)}</p> : <p role="status">Carregando a reserva…</p>}
      </Modal>
    )
  const kind: PaymentKind = parcel.kind === 'avulso' ? 'saldo' : parcel.kind
  return <PaymentModal r={q.data} initial={{ kind, amount: falta(parcel) }} onClose={onClose} />
}
