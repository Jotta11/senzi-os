import { usePermissions } from '@/auth/usePermissions'
import { useSettings } from '@/data/hooks-reservas'
import { PAYMENT_KIND } from '@/data/labels-ops'
import { RESERVATION_STATE } from '@/data/labels-ops'
import type { ReservationDetail } from '@/data/types'
import { brl, dateBR, maskPhone, todayISO } from '@/lib/format'
import { Logo, Silhouette } from '@/ui'
import { longDay } from '../reservaFormat'
import { PrintShell, STORE_PLACEHOLDER } from './PrintShell'

/** `/reservas/:id/os` — Ordem de Serviço / Confirmação de Reserva (spec §5.3). Valores só com `financeiro.view`; contato só com `cliente.view`. */
export function OsPrint() {
  return <PrintShell>{(r) => <Os r={r} />}</PrintShell>
}

function Os({ r }: { r: ReservationDetail }) {
  const { can } = usePermissions()
  const settings = useSettings()
  const pct = r.contract?.terms.lateFeeDailyPercent ?? settings.data?.lateFeeDailyPercent ?? 0
  const b = r.balance
  const money = can('financeiro.view')
  return (
    <>
      <header className="pr-head">
        <Logo className="pr-logo" />
        <div className="pr-title">
          <h1 className="display">Ordem de Serviço / Confirmação de Reserva</h1>
          <p>
            <b className="mono">{r.code}</b> · emitida em {dateBR(todayISO())} · <b>{RESERVATION_STATE[r.state].label}</b>
          </p>
        </div>
      </header>

      <section className="pr-sec">
        <h2>Cliente</h2>
        <p>
          <b>{can('cliente.view') ? r.customer.fullName : '—'}</b>
          {can('cliente.view') && r.customer.phone ? ` · ${maskPhone(r.customer.phone)}` : ''}
        </p>
      </section>

      <section className="pr-sec">
        <h2>Peças</h2>
        <ul className="pr-items">
          {r.items.map((it) => {
            const g = r.garments.find((x) => x.id === it.garmentId)
            const cover = g?.photos.find((p) => p.isCover) ?? g?.photos[0]
            return (
              <li key={it.id}>
                {cover ? (
                  <img src={cover.url} alt="" className="pr-photo" />
                ) : g ? (
                  <span className="pr-photo" aria-hidden="true">
                    <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />
                  </span>
                ) : (
                  <span className="pr-photo" aria-hidden="true" />
                )}
                <div>
                  <b>
                    {g?.code} · {g?.name}
                  </b>
                  <span>
                    {g?.colorPrimary} · tam. {g?.labelSize}
                  </span>
                  {it.alterationNotes && <span>Ajuste: {it.alterationNotes}</span>}
                </div>
                {money && <b className="pr-money">{brl(it.netRevenue)}</b>}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="pr-sec">
        <h2>Datas</h2>
        <dl className="pr-kv">
          {r.fittingDate && (
            <div>
              <dt>Prova</dt>
              <dd>{dateBR(r.fittingDate)}</dd>
            </div>
          )}
          <div>
            <dt>Retirada</dt>
            <dd>{dateBR(r.pickupDate)}</dd>
          </div>
          <div>
            <dt>Devolução</dt>
            <dd>{dateBR(r.returnDueDate)} até as 18h</dd>
          </div>
          <div>
            <dt>Evento</dt>
            <dd>
              {r.eventDate ? `${dateBR(r.eventDate)} (${longDay(r.eventDate)})` : '—'}
              {r.eventType ? ` · ${r.eventType}` : ''}
              {r.eventVenue ? ` · ${r.eventVenue}` : ''}
            </dd>
          </div>
        </dl>
      </section>

      {money && (
        <section className="pr-sec">
          <h2>Valores</h2>
          <dl className="pr-kv">
            <div>
              <dt>Locação</dt>
              <dd>{brl(r.totalGross)}</dd>
            </div>
            {r.discount > 0 && (
              <div>
                <dt>Desconto</dt>
                <dd>− {brl(r.discount)}</dd>
              </div>
            )}
            {r.lateFee > 0 && (
              <div>
                <dt>Multa por atraso</dt>
                <dd>{brl(r.lateFee)}</dd>
              </div>
            )}
            <div>
              <dt>Total</dt>
              <dd>
                <b>{brl(b.devido)}</b>
              </dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>{brl(b.pago)}</dd>
            </div>
            <div>
              <dt>Saldo</dt>
              <dd>
                <b>{brl(b.due)}</b>
                {b.due > 0 ? ` · vence na retirada, ${dateBR(r.pickupDate)}` : ''}
              </dd>
            </div>
            <div>
              <dt>{PAYMENT_KIND.caucao}</dt>
              <dd>{r.depositAmount > 0 || b.caucao > 0 ? `${brl(b.caucao || r.depositAmount)} · devolvida após inspeção` : 'dispensada'}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="pr-sec">
        <h2>Regras</h2>
        <ul className="pr-rules">
          <li>Atraso na devolução: multa diária de {pct}% sobre o valor da locação, por dia corrido.</li>
          <li>Não lavar, passar, tingir nem ceder a peça a terceiros; comunicar qualquer dano imediatamente.</li>
          <li>Ajustes de barra e pences são desfeitos na devolução.</li>
        </ul>
      </section>

      <footer className="pr-foot">{STORE_PLACEHOLDER}</footer>
    </>
  )
}
