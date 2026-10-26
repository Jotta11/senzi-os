import type { ReactNode } from 'react'
import { AG_KIND } from '@/data/labels-ops'
import { Button, Chips, Icon, type ChipOption } from '@/ui'
import { KIND_ORDER, type AgendaFilter, type AgendaView } from './agendaView'

const VIEWS: { value: AgendaView; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
]
const CHIPS: ChipOption<AgendaFilter>[] = [{ value: 'todos', label: 'Todos' }, ...KIND_ORDER.map((k) => ({ value: k as AgendaFilter, label: AG_KIND[k].label }))]

/** O que é comum às três vistas: seletor de vista, filtro por tipo e "Novo compromisso". */
export type ShellProps = {
  view: AgendaView
  onView(v: AgendaView): void
  filter: AgendaFilter
  onFilter(f: AgendaFilter): void
  /** Só com `agenda.manage`. */
  onNew?(): void
}

type Props = ShellProps & {
  subtitle: string
  onPrev(): void
  onNext(): void
  onToday(): void
  error?: boolean
  children: ReactNode
}

/** Cabeçalho da Agenda (título, período, Dia/Semana/Mês, setas, Hoje) + chips de tipo; o corpo vem da vista. */
export function AgendaShell({ view, onView, filter, onFilter, onNew, subtitle, onPrev, onNext, onToday, error, children }: Props) {
  return (
    <div className="kb-page">
      <header className="kb-head">
        <div className="kb-title">
          <h1 className="display">Agenda</h1>
          <p className="kb-sub" aria-live="polite">
            {subtitle}
          </p>
        </div>
        <div className="kb-actions">
          <div className="ac-seg" role="group" aria-label="Vista da agenda">
            {VIEWS.map((v) => (
              <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => onView(v.value)}>
                {v.label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label="Anterior" onClick={onPrev}>
            <Icon name="chevronL" size={16} />
          </button>
          <Button onClick={onToday}>Hoje</Button>
          <button type="button" className="icon-btn" aria-label="Próximo" onClick={onNext}>
            <Icon name="chevron" size={16} />
          </button>
          {onNew && (
            <Button variant="primary" icon="plus" onClick={onNew}>
              Novo compromisso
            </Button>
          )}
        </div>
      </header>

      <div className="kb-body">
        <Chips label="Filtrar por tipo" options={CHIPS} value={filter} onChange={onFilter} />
        {error && (
          <div className="note red" role="alert">
            <Icon name="alerta" size={15} />
            <span>Não foi possível carregar a agenda.</span>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
