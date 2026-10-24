import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { RESERVATION_STATE } from '@/data/labels-ops'
import type { ReservationDetail } from '@/data/types'
import { relativeDay } from '@/domain/dates'
import { brl, dateBR, maskPhone } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Icon } from '@/ui'

const CHANNEL = { loja: 'Loja', whatsapp: 'WhatsApp', instagram: 'Instagram' } as const

/** Lateral da ficha: card "Estado" com dados da reserva e, com `financeiro.view`, o bloco de valores. */
export function ReservationSide({ r, today }: { r: ReservationDetail; today: string }) {
  const { can } = usePermissions()
  const href = useAppHref()
  const st = RESERVATION_STATE[r.state]
  const c = r.customer
  const phone = c.phone ? maskPhone(c.phone) : '—'
  const rel = (iso: string) => <span className="muted"> · {relativeDay(iso, today)}</span>
  const b = r.balance
  const discount = r.discount
  return (
    <aside className="card rd-side" aria-label="Resumo da reserva">
      <div className="card-h">
        <span className="eyebrow">Estado</span>
        <div className="actions">
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
      </div>
      <div className="card-b rd-side-b">
        <dl className="gp-kv">
          <div>
            <dt>Cliente</dt>
            <dd>{can('cliente.view') ? <Link to={href(`/clientes/${c.id}`)}>{c.fullName}</Link> : c.fullName}</dd>
          </div>
          {can('cliente.view') && (
            <div>
              <dt>Contato</dt>
              <dd>{phone}</dd>
            </div>
          )}
          <div>
            <dt>Evento</dt>
            <dd>{r.eventType || '—'}</dd>
          </div>
          <div>
            <dt>Data do evento</dt>
            <dd>{r.eventDate ? dateBR(r.eventDate) : '—'}</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>{r.eventVenue || '—'}</dd>
          </div>
          <div>
            <dt>Retirada</dt>
            <dd>
              {dateBR(r.pickupDate)}
              {rel(r.pickupDate)}
            </dd>
          </div>
          <div>
            <dt>Devolução</dt>
            <dd>
              {dateBR(r.returnDueDate)}
              {rel(r.returnDueDate)}
            </dd>
          </div>
          <div>
            <dt>Canal</dt>
            <dd>{CHANNEL[r.channel] ?? '—'}</dd>
          </div>
        </dl>

        {can('financeiro.view') && (
          <dl className="rd-money" aria-label="Valores da reserva">
            <div>
              <dt>Locação</dt>
              <dd>{brl(r.totalGross)}</dd>
            </div>
            {discount > 0 && (
              <div>
                <dt>Desconto</dt>
                <dd>− {brl(discount)}</dd>
              </div>
            )}
            {r.lateFee > 0 && (
              <div className="red">
                <dt>Multa por atraso</dt>
                <dd>{brl(r.lateFee)}</dd>
              </div>
            )}
            <div className="strong">
              <dt>Total</dt>
              <dd>{brl(b.devido)}</dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>{brl(b.pago)}</dd>
            </div>
            <div className={`strong ${b.due > 0.005 ? 'red' : 'green'}`}>
              <dt>Saldo</dt>
              <dd>{brl(b.due)}</dd>
            </div>
            {b.caucao > 0 && (
              <div className="dim">
                <dt>Caução retida</dt>
                <dd>{brl(b.caucao)}</dd>
              </div>
            )}
            {r.state === 'rascunho' && (
              <div className="dim">
                <dt>Sinal mínimo para confirmar</dt>
                <dd>{brl(r.minSignal)}</dd>
              </div>
            )}
          </dl>
        )}

        {r.notes && (
          <p className="note info">
            <Icon name="editar" size={14} />
            <span>{r.notes}</span>
          </p>
        )}
      </div>
    </aside>
  )
}
