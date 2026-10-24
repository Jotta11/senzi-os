import { useState, type FormEvent } from 'react'
import { usePermissions } from '@/auth/usePermissions'
import { usePickupItems } from '@/data/hooks-reservas'
import type { Garment, ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl, dateBR } from '@/lib/format'
import { Button, Field, Icon, Modal, Silhouette, useToast } from '@/ui'
import { AuthorizeExceptionDialog } from '../../exceptions/AuthorizeExceptionDialog'

export type PickupModalProps = { r: ReservationDetail; onClose(): void; onReceive(): void }

function Thumb({ g }: { g: Garment }) {
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  return (
    <span className="rd-thumb sm" aria-hidden="true">
      {cover ? <img src={cover.url} alt="" /> : <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />}
    </span>
  )
}

/**
 * Registrar retirada (spec §3.5): conferência por peça (marcada por padrão). Com saldo em aberto a entrega exige
 * a exceção `retirada_com_saldo` por PIN ("Autorizar e entregar").
 */
export function PickupModal({ r, onClose, onReceive }: PickupModalProps) {
  const pickup = usePickupItems(r.id)
  const toast = useToast()
  const { can } = usePermissions()
  const open = r.items.filter((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue')
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(open.map((i) => [i.id, true])))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [guidance, setGuidance] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const due = r.balance.due
  const owes = due > 0.005
  const chosen = open.filter((i) => picked[i.id])

  function run(exceptionId?: string) {
    pickup.mutate(
      { decisions: open.map((i) => ({ itemId: i.id, delivered: !!picked[i.id], note: notes[i.id]?.trim() || undefined })), exceptionId },
      {
        onSuccess: (res) => {
          const by = res.authorizations.find((a) => a.id === exceptionId)?.authorizedByName
          if (by) toast({ title: 'Retirada autorizada', description: `${brl(due)} em aberto · autorizada por ${by}.` })
          const pending = res.items.filter((i) => i.itemState === 'pendente' || i.itemState === 'nao_entregue').length
          const out = res.items.filter((i) => i.itemState === 'retirado').length
          if (pending > 0) toast({ title: 'Retirada parcial registrada', description: `${chosen.length} entregue(s), ${pending} pendente(s) na loja.` })
          else toast({ title: 'Retirada registrada', description: `${r.code} · ${out} peça(s) em uso, devolução ${dateBR(r.returnDueDate).slice(0, 5)}.` })
          onClose()
        },
        onError: (err) => {
          toast({ title: 'Não foi possível registrar a retirada', description: errorMessage(err), tone: 'error' })
          setAuthOpen(false)
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
    if (owes) setAuthOpen(true)
    else run()
  }

  return (
    <>
      <Modal
        open={!authOpen}
        onClose={onClose}
        size="lg"
        title="Registrar retirada"
        description={`${r.code} · ${r.customer.fullName}`}
        footer={
          <>
            <Button onClick={onClose}>Cancelar</Button>
            {owes && can('financeiro.payment') && <Button onClick={onReceive}>Receber agora</Button>}
            <Button variant="primary" type="submit" form="rd-pickup" disabled={pickup.isPending}>
              {owes ? 'Autorizar e entregar' : 'Confirmar retirada'}
            </Button>
          </>
        }
      >
        <form id="rd-pickup" className="rd-form" onSubmit={submit} noValidate>
          {owes ? (
            <p className={`note ${can('reserva.authorize') ? 'amber' : 'red'}`}>
              <Icon name="alerta" size={14} />
              <span>
                <b>Retirada com saldo pendente exige autorização.</b> Falta {brl(due)}. Um administrador precisa digitar o PIN.
              </span>
            </p>
          ) : (
            <p className="note green">
              <Icon name="check" size={14} />
              <span>Reserva quitada. Pode entregar.</span>
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
                    <Thumb g={g} />
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
          <label className="rd-chk">
            <input type="checkbox" checked={guidance} onChange={(e) => setGuidance(e.target.checked)} /> Orientações de uso e devolução explicadas
          </label>
        </form>
      </Modal>

      {authOpen && (
        <AuthorizeExceptionDialog
          kind="retirada_com_saldo"
          refType="reserva"
          refId={r.id}
          detail={
            <>
              {r.customer.fullName} está levando a(s) peça(s) com <b>{brl(due)}</b> em aberto na reserva {r.code}.
            </>
          }
          onAuthorized={(id) => run(id)}
          onCancel={() => setAuthOpen(false)}
        />
      )}
    </>
  )
}
