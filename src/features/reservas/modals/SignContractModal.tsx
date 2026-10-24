import { useState, type FormEvent } from 'react'
import { useMarkContractSigned } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { todayISO } from '@/lib/format'
import { Button, Field, Icon, Modal, useToast } from '@/ui'
import { sourceErrors } from '../../acervo/formErrors'

/** "Marcar contrato como assinado" (spec §3.7): data, quem assinou e observação; congela o corpo do contrato. */
export function SignContractModal({ r, onClose }: { r: ReservationDetail; onClose(): void }) {
  const sign = useMarkContractSigned(r.id)
  const toast = useToast()
  const [signedAt, setSignedAt] = useState(todayISO())
  const [signer, setSigner] = useState(r.customer.fullName)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [top, setTop] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    sign.mutate(
      { signedAt, signerName: signer, notes: notes.trim() || null },
      {
        onSuccess: () => {
          toast({ title: 'Contrato marcado como assinado', description: r.contract?.number ?? r.code })
          onClose()
        },
        onError: (err) => {
          const e2 = sourceErrors(err, ['signedAt', 'signerName'])
          setErrors(e2.fields)
          setTop(e2.top ?? (Object.keys(e2.fields).length ? null : errorMessage(err)))
        },
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Marcar contrato como assinado"
      description={`${r.code} · ${r.customer.fullName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rd-sign" disabled={sign.isPending}>
            Marcar como assinado
          </Button>
        </>
      }
    >
      <form id="rd-sign" className="rd-form" onSubmit={submit} noValidate>
        <p className="note info">
          <Icon name="escudo" size={14} />
          <span>Confirme que a via impressa foi assinada pela cliente na loja.</span>
        </p>
        {top && (
          <p className="note red" role="alert">
            {top}
          </p>
        )}
        <Field label="Assinado em" type="date" value={signedAt} max={todayISO()} onChange={(e) => setSignedAt(e.target.value)} error={errors.signedAt} />
        <Field label="Quem assinou" value={signer} onChange={(e) => setSigner(e.target.value)} error={errors.signerName} />
        <Field as="textarea" label="Observação" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Modal>
  )
}
