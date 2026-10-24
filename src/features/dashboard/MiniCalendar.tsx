import { useState } from 'react'
import { Link } from 'react-router'
import { useAgendaMonthDays } from '@/data/hooks-agenda'
import { weekdayIndex, monthLabel } from '@/domain/dates'
import { addDays } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Card, Icon } from '@/ui'

const DOWS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, delta: number): string {
  const k = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta
  return `${Math.floor(k / 12)}-${pad((k % 12) + 1)}`
}
const daysIn = (month: string) => Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8, 10))

/** Mini calendário do mês (semana de segunda a domingo): clicar num dia abre `/agenda?dia=aaaa-mm-dd`. */
export function MiniCalendar({ today }: { today: string }) {
  const href = useAppHref()
  const [month, setMonth] = useState(today.slice(0, 7))
  const days = useAgendaMonthDays(month)
  const busy = new Set(days.data ?? [])
  const label = monthLabel(`${month}-01`)
  const [monthName, year] = label.split(' de ')
  const cells: (number | null)[] = [...Array(weekdayIndex(`${month}-01`)).fill(null), ...Array.from({ length: daysIn(month) }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))

  return (
    <Card
      className="dash-cal-card"
      title={<span className="display dash-cal-title">{monthName}</span>}
      meta={<span className="muted tiny">{year}</span>}
      actions={
        <>
          <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <Icon name="chevronL" size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <Icon name="chevron" size={15} />
          </button>
        </>
      }
    >
      <table role="grid" aria-label={`Calendário de ${label}`} className="dash-cal">
        <thead>
          <tr>
            {DOWS.map((d) => (
              <th key={d} scope="col" abbr={d}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={i}>
              {w.map((d, j) => {
                if (d == null) return <td key={j} />
                const iso = `${month}-${pad(d)}`
                const has = busy.has(iso)
                return (
                  <td key={j} aria-selected={iso === today ? true : undefined}>
                    <Link
                      to={href(`/agenda?dia=${iso}`)}
                      className={['dash-cal-d', iso === today && 'today', iso < today && 'past'].filter(Boolean).join(' ')}
                      aria-label={`${pad(d)}/${month.slice(5)}/${month.slice(0, 4)}${has ? ', com compromissos' : ''}`}
                    >
                      {d}
                      {has && <i aria-hidden="true" />}
                    </Link>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dash-cal-legend muted tiny">
        <b className="dash-cal-now" aria-hidden="true" /> hoje · <i aria-hidden="true" /> dia com compromissos · clique para abrir a agenda
      </p>
    </Card>
  )
}
