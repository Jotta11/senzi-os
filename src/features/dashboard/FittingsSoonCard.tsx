import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { FITTING_STATE } from '@/data/labels'
import type { DashboardSummary } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Badge, Card, Icon, buttonClass } from '@/ui'

/** No lugar do Faturamento para quem não tem `financeiro.consolidated`: provas abertas de hoje e de amanhã. */
export function FittingsSoonCard({ rows, today }: { rows: NonNullable<DashboardSummary['fittingsSoon']>; today: string }) {
  const href = useAppHref()
  const { can } = usePermissions()
  return (
    <Card
      title="Provas de hoje e amanhã"
      actions={
        can('prova.view') ? (
          <Link to={href('/provas')} className={buttonClass('secondary', 'sm')}>
            Ver todas <Icon name="seta" size={13} />
          </Link>
        ) : undefined
      }
      flush
    >
      {rows.length === 0 ? (
        <div className="dash-empty">
          <b>Nenhuma prova em aberto</b>
          <span className="muted tiny">As provas aparecem aqui ao serem agendadas.</span>
        </div>
      ) : (
        <ul className="dash-ag-list">
          {rows.map((f) => {
            const tomorrow = f.at.slice(0, 10) > today
            const name = can('prova.view') ? (
              <Link to={href(`/provas/${f.id}`)} className="dash-ttl">
                {f.customerName}
              </Link>
            ) : (
              <span className="dash-ttl">{f.customerName}</span>
            )
            return (
              <li key={f.id} className="dash-ag-item">
                <span className="dash-hh mono">{f.at.slice(11, 16)}</span>
                <span className="dash-ag-tx">
                  {name}
                  <span className="dash-sub2">
                    {tomorrow ? 'amanhã · ' : ''}
                    <span className="mono">{f.code}</span> · {f.itemCount} peça(s) separada(s)
                  </span>
                </span>
                <span className="dash-ag-end">
                  <Badge tone={FITTING_STATE[f.state].tone}>{FITTING_STATE[f.state].label}</Badge>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
