import { useState } from 'react'
import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { AG_KIND } from '@/data/labels'
import type { AgendaItem } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Badge, Card, Icon, buttonClass } from '@/ui'
import { ReservationDialog } from './ReservationDialog'

type Dialog = { id: string; mode: 'pickup' | 'return' } | null

/** Agenda de hoje: hora, título, peças, tipo e botões contextuais (Retirar, Devolver, Abrir prova). */
export function TodayAgenda({ items }: { items: AgendaItem[] }) {
  const href = useAppHref()
  const { can } = usePermissions()
  const [dialog, setDialog] = useState<Dialog>(null)

  /** Destino do item: prova → reserva → cliente (só se o perfil pode abrir). */
  function target(i: AgendaItem): string | null {
    if (i.fitting && can('prova.view')) return `/provas/${i.fitting.id}`
    if (i.reservation && can('reserva.view')) return `/reservas/${i.reservation.id}`
    if (i.customer && can('cliente.view')) return `/clientes/${i.customer.id}`
    return null
  }

  return (
    <Card
      title="Agenda de hoje"
      meta={<span className="muted tiny">{items.length === 1 ? '1 compromisso' : `${items.length} compromissos`}</span>}
      actions={
        can('agenda.view') ? (
          <Link to={href('/agenda')} className={buttonClass('ghost', 'sm')}>
            Ver agenda <Icon name="seta" size={13} />
          </Link>
        ) : undefined
      }
      flush
    >
      {items.length === 0 ? (
        <div className="dash-empty">
          <b>Nenhum compromisso hoje</b>
          <span className="muted tiny">A agenda aparece aqui automaticamente ao criar reservas e provas.</span>
        </div>
      ) : (
        <ul className="dash-ag-list">
          {items.map((i) => {
            const k = AG_KIND[i.kind]
            const to = target(i)
            const title = i.internal ? i.title : i.customer ? `${k.label} — ${i.customer.fullName}` : i.title || k.label
            const codes = i.garments.map((g) => g.code).join(', ')
            const extra = i.notes ?? (!i.internal && i.customer && i.title !== k.label ? i.title : null)
            const cls = ['dash-ag-item', i.internal && 'is-internal', i.state === 'concluido' && 'is-done'].filter(Boolean).join(' ')
            const canPickup = i.kind === 'retirada' && !!i.reservation && can('reserva.pickup') && (i.pendingPickupItems ?? 0) > 0 && i.state === 'agendado'
            const canReturn = i.kind === 'devolucao' && !!i.reservation && can('reserva.return') && (i.itemsOut ?? 0) > 0 && i.state === 'agendado'
            const canFitting = i.kind === 'prova' && !!i.fitting && can('prova.view')
            return (
              <li key={i.id} className={cls} data-internal={i.internal || undefined}>
                <span className="dash-hh mono">{i.time}</span>
                <span className="dash-ag-tx">
                  {to ? (
                    <Link to={href(to)} className="dash-ttl">
                      {title}
                    </Link>
                  ) : (
                    <span className="dash-ttl">{title}</span>
                  )}
                  {(codes || extra) && (
                    <span className="dash-sub2">
                      {codes && <span className="mono">{codes}</span>}
                      {codes && extra ? ' · ' : ''}
                      {extra}
                    </span>
                  )}
                </span>
                <span className="dash-ag-end">
                  <Badge tone={k.tone}>{k.label}</Badge>
                  {canPickup && (
                    <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setDialog({ id: i.reservation!.id, mode: 'pickup' })}>
                      Retirar
                    </button>
                  )}
                  {canReturn && (
                    <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setDialog({ id: i.reservation!.id, mode: 'return' })}>
                      Devolver
                    </button>
                  )}
                  {canFitting && (
                    <Link to={href(`/provas/${i.fitting!.id}`)} className={buttonClass('secondary', 'sm')}>
                      Abrir prova
                    </Link>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {dialog && <ReservationDialog id={dialog.id} mode={dialog.mode} onClose={() => setDialog(null)} />}
    </Card>
  )
}
