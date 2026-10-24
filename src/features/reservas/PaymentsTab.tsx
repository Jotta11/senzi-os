import { usePermissions } from '@/auth/usePermissions'
import { CLOSED_RESERVATION_STATES, PAYMENT_KIND, PAYMENT_METHOD } from '@/data/labels-ops'
import type { Payment, PaymentState, ReservationDetail } from '@/data/types'
import { hasReceivable } from '@/domain/money'
import { brl, dateBR } from '@/lib/format'
import { Badge, Button, DataTable, EmptyState, type Column, type Tone } from '@/ui'

const PAY: Record<PaymentState, { label: string; tone: Tone }> = {
  pago: { label: 'Pago', tone: 'green' },
  pendente: { label: 'Pendente', tone: 'amber' },
  parcial: { label: 'Parcial', tone: 'stone' },
  estornado: { label: 'Estornado', tone: 'stone' },
  cancelado: { label: 'Cancelado', tone: 'stone' },
}
const STATUS: Record<ReservationDetail['balance']['status'], { label: string; tone: Tone }> = {
  nao_pago: { label: 'Não pago', tone: 'red' },
  parcial: { label: 'Parcial', tone: 'amber' },
  pago: { label: 'Pago', tone: 'green' },
}

const stamp = (p: Payment) => p.paidAt ?? p.createdAt

export type PaymentsTabProps = {
  r: ReservationDetail
  onLaunch(initial?: { kind: Payment['kind']; amount: number }): void
  onReturnDeposit(): void
}

/** Aba Pagamentos (só `financeiro.view`): lançamentos do mais novo ao mais antigo, "Receber" nos pendentes e "Devolver caução". */
export function PaymentsTab({ r, onLaunch, onReturnDeposit }: PaymentsTabProps) {
  const { can } = usePermissions()
  const canPay = can('financeiro.payment')
  const status = STATUS[r.balance.status]
  const rows = [...r.payments].sort((a, b) => stamp(b).localeCompare(stamp(a)))
  const columns: Column<Payment>[] = [
    {
      key: 'data',
      header: 'Data',
      render: (p) => (p.paidAt ? dateBR(p.paidAt) : p.state === 'pendente' && p.dueAt ? `vence ${dateBR(p.dueAt).slice(0, 5)}` : '—'),
    },
    { key: 'tipo', header: 'Tipo', render: (p) => PAYMENT_KIND[p.kind] },
    { key: 'forma', header: 'Forma', render: (p) => PAYMENT_METHOD[p.method] },
    { key: 'sit', header: 'Situação', render: (p) => <Badge tone={PAY[p.state].tone}>{PAY[p.state].label}</Badge> },
    { key: 'ref', header: 'Referência', render: (p) => <span className="muted tiny">{p.notes || p.reference || ''}</span> },
    { key: 'valor', header: 'Valor', align: 'right', render: (p) => <b>{p.kind === 'estorno' ? `− ${brl(p.amount)}` : brl(p.amount)}</b> },
    {
      key: 'acao',
      header: <span className="sr-only">Ações</span>,
      align: 'right',
      render: (p) =>
        canPay && p.state === 'pendente' && (p.kind === 'saldo' || p.kind === 'multa') ? (
          <Button size="sm" onClick={() => onLaunch({ kind: p.kind, amount: p.amount })}>
            Receber
          </Button>
        ) : null,
    },
  ]
  return (
    <section className="card" aria-labelledby="rd-pay-t">
      <div className="card-h">
        <h3 id="rd-pay-t">Pagamentos</h3>
        {hasReceivable(r) && <Badge tone={status.tone}>{status.label}</Badge>}
        <div className="actions">
          {canPay && r.balance.caucao > 0 && CLOSED_RESERVATION_STATES.includes(r.state) && (
            <Button size="sm" onClick={onReturnDeposit}>
              Devolver caução
            </Button>
          )}
          {canPay && r.state !== 'rascunho' && (
            <Button size="sm" icon="plus" onClick={() => onLaunch()}>
              Lançar
            </Button>
          )}
        </div>
      </div>
      <DataTable
        caption="Pagamentos da reserva"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        empty={<EmptyState icon="moeda" title="Nenhum pagamento lançado" description="Registre o sinal ou o valor integral." />}
      />
    </section>
  )
}
