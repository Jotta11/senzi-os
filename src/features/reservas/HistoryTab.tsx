import { RESERVATION_STATE } from '@/data/labels-ops'
import type { ReservationDetail } from '@/data/types'
import { dateTimeBR } from '@/lib/format'
import { EmptyState } from '@/ui'
import { firstName } from './reservaFormat'

/** Aba Histórico: linha do tempo, mais recente primeiro; o marcador usa o tom do estado de destino. */
export function HistoryTab({ r }: { r: ReservationDetail }) {
  const rows = [...r.history].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return (
    <section className="card" aria-labelledby="rd-hist-t">
      <div className="card-h">
        <h3 id="rd-hist-t">Histórico da reserva</h3>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="historico" title="Sem registros" />
      ) : (
        <ol className="rd-timeline">
          {rows.map((h) => {
            const st = RESERVATION_STATE[h.toState]
            return (
              <li key={h.id}>
                <span className="rd-dot" data-tone={st.tone} aria-hidden="true" />
                <span className="muted tiny rd-when">
                  {dateTimeBR(h.occurredAt).slice(0, 5)} {dateTimeBR(h.occurredAt).slice(11, 16)}
                </span>
                <div>
                  <b>{st.label}</b>
                  <span className="tiny muted">
                    {h.reason ?? ''}
                    {h.userName ? `${h.reason ? ' · ' : ''}${firstName(h.userName)}` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
