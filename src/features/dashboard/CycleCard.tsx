import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import type { DashboardSummary } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Badge, Card, Icon, buttonClass, type Tone } from '@/ui'

const ROWS: { key: 'inspecao' | 'higienizacao' | 'ajuste' | 'manutencao' | 'bloqueado'; label: string; tone: Tone }[] = [
  { key: 'inspecao', label: 'Inspeção', tone: 'amber' },
  { key: 'higienizacao', label: 'Higienização', tone: 'teal' },
  { key: 'ajuste', label: 'Ajuste', tone: 'ochre' },
  { key: 'manutencao', label: 'Manutenção', tone: 'red' },
  { key: 'bloqueado', label: 'Bloqueado', tone: 'stone' },
]

/** Ciclo operacional: peças em cada etapa, comprometidas, fora da loja e taxa de ocupação do acervo. */
export function CycleCard({ cycle }: { cycle: DashboardSummary['cycle'] }) {
  const href = useAppHref()
  const { can } = usePermissions()
  return (
    <Card
      title="Ciclo operacional"
      actions={
        can('operacao.view') ? (
          <Link to={href('/operacao')} className={buttonClass('secondary', 'sm')}>
            Ver operação <Icon name="seta" size={13} />
          </Link>
        ) : undefined
      }
    >
      <div className="dash-ciclo">
        {cycle.inspecao > 0 && (
          <div className="note amber">
            <Icon name="alerta" size={15} />
            <span>
              <b>{cycle.inspecao} peça(s) aguardando inspeção.</b> Enquanto não forem inspecionadas, não voltam ao acervo e não podem ser reservadas.
            </span>
          </div>
        )}
        <ul className="dash-ciclo-list">
          {ROWS.map((r) => (
            <li key={r.key} className="spread">
              <Badge tone={r.tone}>{r.label}</Badge>
              <span className="num dash-strong">{cycle[r.key]}</span>
            </li>
          ))}
        </ul>
        <hr className="sep" />
        <div className="spread">
          <span className="muted">Comprometidas com reservas futuras</span>
          <span className="num dash-strong">{cycle.reservado}</span>
        </div>
        <div className="spread">
          <span className="muted">Fora da loja agora</span>
          <span className="num dash-strong">{cycle.foraDaLoja}</span>
        </div>
        <div className="spread">
          <span className="muted">Taxa de ocupação do acervo</span>
          <span className="num dash-strong">{Math.round(cycle.occupancyRate * 100)}%</span>
        </div>
      </div>
    </Card>
  )
}
