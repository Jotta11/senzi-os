import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MAINTENANCE_KIND } from '@/data/labels-ops'
import type { Tone } from '@/ui'
import type { QueueRow } from '@/data/types'
import { dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, EmptyState } from '@/ui'
import { GarmentThumb } from '../reservas/GarmentThumb'

const days = (n: number) => `${n} dia(s)`

/** Linha de peça da fila: miniatura e texto levam à ficha; ações à direita. */
export function QueueRowItem({ row, actions, focus }: { row: QueueRow; actions: ReactNode; focus?: boolean }) {
  const href = useAppHref()
  const { garment: g, order, blockNote, nextRentalStart, daysOpen, waitingDays } = row
  const sub = order ? order.description || MAINTENANCE_KIND[order.kind] : (blockNote ?? `${g.colorPrimary} · tam. ${g.labelSize}`)
  const age = daysOpen !== null ? { text: `há ${days(daysOpen)}`, old: daysOpen >= 7 } : waitingDays !== null ? { text: `aguarda há ${days(waitingDays)}`, old: waitingDays >= 7 } : null
  return (
    <li className={['op-row', focus && 'focus'].filter(Boolean).join(' ')} data-focus={focus ? 'true' : undefined}>
      <Link to={href(`/acervo/${g.id}`)} className="op-who">
        <GarmentThumb garment={g} className="op-thumb" />
        <span className="op-txt">
          <span>
            <span className="op-name">{g.name}</span>
            <span className="op-code mono">{g.code}</span>
          </span>
          <span className="op-sub">{sub}</span>
          {(age || nextRentalStart) && (
            <span className="op-sub">
              {age && <span className={age.old ? 'op-old' : undefined}>{age.text}</span>}
              {nextRentalStart && (
                <span className="op-next">
                  {age ? ' · ' : ''}próxima reserva {dateBR(nextRentalStart).slice(0, 5)}
                </span>
              )}
            </span>
          )}
        </span>
      </Link>
      <div className="op-act">{actions}</div>
    </li>
  )
}

export type QueueCardProps = {
  title: string
  tone: Tone
  description: string
  rows: QueueRow[]
  wide?: boolean
  action(row: QueueRow): ReactNode
  /** Peças a destacar (vindo de `?reserva=`). */
  focusIds?: Set<string>
}

/** Card de uma fila: título, contagem (tom do estado), descrição e linhas; vazia mostra "Fila vazia.". */
export function QueueCard({ title, tone, description, rows, wide, action, focusIds }: QueueCardProps) {
  return (
    <section className={['card', wide && 'wide'].filter(Boolean).join(' ')} aria-label={title}>
      <div className="card-h op-card-h">
        <h3>{title}</h3>
        <Badge tone={tone} dot={false}>
          {rows.length}
        </Badge>
      </div>
      <p className="op-card-d">{description}</p>
      {rows.length === 0 ? (
        <EmptyState icon="check" title="Fila vazia." />
      ) : (
        <ul className="op-list">
          {rows.map((r) => (
            <QueueRowItem key={r.garment.id} row={r} actions={action(r)} focus={focusIds?.has(r.garment.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}
