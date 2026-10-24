import { useState, type FormEvent } from 'react'
import { useFittingMutation } from '@/data/hooks-agenda'
import type { FittingDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Field, Icon, Modal } from '@/ui'
import { plural } from './fittingFormat'

type Closing = 'perdida' | 'concluida' | 'no_show'
const FORM_ID = 'cl-form'

export type CloseFittingModalProps = { open: boolean; onClose(): void; detail: FittingDetail }

/** Encerrar prova: como terminou + motivo. Peças sem resultado só geram um aviso (não bloqueia). */
export function CloseFittingModal({ open, onClose, detail }: CloseFittingModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Encerrar prova"
      description={detail.session.code}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Encerrar
          </Button>
        </>
      }
    >
      {open && <CloseForm detail={detail} onDone={onClose} />}
    </Modal>
  )
}

function CloseForm({ detail, onDone }: { detail: FittingDetail; onDone(): void }) {
  const mutation = useFittingMutation(detail.session.id)
  const [state, setState] = useState<Closing>('perdida')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pending = detail.items.filter((i) => i.outcome === 'nao_provou').length

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate({ type: 'close', state, notes: notes.trim() || null }, { onSuccess: onDone, onError: (x) => setError(errorMessage(x)) })
  }

  return (
    <form id={FORM_ID} className="pv-form" onSubmit={submit} noValidate>
      {error && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{error}</span>
        </div>
      )}
      {pending > 0 && (
        <div className="note amber" role="status">
          <Icon name="alerta" size={15} />
          <span>
            <b>{plural(pending, 'peça sem resultado registrado', 'peças sem resultado registrado')}.</b> Sem isso a Inteligência não consegue dizer o que encanta e não converte.
          </span>
        </div>
      )}
      <Field as="select" label="Como terminou" value={state} onChange={(e) => setState(e.target.value as Closing)}>
        <option value="perdida">Sem conversão — cliente não fechou</option>
        <option value="concluida">Concluída — decisão pendente</option>
        <option value="no_show">No-show — cliente não compareceu</option>
      </Field>
      <Field
        as="textarea"
        label="Motivo / observação"
        placeholder="Achou o preço acima do orçamento. Vai pensar até sexta."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </form>
  )
}
