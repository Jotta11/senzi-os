import { useState, type FormEvent } from 'react'
import { useUpdateDraft } from '@/data/hooks-reservas'
import { SourceError, type ReservationDetail, type ReservationInput } from '@/data/types'
import { round2 } from '@/domain/money'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Chips, Field, Icon, Modal, useToast } from '@/ui'
import { numOrNull } from '../../acervo/formErrors'

type Mode = 'valor' | 'percentual'

/** O rascunho como entrada de `updateDraft`, trocando só o desconto do pedido (peças, preços e observações ficam). */
function draftInputWithDiscount(r: ReservationDetail, orderDiscount: number): ReservationInput {
  return {
    customerId: r.customerId,
    eventDate: r.eventDate ?? '',
    eventType: r.eventType ?? undefined,
    eventVenue: r.eventVenue ?? undefined,
    pickupDate: r.pickupDate,
    returnDueDate: r.returnDueDate,
    channel: r.channel,
    discount: orderDiscount,
    notes: r.notes ?? undefined,
    items: r.items.map((i) => ({
      garmentId: i.garmentId,
      unitPrice: i.unitPrice,
      ...(i.itemDiscount ? { itemDiscount: i.itemDiscount } : {}),
      ...(i.alterationNotes ? { alterationNotes: i.alterationNotes } : {}),
    })),
  }
}

/**
 * "Dar desconto" no fechamento do rascunho, antes de enviar o contrato: em R$ ou em % da locação. Salva o rascunho
 * (mesma regra do "Editar rascunho") e o contrato é regerado com o novo total.
 */
export function DiscountModal({ r, onClose }: { r: ReservationDetail; onClose(): void }) {
  const update = useUpdateDraft(r.id)
  const toast = useToast()
  const gross = r.totalGross
  const itemDiscounts = round2(r.items.reduce((s, i) => s + i.itemDiscount, 0))
  const [mode, setMode] = useState<Mode>('valor')
  const [raw, setRaw] = useState(r.discount > 0 ? String(r.discount) : '')
  const [error, setError] = useState<string | undefined>()

  const n = numOrNull(raw)
  const discount = n == null || !Number.isFinite(n) ? 0 : round2(mode === 'percentual' ? (gross * n) / 100 : n)
  const pct = gross > 0 ? (discount / gross) * 100 : 0
  const net = round2(gross - discount)

  function switchMode(next: Mode) {
    if (next === mode) return
    // Converte o que já foi digitado para a outra unidade.
    if (n != null && Number.isFinite(n) && gross > 0) setRaw(next === 'percentual' ? String(round2((n / gross) * 100)) : String(round2((gross * n) / 100)))
    setMode(next)
    setError(undefined)
  }

  function save(total: number) {
    if (total < 0) return setError(errorMessage('DESCONTO_NEGATIVO'))
    if (total > gross + 0.005) return setError(`O desconto (${brl(total)}) é maior que o valor das peças (${brl(gross)}).`)
    if (total < itemDiscounts - 0.005) return setError(`As peças já têm ${brl(itemDiscounts)} de desconto próprio; o total não pode ser menor.`)
    setError(undefined)
    update.mutate(
      { input: draftInputWithDiscount(r, round2(total - itemDiscounts)) },
      {
        onSuccess: () => {
          toast({ title: total > 0 ? 'Desconto aplicado' : 'Desconto removido', description: `${r.code} · total ${brl(round2(gross - total))}. Contrato regerado.` })
          onClose()
        },
        onError: (err) => {
          const msg = err instanceof SourceError && err.code === 'DESCONTO_MAIOR_QUE_BRUTO' && err.hint ? err.hint : errorMessage(err)
          setError(msg)
          toast({ title: 'Não foi possível aplicar o desconto', description: msg, tone: 'error' })
        },
      },
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (update.isPending) return
    if (n == null || !Number.isFinite(n)) return setError('Informe o desconto.')
    if (mode === 'percentual' && (n < 0 || n > 100)) return setError('O percentual vai de 0 a 100.')
    save(discount)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Dar desconto"
      description={`${r.code} · ${r.customer.fullName}`}
      footer={
        <>
          {r.discount > 0 && (
            <Button icon="x" disabled={update.isPending} onClick={() => save(itemDiscounts)}>
              Remover desconto
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rd-discount" disabled={update.isPending}>
            Aplicar desconto
          </Button>
        </>
      }
    >
      <form id="rd-discount" className="rd-form" onSubmit={submit} noValidate>
        <Chips<Mode>
          label="Tipo de desconto"
          options={[
            { value: 'valor', label: 'Em reais (R$)' },
            { value: 'percentual', label: 'Em porcentagem (%)' },
          ]}
          value={mode}
          onChange={switchMode}
        />
        <Field
          label={mode === 'valor' ? 'Desconto (R$)' : 'Desconto (%)'}
          type="number"
          inputMode="decimal"
          min={0}
          max={mode === 'percentual' ? 100 : undefined}
          step={mode === 'percentual' ? 0.5 : 0.01}
          autoFocus
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setError(undefined)
          }}
          error={error}
        />
        <dl className="rd-money" aria-label="Valores com o desconto">
          <div>
            <dt>Locação</dt>
            <dd>{brl(gross)}</dd>
          </div>
          <div>
            <dt>Desconto{discount > 0 && gross > 0 ? ` (${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : ''}</dt>
            <dd>− {brl(discount)}</dd>
          </div>
          <div className="strong">
            <dt>Novo total</dt>
            <dd>{brl(Math.max(0, net))}</dd>
          </div>
        </dl>
        <p className="note info">
          <Icon name="doc" size={14} />
          <span>O contrato é regerado com o novo total — aplique o desconto antes de imprimir ou enviar o contrato.</span>
        </p>
        {r.contract?.editedAt && (
          <p className="note amber">
            <Icon name="alerta" size={14} />
            <span>O texto do contrato foi editado na tela. Com o desconto, ele volta ao texto padrão e a edição se perde.</span>
          </p>
        )}
      </form>
    </Modal>
  )
}
