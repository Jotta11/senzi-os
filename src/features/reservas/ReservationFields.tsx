import type { Channel, Customer, Garment } from '@/data/types'
import { prorate } from '@/domain/money'
import { brl, dateBR } from '@/lib/format'
import { Field, Icon } from '@/ui'
import { CustomerPicker } from '../agenda/CustomerPicker'
import { GarmentSelector } from './GarmentSelector'

export type FormValues = {
  customerId: string | null
  eventDate: string
  pickupOffset: number
  returnOffset: number
  eventType: string
  venue: string
  channel: Channel
  /** Texto digitado (aceita vírgula). */
  discount: string
  notes: string
}

const EVENTS = ['Casamento', 'Formatura', 'Aniversário', 'Festa corporativa', 'Baile de gala', 'Casamento civil', 'Premiação']
const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'loja', label: 'Loja' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
]
const PICKUP = [0, 1, 2, 3, 4, 5]
const RETURN = [1, 2, 3, 4]
const unit = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`

export type ReservationFieldsProps = {
  v: FormValues
  put<K extends keyof FormValues>(k: K, val: FormValues[K]): void
  picked: Garment[]
  canDiscount: boolean
  canCreateCustomer: boolean
  onNewCustomer(): void
  customer: Customer | null
  pickup: string
  returnDue: string
  onToggle(g: Garment): void
  onSwap(fromId: string, to: Garment): void
  ignoreReservationId?: string
  discount: number
  gross: number
}

/** Corpo do formulário de reserva (spec §3.1): cliente, datas, evento, desconto, peças e resumo com rateio. */
export function ReservationFields(p: ReservationFieldsProps) {
  const { v, put } = p
  const offsets = (base: number[], cur: number) => (base.includes(cur) || !Number.isFinite(cur) ? base : [...base, cur].sort((a, b) => a - b))
  const net = Math.max(0, p.gross - Math.max(0, Number.isFinite(p.discount) ? p.discount : 0))
  const split = p.picked.length > 1 && p.discount > 0 ? prorate(p.picked.map((g) => ({ gross: g.rentalPrice })), p.discount) : null

  return (
    <>
      <CustomerPicker
        id="rs-customerId"
        label="Cliente *"
        value={v.customerId}
        onChange={(id) => put('customerId', id)}
        allowCreate={p.canCreateCustomer}
        onCreateRequest={p.onNewCustomer}
      />
      {p.customer && <CustomerNote c={p.customer} />}

      <div className="rs-grid">
        <Field id="rs-eventDate" label="Data do evento *" type="date" value={v.eventDate} onChange={(e) => put('eventDate', e.target.value)} />
        <Field as="select" label="Retirar quantos dias antes" value={v.pickupOffset} onChange={(e) => put('pickupOffset', Number(e.target.value))}>
          {offsets(PICKUP, v.pickupOffset).map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'no dia' : unit(n)}
            </option>
          ))}
        </Field>
        <Field as="select" label="Devolver quantos dias depois" value={v.returnOffset} onChange={(e) => put('returnOffset', Number(e.target.value))}>
          {offsets(RETURN, v.returnOffset).map((n) => (
            <option key={n} value={n}>
              {unit(n)}
            </option>
          ))}
        </Field>
        <Field label="Tipo de evento" list="rs-events" autoComplete="off" value={v.eventType} onChange={(e) => put('eventType', e.target.value)} />
        <Field label="Local do evento" autoComplete="off" value={v.venue} onChange={(e) => put('venue', e.target.value)} />
        <Field as="select" label="Canal" value={v.channel} onChange={(e) => put('channel', e.target.value as Channel)}>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Field>
        <Field
          id="rs-discount"
          label="Desconto (R$)"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          disabled={!p.canDiscount}
          value={v.discount}
          onChange={(e) => put('discount', e.target.value)}
        />
        <div className="field">
          <span className="rs-label">Período ocupado</span>
          <span className="rs-period mono">
            {p.pickup ? `${dateBR(p.pickup).slice(0, 5)} → ${dateBR(p.returnDue).slice(0, 5)}` : '—'} <span className="muted tiny">+ higiene</span>
          </span>
        </div>
      </div>
      <datalist id="rs-events">
        {EVENTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>

      <GarmentSelector
        selected={p.picked}
        onToggle={p.onToggle}
        onSwap={p.onSwap}
        pickup={p.pickup}
        returnDue={p.returnDue}
        customerSize={p.customer?.measurements[0]?.usualSize ?? null}
        ignoreReservationId={p.ignoreReservationId}
      />

      <Field as="textarea" full label="Observações da reserva" placeholder="Combinações, ajustes prometidos, condições especiais" value={v.notes} onChange={(e) => put('notes', e.target.value)} />

      <section className="rs-summary" aria-label="Resumo da reserva">
        <div className="rs-sum-row">
          <span>{p.picked.length} {p.picked.length === 1 ? 'peça' : 'peças'}</span>
          <b className="mono">{brl(p.gross)}</b>
        </div>
        {p.discount > 0 && (
          <div className="rs-sum-row">
            <span>Desconto</span>
            <b className="mono">− {brl(p.discount)}</b>
          </div>
        )}
        <div className="rs-sum-row rs-total">
          <span>Total</span>
          <b className="display">{brl(net)}</b>
        </div>
        {split && (
          <div className="rs-split">
            <p className="eyebrow">Rateio do desconto entre as peças</p>
            <ul>
              {p.picked.map((g, i) => (
                <li key={g.id}>
                  <span>
                    <span className="mono tiny">{g.code}</span> {g.name}
                  </span>
                  <span className="mono">
                    {brl(g.rentalPrice)} − {brl(split[i]!.alloc)} = <b>{brl(split[i]!.net)}</b>
                  </span>
                </li>
              ))}
            </ul>
            <p className="tiny muted">É essa receita líquida que alimenta ROI, payback e margem de cada peça.</p>
          </div>
        )}
      </section>
    </>
  )
}

/** Resumo da cliente escolhida: tamanho, medidas, preferências e a 1ª observação fixada. */
function CustomerNote({ c }: { c: Customer }) {
  const m = c.measurements[0]
  const body = [m?.bustCm && `busto ${m.bustCm}`, m?.waistCm && `cintura ${m.waistCm}`, m?.hipCm && `quadril ${m.hipCm}`].filter(Boolean)
  const pinned = c.interactions.find((i) => i.pinned)
  return (
    <div className="note info rs-cnote">
      <Icon name="clientes" size={15} />
      <p>
        <b>{c.fullName}</b> — tamanho {m?.usualSize ?? 'não registrado'}
        {body.length > 0 && ` · ${body.join(' / ')} cm`}.
        {c.preferences.preferredColors.length > 0 && ` Prefere ${c.preferences.preferredColors.join(', ')}.`}
        {c.preferences.avoidedColors.length > 0 && ` Evita ${c.preferences.avoidedColors.join(', ')}.`}
        {pinned && ` ${pinned.content}`}
      </p>
    </div>
  )
}
