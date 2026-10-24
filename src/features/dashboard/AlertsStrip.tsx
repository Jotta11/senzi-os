import { useState } from 'react'
import { Link } from 'react-router'
import { ALERT_SEVERITY } from '@/data/labels'
import type { Alert } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Badge, ICONS, Icon, type IconName } from '@/ui'

const TONE = { critico: 'red', atencao: 'amber', info: 'stone' } as const
const SHOWN = 6
const iconOf = (name: string): IconName => (name in ICONS ? (name as IconName) : 'alerta')

/** Alertas no topo: até 6 boxes (críticos primeiro) + "Ver todos (N)"; cada box é um link inteiro com rótulo de severidade. */
export function AlertsStrip({ alerts }: { alerts: Alert[] }) {
  const href = useAppHref()
  const [all, setAll] = useState(false)
  const critical = alerts.filter((a) => a.sev === 'critico').length
  const shown = all ? alerts : alerts.slice(0, SHOWN)
  return (
    <section className="dash-alerts" aria-labelledby="dash-alertas-t">
      <div className="dash-section-h">
        <h2 id="dash-alertas-t">Alertas</h2>
        {critical > 0 ? <Badge tone="red">{critical === 1 ? '1 crítico' : `${critical} críticos`}</Badge> : <Badge tone="green">tudo sob controle</Badge>}
        {alerts.length > 0 && <span className="muted tiny">{alerts.length === 1 ? '1 pendência' : `${alerts.length} pendências`}</span>}
        {alerts.length > SHOWN && (
          <button type="button" className="btn btn-ghost btn-sm dash-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Mostrar menos' : `Ver todos (${alerts.length})`}
          </button>
        )}
      </div>
      {alerts.length === 0 ? (
        <p className="note green">
          <Icon name="check" size={15} />
          <span>
            <b>Nenhum alerta.</b> Devoluções, pagamentos e prazos estão em dia.
          </span>
        </p>
      ) : (
        <div className="dash-alert-row">
          {shown.map((a, i) => (
            <Link key={`${a.kind}-${a.route}-${i}`} to={href(a.route)} className={`dash-alert tone-${TONE[a.sev]}`}>
              <span className="dash-alert-ic">
                <Icon name={iconOf(a.icon)} size={15} />
              </span>
              <span className="dash-alert-tx">
                <i>{ALERT_SEVERITY[a.sev].label}</i>
                <b>{a.title}</b>
                {a.detail && <span>{a.detail}</span>}
              </span>
              <Icon name="chevron" size={14} className="dash-alert-go" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
