import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import type { ReservationDetail, Settings } from '@/data/types'
import { daysLate, lateFeePercent } from '@/domain/money'
import { brl, dateBR, dateTimeBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Icon } from '@/ui'
import { exceptionLead } from './reservaFormat'

const d2 = (iso: string) => dateBR(iso).slice(0, 5)

/** Faixas no topo da ficha, na ordem da spec §2.2: atraso, conflito do rascunho, cancelada, prova de origem, exceções. */
export function ReservationNotices({ r, today, settings }: { r: ReservationDetail; today: string; settings: Settings | undefined }) {
  const { can } = usePermissions()
  const href = useAppHref()
  const late = daysLate(r, today)
  const pct = lateFeePercent(r, settings)
  return (
    <>
      {late > 0 && (
        <p className="note red">
          <Icon name="alerta" size={15} />
          <span>
            <b>Devolução atrasada em {late} dia(s).</b> Prevista para {dateBR(r.returnDueDate)}.
            {can('financeiro.view') && ` A multa contratual é de ${pct}% ao dia sobre ${brl(r.totalNet)} — ${brl((r.totalNet * pct * late) / 100)} até agora.`} As peças seguem bloqueadas para novas reservas.
          </span>
        </p>
      )}
      {r.state === 'rascunho' && r.conflicts.length > 0 && (
        <div className="note amber">
          <Icon name="alerta" size={15} />
          <span>
            <b>Há conflito de agenda.</b>{' '}
            {r.conflicts.map((c) => {
              const g = r.garments.find((x) => x.id === c.garmentId)
              const list = c.conflicts.map((k) => `${k.label} de ${d2(k.from)} – ${d2(k.to)}${k.reservationCode ? ` — reserva ${k.reservationCode}` : ''}`).join('; ')
              return `${g?.name ?? 'Peça'}: ${list || c.reason || 'indisponível'}. `
            })}
            O rascunho não bloqueia a peça; a confirmação vai falhar enquanto o conflito existir.
          </span>
        </div>
      )}
      {r.state === 'cancelada' && (
        <p className="note info">
          <Icon name="x" size={15} />
          <span>
            <b>Reserva cancelada.</b> {r.cancelReason}
          </span>
        </p>
      )}
      {r.fittingId && r.fittingCode && r.fittingDate && (
        <p className="note info">
          <Icon name="prova" size={15} />
          <span>
            Esta reserva nasceu da prova{' '}
            {can('prova.view') ? (
              <Link to={href(`/provas/${r.fittingId}`)} className="mono">
                {r.fittingCode}
              </Link>
            ) : (
              <span className="mono">{r.fittingCode}</span>
            )}{' '}
            de {dateBR(r.fittingDate)}.
          </span>
        </p>
      )}
      {r.authorizations.map((a) => (
        <div key={a.id} className="note amber">
          <Icon name="escudo" size={15} />
          <span>
            <b>Exceção autorizada.</b> {exceptionLead(a)} autorizado por {a.authorizedByName} — {a.authorizedByRole}, em {dateTimeBR(a.authorizedAt).slice(0, 5)} {dateTimeBR(a.authorizedAt).slice(11, 16)}.
            <span className="rd-block">Motivo: {a.reason || 'não informado'}</span>
          </span>
        </div>
      ))}
    </>
  )
}
