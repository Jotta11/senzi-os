import { useNavigate } from 'react-router'
import { useReservation } from '@/data/hooks-reservas'
import { useAppHref } from '@/shell/appPath'
import { PickupModal } from '../reservas/modals/PickupModal'
import { ReturnModal } from '../reservas/modals/ReturnModal'

/** Abre a retirada ou a devolução da reserva direto do Dashboard (carrega a ficha e reaproveita os modais da Reserva). */
export function ReservationDialog({ id, mode, onClose }: { id: string; mode: 'pickup' | 'return'; onClose(): void }) {
  const q = useReservation(id)
  const navigate = useNavigate()
  const href = useAppHref()
  if (!q.data) return null
  return mode === 'pickup' ? (
    <PickupModal
      r={q.data}
      onClose={onClose}
      onReceive={() => {
        onClose()
        navigate(href(`/reservas/${id}`))
      }}
    />
  ) : (
    <ReturnModal r={q.data} onClose={onClose} />
  )
}
