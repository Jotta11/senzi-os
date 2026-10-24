import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { GARMENT_STATE } from '@/data/labels'
import { ITEM_STATE } from '@/data/labels-ops'
import type { ReservationDetail } from '@/data/types'
import { brl, dateTimeBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, Icon } from '@/ui'
import { GarmentThumb } from './GarmentThumb'

export type ReservationItemsProps = {
  r: ReservationDetail
  canEditDraft: boolean
  onAdd(): void
  onRemove(itemId: string): void
  removing: boolean
}

/** Card "Peças da reserva": miniatura, dados, estado do item e valor líquido (só com `financeiro.view`). Rascunho: adicionar/remover. */
export function ReservationItems({ r, canEditDraft, onAdd, onRemove, removing }: ReservationItemsProps) {
  const { can } = usePermissions()
  const href = useAppHref()
  const money = can('financeiro.view')
  const live = r.items
  const out = live.filter((i) => i.itemState === 'retirado').length
  const back = live.filter((i) => i.itemState === 'devolvido' || i.itemState === 'inspecionado').length
  const draft = r.state === 'rascunho' && canEditDraft
  return (
    <section className="card" aria-labelledby="rd-items-t">
      <div className="card-h">
        <h3 id="rd-items-t">Peças da reserva</h3>
        <span className="muted tiny">
          {live.length} {live.length === 1 ? 'item' : 'itens'} · {out} com a cliente · {back} de volta
        </span>
        {draft && (
          <div className="actions">
            <Button size="sm" icon="plus" onClick={onAdd}>
              Adicionar peça
            </Button>
          </div>
        )}
      </div>
      <ul className="rd-items">
        {live.map((it) => {
          const g = r.garments.find((x) => x.id === it.garmentId)
          if (!g) return null
          const st = ITEM_STATE[it.itemState]
          const to = href(`/acervo/${g.id}`)
          return (
            <li key={it.id} className="rd-item">
              <Link to={to} className="rd-thumb-link" aria-label={`Abrir ${g.name}`} tabIndex={-1}>
                <GarmentThumb garment={g} />
              </Link>
              <div className="rd-item-c">
                <Link to={to} className="rd-item-n">
                  <b>{g.name}</b> <span className="mono tiny muted">{g.code}</span>
                </Link>
                <span className="tiny muted">
                  {g.colorPrimary} · tam. {g.labelSize} · estado da peça: {GARMENT_STATE[g.state].label}
                </span>
                {it.alterationNotes && (
                  <span className="tiny rd-alter">
                    <Icon name="costura" size={12} /> {it.alterationNotes}
                  </span>
                )}
                {it.pickupNote && <span className="tiny muted">Retirada: {it.pickupNote}</span>}
                {it.returnNote && <span className="tiny muted">Devolução: {it.returnNote}</span>}
                <span className="tiny muted">
                  {it.pickedUpAt ? `saiu ${dateTimeBR(it.pickedUpAt).slice(0, 16)}` : 'ainda na loja'}
                  {it.returnedAt ? ` · voltou ${dateTimeBR(it.returnedAt).slice(0, 16)}` : ''}
                </span>
              </div>
              <div className="rd-item-r">
                <Badge tone={st.tone}>{st.label}</Badge>
                {money && (
                  <>
                    <b className="rd-net">{brl(it.netRevenue)}</b>
                    {it.allocatedOrderDiscount > 0 && (
                      <span className="tiny muted">
                        {brl(it.grossAmount)} − {brl(it.allocatedOrderDiscount)} de rateio
                      </span>
                    )}
                  </>
                )}
                {draft && (
                  <Button size="sm" variant="ghost" icon="lixo" disabled={removing} onClick={() => onRemove(it.id)} aria-label={`Remover ${g.name}`}>
                    Remover
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
