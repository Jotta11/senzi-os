import { useMemo } from 'react'
import { Link } from 'react-router'
import { falta } from '@/domain/finance'
import { usePayables, useReceivables } from '@/data/hooks-financeiro'
import { addDays, brl, dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Card, EmptyState } from '@/ui'
import './financeiro.css'

/** "Vencendo nos próximos 7 dias": contas a receber e a pagar em aberto (só com `financeiro.geral`). */
export function DueSoon({ today }: { today: string }) {
  const href = useAppHref()
  const rec = useReceivables({ status: 'abertas', origin: 'todas', categoryId: null, q: '', range: 'tudo' })
  const pay = usePayables({ status: 'abertas', categoryId: null, recurrence: 'todas', q: '', range: 'tudo' })
  const items = useMemo(() => {
    const limit = addDays(today, 7)
    const inWin = (d: string) => d >= today && d <= limit
    return [
      ...(rec.data?.rows ?? []).filter((r) => inWin(r.dueDate)).map((r) => ({ key: `r-${r.id}`, kind: 'Receber' as const, due: r.dueDate, text: r.description, amount: falta(r) })),
      ...(pay.data?.rows ?? []).filter((p) => inWin(p.dueDate)).map((p) => ({ key: `p-${p.id}`, kind: 'Pagar' as const, due: p.dueDate, text: p.description, amount: p.amount })),
    ].sort((a, b) => a.due.localeCompare(b.due))
  }, [rec.data, pay.data, today])
  return (
    <Card title="Vencendo nos próximos 7 dias" flush>
      {items.length === 0 ? (
        <EmptyState icon="relogio" title="Nada vencendo" description="Nenhuma conta vence nos próximos 7 dias." />
      ) : (
        <ul className="fx-list">
          {items.map((i) => (
            <li key={i.key}>
              <span className="mono tiny">{dateBR(i.due).slice(0, 5)}</span>
              <Badge tone={i.kind === 'Receber' ? 'green' : 'amber'}>{i.kind}</Badge>
              <Link className="grow" to={href(i.kind === 'Receber' ? '/financeiro/receber' : '/financeiro/pagar')}>
                {i.text}
              </Link>
              <b className="fx-money">{brl(i.amount)}</b>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
