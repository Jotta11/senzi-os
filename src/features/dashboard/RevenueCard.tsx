import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import type { DashboardRange } from '@/data/hooks-painel'
import type { DashboardSummary } from '@/data/types'
import { brl } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Card, Icon, buttonClass } from '@/ui'
import { ColumnChart } from '../financeiro/charts'

const OPTIONS: { value: DashboardRange; label: string; short: string }[] = [
  { value: '7', label: 'Últimos 7 dias', short: 'Últimos 7 dias' },
  { value: '30', label: 'Este mês', short: 'Este mês' },
  { value: '90', label: '90 dias', short: 'Últimos 90 dias' },
]
const mil = (n: number) => `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`

/** Faturamento recebido (só com `financeiro.consolidated`): período, três números e 7 meses em colunas (último = corrente parcial). */
export function RevenueCard({ finance, range, onRange }: { finance: NonNullable<DashboardSummary['finance']>; range: DashboardRange; onRange(r: DashboardRange): void }) {
  const href = useAppHref()
  const { can } = usePermissions()
  const short = OPTIONS.find((o) => o.value === range)!.short
  return (
    <Card
      title="Faturamento recebido"
      meta={<span className="muted tiny">7 meses · corrente parcial</span>}
      actions={
        <>
          <div className="ac-seg" role="group" aria-label="Período do faturamento">
            {OPTIONS.map((o) => (
              <button key={o.value} type="button" aria-pressed={range === o.value} onClick={() => onRange(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          {can('financeiro.view') && (
            <Link to={href('/financeiro')} className={buttonClass('secondary', 'sm')}>
              Ver financeiro completo <Icon name="seta" size={13} />
            </Link>
          )}
        </>
      }
    >
      <div className="dash-kpis">
        <div>
          <div className="eyebrow">{short}</div>
          <div className="display dash-kpi">{brl(finance.revenue, { cents: false })}</div>
        </div>
        <div>
          <div className="eyebrow">Ticket médio</div>
          <div className="display dash-kpi">{brl(finance.ticket, { cents: false })}</div>
        </div>
        <div>
          <div className="eyebrow">Locações</div>
          <div className="display dash-kpi">{finance.rentals}</div>
        </div>
      </div>
      <ColumnChart columns={finance.series.map((s) => ({ label: s.label, value: s.value }))} ariaLabel="Faturamento recebido por mês" format={mil} />
    </Card>
  )
}
