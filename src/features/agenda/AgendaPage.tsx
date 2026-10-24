import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useAgendaRange } from '@/data/hooks-agenda'
import { isValidISODate } from '@/data/validation'
import { AG_KIND } from '@/data/labels-ops'
import type { AgendaItem, AppointmentKind } from '@/data/types'
import { addDays, todayISO } from '@/lib/format'
import { Button, Chips, Icon, type ChipOption } from '@/ui'
import { AppointmentModal } from './AppointmentModal'
import { rangeLabel } from './agendaDates'
import { DayColumn } from './DayColumn'
import './agenda.css'

type Filter = 'todos' | AppointmentKind
const KIND_ORDER: AppointmentKind[] = ['prova', 'retirada', 'devolucao', 'atendimento', 'evento', 'servico', 'interno']
const CHIPS: ChipOption<Filter>[] = [{ value: 'todos', label: 'Todos' }, ...KIND_ORDER.map((k) => ({ value: k as Filter, label: AG_KIND[k].label }))]
const isFilter = (v: string | null): v is Filter => v === 'todos' || KIND_ORDER.includes(v as AppointmentKind)
const isISODate = (v: string | null): v is string => isValidISODate(v)
const GAP = 12

type Metrics = { step: number; visible: number }
/** Largura de um passo (coluna + vão) e quantas colunas cabem; `null` sem layout (jsdom). */
function measure(el: HTMLElement): Metrics | null {
  const cols = el.querySelectorAll<HTMLElement>('.kb-day')
  const first = cols[0]
  if (!first || first.offsetWidth <= 0) return null
  const step = cols.length > 1 ? cols[1]!.offsetLeft - first.offsetLeft : first.offsetWidth + GAP
  return step > 0 ? { step, visible: Math.max(1, Math.round(el.clientWidth / step)) } : null
}

/** Rola o contêiner para que a coluna `index` fique na posição `slot` (0 = 1ª visível); sem `scrollTo`, ajusta `scrollLeft`. */
function scrollToColumn(el: HTMLElement, index: number, slot: number, smooth: boolean) {
  const m = measure(el)
  if (!m) return
  const left = Math.max(0, (index - slot) * m.step)
  if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' })
  else el.scrollLeft = left
}

/**
 * Agenda — kanban de dias (um único quadro, 4 colunas visíveis, rolagem horizontal com snap). Janela de hoje −14 a
 * hoje +45 (ampliada se `?dia=` cair fora). Abre com hoje (ou `?dia=aaaa-mm-dd`) na 2ª coluna visível; as setas
 * movem uma coluna; "Hoje" recentra. Chips filtram por tipo (`?tipo=`). Compromissos manuais abrem a edição;
 * os automáticos levam à prova, reserva ou cliente.
 */
export function AgendaPage() {
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const diaParam = params.get('dia')
  const anchor = isISODate(diaParam) ? diaParam : today
  const tipoParam = params.get('tipo')
  const filter: Filter = isFilter(tipoParam) ? tipoParam : 'todos'

  const from = addDays(anchor < today ? anchor : today, anchor < today ? -7 : -14)
  const to = addDays(anchor > today ? anchor : today, anchor > today ? 14 : 45)
  const range = useAgendaRange(from, to)
  const days = useMemo(() => range.data ?? [], [range.data])
  const indexOf = useCallback((date: string) => days.findIndex((d) => d.date === date), [days])

  const strip = useRef<HTMLDivElement>(null)
  const [first, setFirst] = useState<number | null>(null)
  const [visible, setVisible] = useState(4)
  const [modal, setModal] = useState<{ date: string; item?: AgendaItem } | null>(null)

  const anchorIdx = indexOf(anchor)
  const firstIdx = first ?? Math.max(0, anchorIdx - 1)

  // abre com o dia pedido na 2ª coluna visível (1ª se só cabe uma)
  const placed = useRef<string | null>(null)
  useLayoutEffect(() => {
    const el = strip.current
    if (!el || anchorIdx < 0 || placed.current === anchor) return
    placed.current = anchor
    const m = measure(el)
    setFirst(Math.max(0, anchorIdx - ((m?.visible ?? visible) >= 2 ? 1 : 0)))
    scrollToColumn(el, anchorIdx, (m?.visible ?? visible) >= 2 ? 1 : 0, false)
  }, [anchor, anchorIdx, visible])

  // a rolagem (mouse, toque, snap) atualiza o intervalo do subtítulo
  const onScroll = () => {
    const el = strip.current
    const m = el && measure(el)
    if (!el || !m) return
    setFirst(Math.max(0, Math.round(el.scrollLeft / m.step)))
    setVisible(m.visible)
  }
  useEffect(() => {
    const onResize = () => {
      const el = strip.current
      const m = el && measure(el)
      if (m) setVisible(m.visible)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function goTo(index: number) {
    const el = strip.current
    const i = Math.min(Math.max(0, index), Math.max(0, days.length - 1))
    setFirst(i)
    if (el) scrollToColumn(el, i, 0, true)
  }
  const goToday = () => {
    const i = indexOf(today)
    if (i >= 0) goTo(i - (visible >= 2 ? 1 : 0))
  }

  function setFilter(f: Filter) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (f === 'todos') n.delete('tipo')
        else n.set('tipo', f)
        return n
      },
      { replace: true },
    )
  }

  const lastVisible = Math.min(days.length - 1, firstIdx + visible - 1)
  const subtitle = days.length ? rangeLabel(days[firstIdx]!.date, days[Math.max(firstIdx, lastVisible)]!.date) : ' '
  const canManage = can('agenda.manage')
  const newDate = anchor

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
          <button type="button" className="icon-btn" aria-label="Anterior" onClick={() => goTo(firstIdx - 1)}>
            <Icon name="chevronL" size={16} />
          </button>
          <Button onClick={goToday}>Hoje</Button>
          <button type="button" className="icon-btn" aria-label="Próximo" onClick={() => goTo(firstIdx + 1)}>
            <Icon name="chevron" size={16} />
          </button>
          {canManage && (
            <Button variant="primary" icon="plus" onClick={() => setModal({ date: newDate })}>
              Novo compromisso
            </Button>
          )}
        </div>
      </header>

      <div className="kb-body">
        <Chips label="Filtrar por tipo" options={CHIPS} value={filter} onChange={setFilter} />
        {range.isError && (
          <div className="note red" role="alert">
            <Icon name="alerta" size={15} />
            <span>Não foi possível carregar a agenda.</span>
          </div>
        )}
        <div
          ref={strip}
          className="kb-strip"
          style={{ '--gap': `${GAP}px` } as CSSProperties}
          tabIndex={0}
          aria-label="Dias da agenda, role para os lados"
          aria-busy={range.isPending || undefined}
          onScroll={onScroll}
        >
          {range.isPending && <p className="kb-loading">Carregando a agenda…</p>}
          {days.map((d) => (
            <DayColumn key={d.date} day={d} today={today} filter={filter} onEdit={canManage ? (date, item) => setModal({ date, item }) : undefined} />
          ))}
        </div>
      </div>

      {canManage && <AppointmentModal open={!!modal} onClose={() => setModal(null)} date={modal?.date ?? newDate} item={modal?.item} />}
    </div>
  )
}
