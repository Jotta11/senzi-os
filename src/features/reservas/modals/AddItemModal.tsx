import { useState } from 'react'
import { useAddDraftItem } from '@/data/hooks-reservas'
import type { Garment, ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Modal, useToast } from '@/ui'
import { GarmentSelector } from '../GarmentSelector'

/** "Adicionar peça" (só rascunho): reaproveita o seletor com disponibilidade; salva uma peça por vez. */
export function AddItemModal({ r, onClose }: { r: ReservationDetail; onClose(): void }) {
  const add = useAddDraftItem(r.id)
  const toast = useToast()
  const [extra, setExtra] = useState<Garment[]>([])
  const current = new Set(r.items.map((i) => i.garmentId))
  const toggle = (g: Garment) => {
    if (current.has(g.id)) return
    setExtra((p) => (p.some((x) => x.id === g.id) ? p.filter((x) => x.id !== g.id) : [...p, g]))
  }

  async function save() {
    try {
      for (const g of extra) await add.mutateAsync(g.id)
      toast({ title: extra.length === 1 ? 'Peça adicionada' : 'Peças adicionadas', description: `${r.code} · contrato regerado.` })
      onClose()
    } catch (err) {
      toast({ title: 'Não foi possível adicionar', description: errorMessage(err), tone: 'error' })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Adicionar peça"
      description={`${r.code} · o rascunho não bloqueia a peça`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={extra.length === 0 || add.isPending} onClick={() => void save()}>
            Adicionar
          </Button>
        </>
      }
    >
      <GarmentSelector
        selected={[...r.garments, ...extra]}
        onToggle={toggle}
        onSwap={(from, to) => setExtra((p) => (p.some((x) => x.id === from) ? p.map((x) => (x.id === from ? to : x)) : p))}
        pickup={r.pickupDate}
        returnDue={r.returnDueDate}
        ignoreReservationId={r.id}
      />
    </Modal>
  )
}
