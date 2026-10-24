import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { FIT_RUNS_LABEL } from '@/data/labels'
import { FIT_OUTCOME } from '@/data/labels-ops'
import type { FitOutcome, FittingDetail } from '@/data/types'
import { brl } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Icon } from '@/ui'
import { Thumb } from './PickGarmentModal'

type Item = FittingDetail['items'][number]

/** Chips de resultado (o ativo fica `on`); "Não provou" é só o estado inicial, não é chip. */
const CHIPS: FitOutcome[] = ['favorita', 'serviu', 'gostou', 'precisa_ajuste', 'apertada', 'larga', 'nao_gostou', 'descartada']

export type FittingItemRowProps = {
  item: Item
  /** Prova aberta + `prova.manage`: mostra chips, observação e retirar. */
  editable: boolean
  busy?: boolean
  onOutcome(outcome: FitOutcome): void
  onNote(): void
  onRemove(): void
  onToggleFavorite(): void
}

/** Linha de peça da prova: miniatura, nome, caimento, nota, chips de resultado e ações. */
export function FittingItemRow({ item, editable, busy, onOutcome, onNote, onRemove, onToggleFavorite }: FittingItemRowProps) {
  const { can } = usePermissions()
  const href = useAppHref()
  const g = item.garment
  const out = FIT_OUTCOME[item.outcome]
  const sub = [g.colorPrimary, `tam. ${g.labelSize}`, brl(g.rentalPrice, { cents: false }), g.fitRuns ? FIT_RUNS_LABEL[g.fitRuns] : null].filter(Boolean).join(' · ')
  const thumb = <Thumb garment={g} />
  return (
    <li className="pv-item">
      {can('acervo.view') ? (
        <Link to={href(`/acervo/${g.id}`)} aria-label={`Abrir ${g.name}`} className="pv-thumb-link">
          {thumb}
        </Link>
      ) : (
        thumb
      )}
      <div className="pv-item-t">
        <span className="pv-item-n">
          <span>{g.name}</span> <span className="mono tiny muted">{g.code}</span>
          {item.favorite && (
            <span className="pv-fav" title="Favorita da cliente">
              <Icon name="coracao" size={13} />
              <span className="sr-only">Favorita da cliente</span>
            </span>
          )}
        </span>
        <span className="tiny muted">{sub}</span>
        {item.note && <span className="pv-item-q">“{item.note}”</span>}
        {editable && (
          <div className="pv-chips" role="group" aria-label={`Resultado de ${g.name}`}>
            {CHIPS.map((o) => (
              <button key={o} type="button" className="chip" aria-pressed={item.outcome === o} disabled={busy} onClick={() => onOutcome(o)}>
                {FIT_OUTCOME[o].label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pv-item-actions">
        <Badge tone={out.tone}>{out.label}</Badge>
        {editable && (
          <button type="button" className="pv-icon-btn" title="Observação da atendente" aria-label={`Observação de ${g.name}`} onClick={onNote}>
            <Icon name="editar" size={15} />
          </button>
        )}
        {editable && can('cliente.edit') && (
          <button
            type="button"
            className={['pv-icon-btn', item.favorite && 'is-on'].filter(Boolean).join(' ')}
            title={item.favorite ? 'Remover dos favoritos' : 'Marcar como favorita'}
            aria-label={item.favorite ? `Remover ${g.name} dos favoritos` : `Marcar ${g.name} como favorita`}
            aria-pressed={item.favorite}
            onClick={onToggleFavorite}
          >
            <Icon name="coracao" size={15} />
          </button>
        )}
        {editable && (
          <button type="button" className="pv-icon-btn" title="Retirar da prova" aria-label={`Retirar ${g.name}`} disabled={busy} onClick={onRemove}>
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
    </li>
  )
}
