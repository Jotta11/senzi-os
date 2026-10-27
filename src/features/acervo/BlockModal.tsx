import { useState, type FormEvent } from 'react'
import { useBlockGarment } from '@/data/hooks'
import { SourceError, type Garment } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { addDays } from '@/lib/format'
import { useToday } from '@/lib/useToday'
import { Button, Field, Icon, Modal } from '@/ui'

const FORM_ID = 'bk-form'

export type BlockModalProps = { garment: Garment; open: boolean; onClose(): void }

/** Bloqueio manual (protótipo `blockGarment`): De (hoje), Até (hoje + 3), Motivo. Conflito aparece no topo com o período. */
export function BlockModal({ garment: g, open, onClose }: BlockModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Bloquear peça"
      description={`${g.code} · ${g.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID} icon="tag">
            Bloquear
          </Button>
        </>
      }
    >
      {open && <BlockForm garment={g} onDone={onClose} />}
    </Modal>
  )
}

type Errors = { from?: string; to?: string; conflict?: { message: string; hint?: string }; top?: string }

function BlockForm({ garment: g, onDone }: { garment: Garment; onDone(): void }) {
  const today = useToday()
  const block = useBlockGarment(g.id)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 3))
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!from) return setErrors({ from: 'Informe a data inicial.' })
    if (!to || to < from) return setErrors({ to: errorMessage('PERIODO_INVALIDO') })
    setErrors({})
    block.mutate(
      { from, to, note },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof SourceError && err.code === 'CONFLITO_AGENDA') setErrors({ conflict: { message: errorMessage(err), hint: err.hint } })
          else if (err instanceof SourceError && err.code === 'PERIODO_INVALIDO') setErrors({ to: errorMessage(err) })
          else setErrors({ top: errorMessage(err) })
        },
      },
    )
  }

  return (
    <form id={FORM_ID} className="gp-form" onSubmit={submit} noValidate>
      {errors.conflict && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>
            <b>{errors.conflict.message}</b>
            {errors.conflict.hint && <> Compromisso existente: {errors.conflict.hint}.</>}
          </span>
        </div>
      )}
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}
      <div className="fgrid">
        <Field id="bk-from" label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} error={errors.from} />
        <Field id="bk-to" label="Até" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} error={errors.to} />
        <Field
          id="bk-note"
          full
          label="Motivo"
          value={note}
          placeholder="Ensaio fotográfico, empréstimo institucional, avaliação…"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="note info">
        <Icon name="relogio" size={15} />
        <span>O bloqueio ocupa o calendário da peça e impede novas reservas no período.</span>
      </div>
    </form>
  )
}
