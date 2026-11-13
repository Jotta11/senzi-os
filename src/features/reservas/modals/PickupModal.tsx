import { useState, type FormEvent } from 'react'
import { usePermissions } from '@/auth/usePermissions'
import { useAddNote } from '@/data/hooks'
import { usePickupItems } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl, dateBR, todayISO } from '@/lib/format'
import { Button, Field, Icon, Modal, useToast } from '@/ui'
import { GarmentThumb } from '../GarmentThumb'

export type PickupModalProps = { r: ReservationDetail; onClose(): void; onReceive(): void }

/**
 * Registrar retirada (spec §3.5): conferência por peça (marcada por padrão). Saldo em aberto só é avisado:
 * a peça sai sem PIN e o saldo continua em aberto na reserva.
 */
export function PickupModal({ r, onClose, onReceive }: PickupModalProps) {
  const pickup = usePickupItems(r.id)
  const addNote = useAddNote(r.customer.id)
  const toast = useToast()
  const { can } = usePermissions()
  const open = r.items.filter((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue')
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(open.map((i) => [i.id, true])))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pickupNote, setPickupNote] = useState('')
  const [guidance, setGuidance] = useState(true)
  const due = r.balance.due
  const owes = due > 0.005
  const chosen = open.filter((i) => picked[i.id])

  function run() {
    pickup.mutate(
      { decisions: open.map((i) => ({ itemId: i.id, delivered: !!picked[i.id], note: notes[i.id]?.trim() || undefined })) },
      {
        onSuccess: (res) => {
          // Observação da retirada vira memória de atendimento da cliente (só quem pode anotar)
          if (can('cliente.note') && pickupNote.trim()) addNote.mutate({ content: `Retirada — ${pickupNote.trim()}`, channel: 'presencial', pinned: false })
          const pending = res.items.filter((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue').length
          const out = res.items.filter((i) => i.itemState === 'retirado').length
          if (pending > 0) toast({ title: 'Retirada parcial registrada', description: `${chosen.length} entregue(s), ${pending} pendente(s) na loja.` })
          else toast({ title: 'Retirada registrada', description: `${r.code} · ${out} peça(s) em uso, devolução ${dateBR(r.returnDueDate).slice(0, 5)}.` })
          onClose()
        },
        onError: (err) => {
          toast({ title: 'Não foi possível registrar a retirada', description: errorMessage(err), tone: 'error' })
        },
      },
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (pickup.isPending) return
    if (chosen.length === 0) {
      toast({ title: 'Nenhuma peça marcada', description: 'Marque o que a cliente está levando.', tone: 'error' })
      return
    }
    run()
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title="Registrar retirada"
        description={`${r.code} · ${r.customer.fullName}`}
        footer={
          <>
            <Button onClick={onClose}>Cancelar</Button>
            {owes && can('financeiro.payment') && <Button onClick={onReceive}>Receber agora</Button>}
            <Button variant="primary" type="submit" form="rd-pickup" disabled={pickup.isPending}>
              Confirmar retirada
            </Button>
          </>
        }
      >
        <form id="rd-pickup" className="rd-form" onSubmit={submit} noValidate>
          {owes ? (
            <p className="note amber">
              <Icon name="alerta" size={14} />
              <span>
                <b>Saldo em aberto: {brl(due)}.</b> Dá para entregar assim; o valor continua pendente na reserva.
              </span>
            </p>
          ) : (
            <p className="note green">
              <Icon name="check" size={14} />
              <span>Reserva quitada. Pode entregar.</span>
            </p>
          )}
          {r.pickupDate > todayISO() && (
            <p className="note amber">
              <Icon name="relogio" size={14} />
              <span>
                <b>Retirada antecipada.</b> O combinado era {dateBR(r.pickupDate)}. A peça passa a ficar fora da loja a partir de hoje no calendário.
              </span>
            </p>
          )}
          <p>
            <span className="eyebrow">Conferência de saída</span> <span className="muted tiny">desmarque o que não sair da loja</span>
          </p>
          <ul className="rd-conf">
            {open.map((it) => {
              const g = r.garments.find((x) => x.id === it.garmentId)
              if (!g) return null
              return (
                <li key={it.id}>
                  <label className="rd-conf-h">
                    <input type="checkbox" checked={!!picked[it.id]} onChange={(e) => setPicked((p) => ({ ...p, [it.id]: e.target.checked }))} />
                    <GarmentThumb garment={g} small />
                    <span>
                      <b>{g.name}</b> <span className="mono tiny muted">{g.code}</span>
                      <span className="tiny muted rd-block">
                        {g.colorPrimary} · tam. {g.labelSize}
                      </span>
                    </span>
                  </label>
                  {it.alterationNotes && (
                    <span className="tiny rd-alter">
                      <Icon name="costura" size={12} /> {it.alterationNotes}
                    </span>
                  )}
                  <Field
                    label={`Observação desta peça — ${g.name}`}
                    placeholder="ex.: cliente virá buscar amanhã"
                    value={notes[it.id] ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [it.id]: e.target.value }))}
                  />
                </li>
              )
            })}
          </ul>
          {can('cliente.note') && <Field label="Observação da retirada" placeholder="Peça entregue com capa protetora e cabide" value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} />}
          <label className="rd-chk">
            <input type="checkbox" checked={guidance} onChange={(e) => setGuidance(e.target.checked)} /> Orientações de uso e devolução explicadas
          </label>
        </form>
      </Modal>
    </>
  )
}
