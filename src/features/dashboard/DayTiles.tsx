import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import type { DashboardSummary } from '@/data/types'
import { useAppHref } from '@/shell/appPath'

type Tile = { label: string; value: number; desc: string; to: string | null; alert?: boolean }

/** Cinco números do dia, discretos; cada um leva à página respectiva quando o perfil pode abri-la. */
export function DayTiles({ tiles, today }: { tiles: DashboardSummary['tiles']; today: string }) {
  const href = useAppHref()
  const { can } = usePermissions()
  const agenda = can('agenda.view') ? `/agenda?dia=${today}` : null
  const list: Tile[] = [
    { label: 'Retiradas hoje', value: tiles.pickupsToday.count, desc: tiles.pickupsToday.firstNames.join(', ') || 'nenhuma agendada', to: agenda },
    { label: 'Devoluções hoje', value: tiles.returnsToday, desc: tiles.returnsToday > 0 ? 'previstas até 18h' : 'nenhuma prevista', to: agenda },
    { label: 'Atrasadas', value: tiles.overdue, desc: tiles.overdue > 0 ? 'ação imediata' : 'nada em atraso', to: can('reserva.view') ? '/reservas?f=rua' : null, alert: tiles.overdue > 0 },
    { label: 'Eventos hoje', value: tiles.eventsToday, desc: tiles.eventsToday > 0 ? 'peças em uso na rua' : 'agenda livre', to: agenda },
    { label: 'Peças disponíveis', value: tiles.availableGarments, desc: `de ${tiles.totalGarments} no acervo`, to: can('acervo.view') ? '/acervo?st=disponivel' : null },
  ]
  return (
    <ul className="dash-tiles" aria-label="Resumo do dia">
      {list.map((t) => {
        const body = (
          <>
            <span className="dash-tile-l">{t.label}</span>
            <b className="display">{t.value}</b>
            <span className="dash-tile-d">{t.desc}</span>
          </>
        )
        return (
          <li key={t.label} className={t.alert ? 'alert' : undefined}>
            {t.to ? (
              <Link to={href(t.to)} className="dash-tile">
                {body}
              </Link>
            ) : (
              <div className="dash-tile">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
