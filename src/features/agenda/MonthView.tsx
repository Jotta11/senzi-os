import type { CSSProperties } from 'react'
import { useAgendaRange } from '@/data/hooks-agenda'
import { AG_KIND } from '@/data/labels-ops'
import { monthLabel, shiftMonth } from '@/domain/dates'
import { AgendaShell, type ShellProps } from './AgendaShell'
import { dayLabel, monthGrid } from './agendaDates'

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const MAX_TAGS = 3

type Props = {
  shell: ShellProps
  date: string
  today: string
  onMove(date: string): void
  /** Clique num dia: abre a vista Dia daquela data. */
  onOpenDay(date: string): void
}

/** Vista Mês — calendário segunda → domingo; cada dia mostra até 3 compromissos e "+N". */
export function MonthView({ shell, date, today, onMove, onOpenDay }: Props) {
  const cells = monthGrid(date)
  const range = useAgendaRange(cells[0]!.date, cells[cells.length - 1]!.date)
  const byDate = new Map((range.data ?? []).map((d) => [d.date, d]))
  const month = date.slice(0, 7)

  return (
    <AgendaShell
      {...shell}
      subtitle={monthLabel(date)}
      onPrev={() => onMove(`${shiftMonth(month, -1)}-01`)}
      onNext={() => onMove(`${shiftMonth(month, 1)}-01`)}
      onToday={() => onMove(today)}
      error={range.isError}
    >
      <section className="card mg" aria-busy={range.isPending || undefined}>
        <div className="mg-grid" role="group" aria-label={monthLabel(date)}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="mg-dow" aria-hidden="true">
              {w}
            </div>
          ))}
          {cells.map(({ date: d, inMonth }) => {
            const items = (byDate.get(d)?.items ?? []).filter((i) => shell.filter === 'todos' || i.kind === shell.filter)
            const label = `${dayLabel(d)}, ${items.length === 0 ? 'sem compromissos' : `${items.length} compromisso${items.length === 1 ? '' : 's'}`}`
            return (
              <button
                key={d}
                type="button"
                className={['mg-day', !inMonth && 'out', d === today && 'today'].filter(Boolean).join(' ')}
                aria-label={label}
                onClick={() => onOpenDay(d)}
              >
                <span className="mg-n">{Number(d.slice(8, 10))}</span>
                {items.slice(0, MAX_TAGS).map((i) => (
                  <span key={i.id} className="mg-tag" style={{ '--ev-tone': `var(--t-${AG_KIND[i.kind].tone})`, '--ev-bg': `var(--t-${AG_KIND[i.kind].tone}-bg)` } as CSSProperties}>
                    <span className="mg-tag-t">
                      {i.time} {AG_KIND[i.kind].label}
                    </span>
                  </span>
                ))}
                {items.length > MAX_TAGS && <span className="mg-more">+{items.length - MAX_TAGS}</span>}
              </button>
            )
          })}
        </div>
      </section>
    </AgendaShell>
  )
}
