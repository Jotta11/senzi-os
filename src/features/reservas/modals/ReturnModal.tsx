import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useReturnItems, useSettings } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { daysLate, lateFeePercent } from '@/domain/money'
import { errorMessage } from '@/lib/errorMessages'
import { brl, dateTimeBR, todayISO } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Button, Field, Icon, Modal, useToast } from '@/ui'

/**
 * Registrar devolução (spec §3.6): marca o que voltou; multa por atraso é lançada como cobrança pendente.
 * Depois vai para a Operação quando o perfil enxerga essa área.
 */
export function ReturnModal({ r, onClose }: { r: ReservationDetail; onClose(): void }) {
  const ret = useReturnItems(r.id)
  const settings = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const href = useAppHref()
  const { can } = usePermissions()
  const out = r.items.filter((i) => i.itemState === 'retirado')
  const back = r.items.filter((i) => i.itemState === 'devolvido' || i.itemState === 'inspecionado')
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(out.map((i) => [i.id, true])))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const pct = lateFeePercent(r, settings.data)
  const late = Math.max(0, daysLate({ state: 'em_uso', returnDueDate: r.returnDueDate }, todayISO()))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ret.isPending) return
    const chosen = out.filter((i) => picked[i.id])
    if (chosen.length === 0) {
      toast({ title: 'Nenhuma peça marcada', description: 'Marque o que a cliente devolveu.', tone: 'error' })
      return
    }
    ret.mutate(
      out.map((i) => ({ itemId: i.id, returned: !!picked[i.id], note: notes[i.id]?.trim() || undefined })),
      {
        onSuccess: (res) => {
          const still = res.items.filter((i) => i.itemState === 'retirado').length
          if (still > 0) toast({ title: 'Devolução parcial registrada', description: `${chosen.length} recebida(s) · ${still} ainda com a cliente.` })
          else toast({ title: 'Devolução registrada', description: `${res.lateFee > 0 ? `Multa de ${brl(res.lateFee)} lançada. ` : ''}${chosen.length} peça(s) em inspeção.` })
          onClose()
          if (can('operacao.view')) navigate(href(`/operacao?reserva=${r.id}`))
        },
        onError: (err) => toast({ title: 'Não foi possível registrar a devolução', description: errorMessage(err), tone: 'error' }),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Registrar devolução"
      description={`${r.code} · ${r.customer.fullName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rd-return" disabled={ret.isPending}>
            Confirmar devolução
          </Button>
        </>
      }
    >
      <form id="rd-return" className="rd-form" onSubmit={submit} noValidate>
        {late > 0 ? (
          <p className="note red">
            <Icon name="alerta" size={14} />
            <span>
              <b>{late} dia(s) de atraso.</b> Multa contratual de {pct}% ao dia: <b>{brl((r.totalNet * pct * late) / 100)}</b>. Lançada como cobrança pendente.
            </span>
          </p>
        ) : (
          <p className="note green">
            <Icon name="check" size={14} />
            <span>Devolução dentro do prazo.</span>
          </p>
        )}
        <p className="note info">
          <Icon name="refresh" size={14} />
          <span>
            Cada peça marcada entra em <b>inspeção</b> e fica indisponível para novas reservas até a Operação liberar. O que ficar desmarcado continua com a cliente e a multa segue correndo.
          </span>
        </p>
        <p>
          <span className="eyebrow">Peças recebidas agora</span> <span className="muted tiny">marque só o que voltou de fato</span>
        </p>
        <ul className="rd-conf">
          {out.map((it) => {
            const g = r.garments.find((x) => x.id === it.garmentId)
            if (!g) return null
            return (
              <li key={it.id}>
                <label className="rd-conf-h">
                  <input type="checkbox" checked={!!picked[it.id]} onChange={(e) => setPicked((p) => ({ ...p, [it.id]: e.target.checked }))} />
                  <span>
                    <b>{g.name}</b> <span className="mono tiny muted">{g.code}</span>
                    {it.pickedUpAt && <span className="tiny muted rd-block">retirada {dateTimeBR(it.pickedUpAt).slice(0, 16)}</span>}
                  </span>
                </label>
                <Field
                  label={`Ocorrência desta peça — ${g.name}`}
                  placeholder="ex.: mancha na barra, cliente avisou"
                  value={notes[it.id] ?? ''}
                  onChange={(e) => setNotes((p) => ({ ...p, [it.id]: e.target.value }))}
                />
              </li>
            )
          })}
        </ul>
        {back.length > 0 && <p className="tiny muted">Já recebidas nesta reserva: {back.map((i) => r.garments.find((g) => g.id === i.garmentId)?.code).join(', ')}.</p>}
      </form>
    </Modal>
  )
}
