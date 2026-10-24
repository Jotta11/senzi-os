import { PAYMENT_METHOD } from '@/data/labels-ops'
import type { PaymentMethod } from '@/data/types'
import { Field, Icon } from '@/ui'

/** Select de forma de pagamento (PIX, cartões, dinheiro…). */
export function MethodField({ value, onChange, id }: { value: PaymentMethod; onChange(m: PaymentMethod): void; id?: string }) {
  return (
    <Field as="select" id={id} label="Forma" value={value} onChange={(e) => onChange(e.target.value as PaymentMethod)}>
      {Object.entries(PAYMENT_METHOD).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </Field>
  )
}

/** Erro sem campo próprio, no topo do formulário. */
export function TopError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="note red" role="alert">
      <Icon name="alerta" size={14} />
      <span>{message}</span>
    </p>
  )
}
