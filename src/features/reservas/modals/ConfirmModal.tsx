import { useState, type FormEvent } from 'react'
import { useConfirmReservation, useSettings } from '@/data/hooks-reservas'
import { PAYMENT_METHOD } from '@/data/labels-ops'
import { SourceError, type AvailabilityResult, type PaymentMethod, type ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Field, Icon, Modal, useToast } from '@/ui'
import { numOrNull } from '../../acervo/formErrors'
import { AuthorizeExceptionDialog } from '../../exceptions/AuthorizeExceptionDialog'
import { SignContractModal } from './SignContractModal'

export type ConfirmModalProps = { r: ReservationDetail; onClose(): void; onRefused(conflicts: AvailabilityResult[]): void }

/**
 * Confirmar reserva (spec §3.2): checklist (contrato assinado, sinal mínimo) + sinal. Abaixo do mínimo o botão vira
 * "Dispensar sinal mínimo e confirmar" e pede PIN. Conflito de agenda → "Confirmação recusada" (nada muda).
 */
export function ConfirmModal({ r, onClose, onRefused }: ConfirmModalProps) {
  const confirm = useConfirmReservation(r.id)
  const settings = useSettings()
  const toast = useToast()
  const signed = !!r.contract?.signedAt
  const min = r.minSignal
  const [amount, setAmount] = useState(min.toFixed(2))
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [signing, setSigning] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  const value = numOrNull(amount)
  const valid = value != null && Number.isFinite(value) && value > 0
  const below = valid && value < min - 0.005

  function run(exceptionId?: string) {
    if (!valid) return setError(errorMessage('VALOR_INVALIDO'))
    if (value > r.totalNet + 0.005) return setError(`O valor excede o saldo em aberto (${brl(r.totalNet)}).`)
    setError(undefined)
    confirm.mutate(
      { signal: { amount: value, method, reference: reference.trim() || null, notes: notes.trim() || null }, exceptionId },
      {
        onSuccess: (res) => {
          if (res.ok) {
            toast({ title: 'Reserva confirmada', description: `${r.code} · peças bloqueadas com buffer de higienização.` })
            onClose()
            return
          }
          const codes = res.conflicts.map((c) => r.garments.find((g) => g.id === c.garmentId)?.code ?? '—').join(', ')
          toast({ title: 'Confirmação recusada', description: `Conflito em ${codes}. Nenhum bloco foi alterado.`, tone: 'error' })
          onRefused(res.conflicts)
        },
        onError: (err) => {
          if (err instanceof SourceError && err.code === 'VALOR_EXCEDE_SALDO') setError(`O valor excede o saldo em aberto (${err.hint ?? brl(r.totalNet)}).`)
          else setError(errorMessage(err))
          toast({ title: 'Não foi possível confirmar', description: errorMessage(err), tone: 'error' })
        },
      },
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!signed || confirm.isPending) return
    if (below) setAuthOpen(true)
    else run()
  }

  const pct = settings.data?.minSignalPercent ?? 50
  return (
    <>
      <Modal
        open={!authOpen}
        onClose={onClose}
        title="Confirmar reserva"
        description={`${r.code} · ${r.customer.fullName}`}
        footer={
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" form="rd-confirm" disabled={!signed || confirm.isPending}>
              {below ? 'Dispensar sinal mínimo e confirmar' : 'Confirmar reserva'}
            </Button>
          </>
        }
      >
        <form id="rd-confirm" className="rd-form" onSubmit={submit} noValidate>
          <ul className="rd-check" aria-label="Pré-condições">
            <li className={signed ? 'ok' : 'no'}>
              <Icon name={signed ? 'check' : 'x'} size={14} />
              <span>
                Contrato assinado{' '}
                {!signed && (
                  <button type="button" className="rs-alt" onClick={() => setSigning(true)}>
                    Marcar como assinado
                  </button>
                )}
              </span>
            </li>
            <li className="info">
              <Icon name="moeda" size={14} />
              <span>Sinal mínimo: {brl(min)}</span>
            </li>
          </ul>
          {!signed && <p className="tiny muted">Marque o contrato como assinado antes de confirmar.</p>}

          <div className="rd-grid">
            <Field label="Valor do sinal (R$)" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={error} />
            <Field as="select" label="Forma" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Field>
            <Field label="Referência" placeholder="E2E do PIX, NSU, link" value={reference} onChange={(e) => setReference(e.target.value)} />
            <Field label="Observação" placeholder="Sinal recebido na prova" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {below && (
            <p className="note amber">
              <Icon name="alerta" size={14} />
              <span>Sinal abaixo do mínimo ({brl(min)}). Só o Administrador pode dispensar.</span>
            </p>
          )}
        </form>
      </Modal>

      {signing && <SignContractModal r={r} onClose={() => setSigning(false)} />}
      {authOpen && valid && (
        <AuthorizeExceptionDialog
          kind="dispensa_sinal_minimo"
          refType="reserva"
          refId={r.id}
          maxAmount={Math.round((min - value) * 100) / 100}
          detail={`${r.customer.fullName} vai confirmar ${r.code} com sinal de ${brl(value)}, abaixo do mínimo de ${brl(min)} (${pct}%).`}
          onAuthorized={(id) => {
            setAuthOpen(false)
            run(id)
          }}
          onCancel={() => setAuthOpen(false)}
        />
      )}
    </>
  )
}
