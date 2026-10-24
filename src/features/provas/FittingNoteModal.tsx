import { useState, type FormEvent } from 'react'
import { useFittingMutation } from '@/data/hooks-agenda'
import type { FittingDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Field, Icon, Modal, useToast } from '@/ui'

type Item = FittingDetail['items'][number]
const FORM_ID = 'fn-form'

export type FittingNoteModalProps = { open: boolean; onClose(): void; code: string; fittingId: string; item: Item | null }

/** Observação da atendente sobre a peça na prova: grava nota e "precisa de ajuste" mantendo o resultado atual. */
export function FittingNoteModal({ open, onClose, code, fittingId, item }: FittingNoteModalProps) {
  return (
    <Modal
      open={open && !!item}
      onClose={onClose}
      title="Observação da prova"
      description={item ? `${item.garment.code} · ${item.garment.name}` : code}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Salvar
          </Button>
        </>
      }
    >
      {open && item && <NoteForm key={item.garmentId} fittingId={fittingId} item={item} onDone={onClose} />}
    </Modal>
  )
}

function NoteForm({ fittingId, item, onDone }: { fittingId: string; item: Item; onDone(): void }) {
  const mutation = useFittingMutation(fittingId)
  const toast = useToast()
  const [note, setNote] = useState(item.note ?? '')
  const [alter, setAlter] = useState(item.needsAlteration)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate(
      { type: 'outcome', garmentId: item.garmentId, needsAlteration: alter, note: note.trim() || null },
      {
        onSuccess: () => {
          toast({ title: 'Observação registrada', description: 'Ela aparece na ficha da peça e da cliente.' })
          onDone()
        },
        onError: (x) => setError(errorMessage(x)),
      },
    )
  }

  return (
    <form id={FORM_ID} className="pv-form" onSubmit={submit} noValidate>
      {error && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{error}</span>
        </div>
      )}
      <Field
        as="textarea"
        label="O que a cliente disse ou a atendente observou"
        placeholder="Marcando muito a cintura. Gostou do comprimento, mas quer sem manga."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="fn-check">
        <input type="checkbox" checked={alter} onChange={(e) => setAlter(e.target.checked)} /> Precisa de ajuste para servir
      </label>
      <p className="tiny muted">Ela aparece na ficha da peça e da cliente.</p>
    </form>
  )
}
