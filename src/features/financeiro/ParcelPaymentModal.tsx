import { useReservation } from '@/data/hooks-reservas'
import type { PaymentKind, Receivable } from '@/data/types'
import { falta } from '@/domain/finance'
import { PaymentModal } from '../reservas/modals/PaymentModal'

/** "Registrar pagamento" de uma parcela de reserva: abre o modal da reserva com tipo e valor da parcela (saldo→Saldo, multa→Multa por atraso). */
export function ParcelPaymentModal({ parcel, onClose }: { parcel: Receivable; onClose(): void }) {
  const q = useReservation(parcel.reservationId ?? undefined)
  if (!q.data) return null
  const kind: PaymentKind = parcel.kind === 'avulso' ? 'saldo' : parcel.kind
  return <PaymentModal r={q.data} initial={{ kind, amount: falta(parcel) }} onClose={onClose} />
}
