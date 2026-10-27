import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useDashboard, type DashboardRange } from '@/data/hooks-painel'
import { longDate } from '@/domain/dates'
import { dateBR } from '@/lib/format'
import { useToday } from '@/lib/useToday'
import { useAppHref } from '@/shell/appPath'
import { Button, Icon, buttonClass } from '@/ui'
import { CustomerForm } from '../clientes/CustomerForm'
import { ScheduleFittingModal } from '../provas/ScheduleFittingModal'
import { AlertsStrip } from './AlertsStrip'
import { CycleCard } from './CycleCard'
import { DayTiles } from './DayTiles'
import { FittingsSoonCard } from './FittingsSoonCard'
import { MiniCalendar } from './MiniCalendar'
import { RevenueCard } from './RevenueCard'
import { TodayAgenda } from './TodayAgenda'
import { visibleAlerts } from './alertAccess'
import './dashboard.css'
import '../acervo/acervo.css'

/** "Sexta-feira, 23/10/2026". */
function subtitle(iso: string): string {
  const w = longDate(iso).split(',')[0]!
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${dateBR(iso)}`
}

/** Dashboard "Hoje": alertas → números do dia → agenda de hoje + mini calendário → faturamento (ou provas) | ciclo operacional. */
export function DashboardPage() {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const [range, setRange] = useState<DashboardRange>('30')
  const [dialog, setDialog] = useState<'prova' | 'cliente' | null>(null)
  const q = useDashboard(range)
  const s = q.data
  const alerts = useMemo(() => (s ? visibleAlerts(s.alerts, can) : []), [s, can])
  const storeToday = useToday()
  const today = s?.today ?? storeToday

  return (
    <div className="dash-main">
      <header className="dash-topbar">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="display">Hoje</h1>
          <p className="dash-sub">{subtitle(today)}</p>
        </div>
        <div className="dash-actions">
          {can('prova.manage') && (
            <Button icon="prova" onClick={() => setDialog('prova')}>
              Agendar prova
            </Button>
          )}
          {can('cliente.create') && (
            <Button icon="clientes" onClick={() => setDialog('cliente')}>
              Nova cliente
            </Button>
          )}
          {can('reserva.create') && (
            <Link to={href('/reservas?nova=1')} className={buttonClass('primary')}>
              <Icon name="plus" size={15} /> Nova reserva
            </Link>
          )}
        </div>
      </header>

      {!s ? (
        <div className="dash-view" aria-busy={q.isPending || undefined}>
          {q.isError ? (
            <p className="note red">
              <Icon name="alerta" size={15} />
              <span>
                <b>Não foi possível carregar o painel.</b> Tente atualizar a página.
              </span>
            </p>
          ) : (
            <div className="dash-skel">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      ) : (
        <div className="dash-view">
          <AlertsStrip alerts={alerts} />
          <DayTiles tiles={s.tiles} today={s.today} />
          <section className="dash-agenda-block" aria-label="Agenda de hoje e calendário">
            <TodayAgenda items={s.agendaToday} />
            <MiniCalendar today={s.today} />
          </section>
          <div className="dash-grid-2">
            {can('financeiro.consolidated') && s.finance ? <RevenueCard finance={s.finance} range={range} onRange={setRange} /> : <FittingsSoonCard rows={s.fittingsSoon ?? []} today={s.today} />}
            <CycleCard cycle={s.cycle} />
          </div>
        </div>
      )}

      <ScheduleFittingModal open={dialog === 'prova'} onClose={() => setDialog(null)} />
      <CustomerForm open={dialog === 'cliente'} onClose={() => setDialog(null)} onCreated={(c) => navigate(href(`/clientes/${c.id}`))} />
    </div>
  )
}
