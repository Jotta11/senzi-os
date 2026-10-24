import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { RESERVATION_STATE } from '@/data/labels-ops'
import type { ReservationRow } from '@/data/types'
import { brl, dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, EmptyState } from '@/ui'
import './reservas.css'

export type ReservationsPaneProps = {
  rows: ReservationRow[] | undefined
  /** `peca`: na ficha da cliente mostra as peças; `cliente`: na ficha da peça mostra a cliente. */
  show: 'peca' | 'cliente'
  loading: boolean
}

/** Aba "Reservas" das fichas da peça e da cliente: da retirada mais recente para a mais antiga, cada uma leva à ficha. */
export function ReservationsPane({ rows, show, loading }: ReservationsPaneProps) {
  const { can } = usePermissions()
  const href = useAppHref()
  const money = can('financeiro.view')
  return (
    <section className="card">
      <div className="card-h">
        <h3>Reservas</h3>
        <span className="muted tiny">da retirada mais recente para a mais antiga</span>
      </div>
      {loading ? (
        <p className="muted tiny rs-pane-empty" role="status">
          Carregando reservas…
        </p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon="reservas" title="Nenhuma reserva ainda" description="As reservas aparecem aqui assim que forem criadas." />
      ) : (
        <ul className="rs-pane" aria-label="Reservas">
          {rows.map((r) => {
            const st = RESERVATION_STATE[r.state]
            return (
              <li key={r.id}>
                <Link to={href(`/reservas/${r.id}`)} className="mono rs-code">
                  {r.code}
                </Link>
                <span className="rs-pane-m">
                  <b>{show === 'cliente' ? r.customerName : r.garments.map((g) => g.shortName).join(' + ')}</b>
                  <span className="muted tiny">
                    retirada {dateBR(r.pickupDate)} · devolução {dateBR(r.returnDueDate)}
                    {r.eventType ? ` · ${r.eventType}` : ''}
                  </span>
                </span>
                <Badge tone={st.tone}>{st.label}</Badge>
                {money && <span className="rs-value">{brl(r.totalNet)}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
