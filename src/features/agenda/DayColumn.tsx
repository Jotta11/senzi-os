import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { AG_KIND } from '@/data/labels-ops'
import { BLOCK_KIND } from '@/data/labels'
import type { AgendaDay, AgendaItem } from '@/data/types'
import { dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Icon } from '@/ui'
import { dayLabel, isManual, weekdayName } from './agendaDates'

/** Rótulos curtos dos blocos de acervo no rodapé do dia (spec 2.1.3). */
const BLOCK_LABEL = (k: keyof typeof BLOCK_KIND) => (k === 'bloqueio_manual' ? 'Bloqueio' : BLOCK_KIND[k].label)

export type DayColumnProps = {
  day: AgendaDay
  today: string
  /** Tipo escolhido nos chips (`todos` = sem filtro). Não filtra os blocos de acervo. */
  filter: string
  onEdit(day: string, item: AgendaItem): void
}

/** Linha 3 do cartão: nome da cliente; sem cliente, o título (se for diferente do rótulo do tipo). */
function lineThree(i: AgendaItem): string | null {
  if (i.customer) return i.customer.fullName
  return i.title && i.title !== AG_KIND[i.kind].label ? i.title : null
}

function ItemCard({ item, date, onEdit }: { item: AgendaItem; date: string; onEdit: DayColumnProps['onEdit'] }) {
  const href = useAppHref()
  const k = AG_KIND[item.kind]
  const done = item.state === 'concluido' || item.state === 'no_show'
  const who = lineThree(item)
  const className = ['kb-card', item.internal && 'is-internal', done && 'done'].filter(Boolean).join(' ')
  const style = { '--ev-tone': `var(--t-${k.tone})` } as CSSProperties
  const body = (
    <>
      <span className="kb-time">{item.time}</span>
      <span className="kb-kind">
        {item.internal && <Icon name="agenda" size={12} />}
        {k.label}
        {item.state === 'no_show' && <span className="kb-state"> · não compareceu</span>}
      </span>
      {who && <span className="kb-who">{who}</span>}
    </>
  )

  // destino: prova > reserva > cliente
  const to = item.fitting ? `/provas/${item.fitting.id}` : item.reservation ? `/reservas/${item.reservation.id}` : item.customer ? `/clientes/${item.customer.id}` : null
  if (isManual(item) && item.state === 'agendado') {
    return (
      <button type="button" className={className} style={style} onClick={() => onEdit(date, item)}>
        {body}
      </button>
    )
  }
  if (to) {
    return (
      <Link to={href(to)} className={className} style={style}>
        {body}
      </Link>
    )
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  )
}

/** Coluna de um dia: compromissos por horário (filtrados por tipo) + blocos do acervo. */
export function DayColumn({ day, today, filter, onEdit }: DayColumnProps) {
  const href = useAppHref()
  const isToday = day.date === today
  const items = day.items.filter((i) => filter === 'todos' || i.kind === filter)
  return (
    <section
      role="region"
      aria-label={dayLabel(day.date)}
      className={['kb-day', isToday && 'today'].filter(Boolean).join(' ')}
      data-date={day.date}
      data-today={isToday || undefined}
    >
      <header className="kb-day-h">
        <div>
          <div className="eyebrow">{weekdayName(day.date).slice(0, 3)}</div>
          <div className="display kb-day-n">{dateBR(day.date).slice(0, 5)}</div>
        </div>
        {isToday && <Badge tone="wine">hoje</Badge>}
      </header>
      <div className="kb-day-b">
        {items.length === 0 ? (
          <p className="kb-empty" aria-label="Sem compromissos">
            —
          </p>
        ) : (
          <ul className="kb-list">
            {items.map((i) => (
              <li key={i.id}>
                <ItemCard item={i} date={day.date} onEdit={onEdit} />
              </li>
            ))}
          </ul>
        )}
        {(day.garmentBlocks.length > 0 || day.moreBlocks > 0) && (
          <ul className="kb-blocks" aria-label="Peças bloqueadas">
            {day.garmentBlocks.map((b) => (
              <li key={`${b.garmentId}-${b.kind}`}>
                <Link to={href(`/acervo/${b.garmentId}`)} className="kb-block" style={{ '--ev-tone': `var(--t-${BLOCK_KIND[b.kind].tone})` } as CSSProperties}>
                  <span className="mono">{b.garmentCode}</span> · {BLOCK_LABEL(b.kind)}
                </Link>
              </li>
            ))}
            {day.moreBlocks > 0 && <li className="kb-more">+{day.moreBlocks} peças</li>}
          </ul>
        )}
      </div>
    </section>
  )
}
