import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { isValidISODate } from '@/data/validation'
import type { AgendaItem } from '@/data/types'
import { useToday } from '@/lib/useToday'
import { AppointmentModal } from './AppointmentModal'
import type { ShellProps } from './AgendaShell'
import { isAgendaFilter, isAgendaView, type AgendaFilter, type AgendaView } from './agendaView'
import { DayView } from './DayView'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import '../acervo/acervo.css'
import './agenda.css'

const isISODate = (v: string | null): v is string => isValidISODate(v)

/**
 * Agenda — vistas Dia (lista do dia), Semana (kanban de dias) e Mês (calendário segunda → domingo), em `?vista=`
 * (padrão: semana). `?dia=aaaa-mm-dd` é a data âncora das três; chips filtram por tipo (`?tipo=`). Compromissos
 * manuais abrem a edição; os automáticos levam à prova, reserva ou cliente.
 */
export function AgendaPage() {
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const today = useToday()
  const diaParam = params.get('dia')
  const anchor = isISODate(diaParam) ? diaParam : today
  const tipoParam = params.get('tipo')
  const filter: AgendaFilter = isAgendaFilter(tipoParam) ? tipoParam : 'todos'
  const vistaParam = params.get('vista')
  const view: AgendaView = isAgendaView(vistaParam) ? vistaParam : 'semana'
  const [modal, setModal] = useState<{ date: string; item?: AgendaItem } | null>(null)

  function patch(changes: Record<string, string | null>, replace = true) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        for (const [k, v] of Object.entries(changes)) {
          if (v === null) n.delete(k)
          else n.set(k, v)
        }
        return n
      },
      { replace },
    )
  }

  const canManage = can('agenda.manage')
  const onEdit = canManage ? (date: string, item: AgendaItem) => setModal({ date, item }) : undefined
  const shell: ShellProps = {
    view,
    onView: (v) => patch({ vista: v === 'semana' ? null : v }),
    filter,
    onFilter: (f) => patch({ tipo: f === 'todos' ? null : f }),
    onNew: canManage ? () => setModal({ date: anchor }) : undefined,
  }
  const onMove = (date: string) => patch({ dia: date === today ? null : date })

  return (
    <>
      {view === 'dia' ? (
        <DayView shell={shell} date={anchor} today={today} onMove={onMove} onEdit={onEdit} />
      ) : view === 'mes' ? (
        <MonthView shell={shell} date={anchor} today={today} onMove={onMove} onOpenDay={(d) => patch({ vista: 'dia', dia: d === today ? null : d }, false)} />
      ) : (
        <WeekView shell={shell} anchor={anchor} today={today} onEdit={onEdit} />
      )}
      {canManage && <AppointmentModal open={!!modal} onClose={() => setModal(null)} date={modal?.date ?? anchor} item={modal?.item} />}
    </>
  )
}
