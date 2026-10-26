import { useAgendaRange } from '@/data/hooks-agenda'
import type { AgendaItem } from '@/data/types'
import { addDays } from '@/lib/format'
import { Badge, Card, EmptyState } from '@/ui'
import { AgendaShell, type ShellProps } from './AgendaShell'
import { dayLabel, dayTitle } from './agendaDates'
import { GarmentBlocks, ItemCard } from './DayColumn'

type Props = {
  shell: ShellProps
  date: string
  today: string
  onMove(date: string): void
  onEdit?(date: string, item: AgendaItem): void
}

/** Vista Dia — compromissos do dia em linhas largas (com reserva, peças e observação) e, ao lado, as peças paradas. */
export function DayView({ shell, date, today, onMove, onEdit }: Props) {
  const range = useAgendaRange(date, date)
  const day = range.data?.find((d) => d.date === date)
  const items = (day?.items ?? []).filter((i) => shell.filter === 'todos' || i.kind === shell.filter)
  const blocks = day ? day.garmentBlocks.length + day.moreBlocks : 0

  return (
    <AgendaShell {...shell} subtitle={dayTitle(date)} onPrev={() => onMove(addDays(date, -1))} onNext={() => onMove(addDays(date, 1))} onToday={() => onMove(today)} error={range.isError}>
      <div className="ag-dayview" aria-busy={range.isPending || undefined}>
        <Card
          title="Compromissos"
          meta={
            <>
              {date === today && <Badge tone="wine">hoje</Badge>}
              <span className="kb-count">{items.length}</span>
            </>
          }
          flush
          role="region"
          aria-label={dayLabel(date)}
        >
          {range.isPending ? (
            <p className="kb-loading ag-pad">Carregando a agenda…</p>
          ) : items.length === 0 ? (
            <EmptyState icon="agenda" title="Nenhum compromisso neste dia" description={shell.filter === 'todos' ? undefined : 'Nenhum deste tipo — escolha "Todos" para ver o resto.'} />
          ) : (
            <ul className="ag-rows">
              {items.map((i) => (
                <li key={i.id}>
                  <ItemCard item={i} date={date} onEdit={onEdit} variant="row" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Peças paradas" meta={<span className="kb-count">{blocks}</span>}>
          {day && blocks > 0 ? (
            <GarmentBlocks day={day} className="kb-blocks ag-blocks" />
          ) : (
            !range.isPending && <EmptyState icon="acervo" title="Nenhuma peça parada" description="Higienização, manutenção, ajuste, editorial e bloqueios aparecem aqui." />
          )}
        </Card>
      </div>
    </AgendaShell>
  )
}
