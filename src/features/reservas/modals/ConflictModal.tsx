import type { AvailabilityResult, ReservationDetail } from '@/data/types'
import { dateBR } from '@/lib/format'
import { Button, Icon, Modal } from '@/ui'

const d2 = (iso: string) => dateBR(iso).slice(0, 5)

/** "Confirmação recusada": nada foi alterado; uma faixa por peça em conflito (spec §3.2). */
export function ConflictModal({ r, conflicts, onClose }: { r: ReservationDetail; conflicts: AvailabilityResult[]; onClose(): void }) {
  const n = conflicts.length
  return (
    <Modal open onClose={onClose} title="Confirmação recusada" description={`${r.code} · nada foi alterado`} footer={<Button variant="primary" onClick={onClose}>Entendi</Button>}>
      <div className="rd-form">
        <p className="note red">
          <Icon name="alerta" size={14} />
          <span>
            <b>O rascunho continua intacto.</b> {n} peça(s) entraram em conflito desde que o rascunho foi criado — e o sistema não confirma nada pela metade: ou todas as peças passam, ou nenhuma é alterada.
          </span>
        </p>
        {conflicts.map((c) => {
          const g = r.garments.find((x) => x.id === c.garmentId)
          return (
            <div key={c.garmentId} className="note amber">
              <Icon name="alerta" size={14} />
              <span>
                <b>
                  {g?.code ?? '—'} — {g?.name ?? 'Peça'}
                </b>
                {c.conflicts.map((k) => (
                  <span key={`${k.kind}-${k.from}`} className="rd-block">
                    {k.label} de {d2(k.from)} – {d2(k.to)}
                    {k.reservationCode ? ` — reserva ${k.reservationCode}` : ''}.
                  </span>
                ))}
                {c.reason && <span className="rd-block">{c.reason}</span>}
              </span>
            </div>
          )
        })}
        <p className="note info">
          <Icon name="alerta" size={14} />
          <span>Remova a peça em conflito, mude as datas ou troque por uma alternativa livre — e confirme de novo.</span>
        </p>
      </div>
    </Modal>
  )
}
