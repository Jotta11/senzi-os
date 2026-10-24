import { useState, type FormEvent } from 'react'
import { useUpdateFit } from '@/data/hooks'
import { FIT_RUNS_LABEL } from '@/data/labels'
import type { FitInput, FitRuns, Garment } from '@/data/types'
import { fitIssues } from '@/data/validation'
import { Button, Field, Icon, Modal } from '@/ui'
import { issuesToErrors, NO_ERRORS, numOrNull, sourceErrors, str, type FormErrors } from './formErrors'
import './garment.css'

const FIELDS = ['fitRuns', 'bustComfortCm', 'waistMaxCm', 'hipMaxCm', 'hemHeelCm', 'commonAlteration', 'fitNotes'] as const
const FORM_ID = 'ft-form'

export type FitModalProps = { garment: Garment; open: boolean; onClose(): void }

/** Caimento observado (protótipo `editFit`, campos ft-*): o que a equipe aprendeu vestindo a peça. */
export function FitModal({ garment: g, open, onClose }: FitModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Caimento observado"
      description={`${g.code} · ${g.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Salvar
          </Button>
        </>
      }
    >
      {open && <FitForm garment={g} onDone={onClose} />}
    </Modal>
  )
}

function FitForm({ garment: g, onDone }: { garment: Garment; onDone(): void }) {
  const save = useUpdateFit(g.id)
  const [v, setV] = useState({
    fitRuns: g.fitRuns ?? '',
    bustComfortCm: str(g.bustComfortCm),
    waistMaxCm: str(g.waistMaxCm),
    hipMaxCm: str(g.hipMaxCm),
    hemHeelCm: str(g.hemHeelCm),
    commonAlteration: g.commonAlteration ?? '',
    fitNotes: g.fitNotes ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))
  const err = (k: string) => errors.fields[k]

  function submit(e: FormEvent) {
    e.preventDefault()
    const input: FitInput = {
      fitRuns: (v.fitRuns || null) as FitRuns | null,
      bustComfortCm: numOrNull(v.bustComfortCm),
      waistMaxCm: numOrNull(v.waistMaxCm),
      hipMaxCm: numOrNull(v.hipMaxCm),
      hemHeelCm: numOrNull(v.hemHeelCm),
      commonAlteration: v.commonAlteration.trim() || null,
      fitNotes: v.fitNotes.trim(),
    }
    const issues = fitIssues(input)
    if (issues.length) return setErrors(issuesToErrors(issues, FIELDS))
    setErrors(NO_ERRORS)
    save.mutate(input, { onSuccess: onDone, onError: (x) => setErrors(sourceErrors(x, FIELDS)) })
  }

  const m = g.measurement
  return (
    <form id={FORM_ID} className="gp-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}
      <div className="note info">
        <Icon name="regua" size={15} />
        <span>
          Isto não é a etiqueta: é o que a equipe aprendeu vestindo a peça. É o dado que responde “será que serve nela?” antes de a cliente chegar.
        </span>
      </div>
      <div className="fgrid">
        <Field as="select" id="ft-runs" full label="Como veste" value={v.fitRuns} onChange={set('fitRuns')} error={err('fitRuns')}>
          <option value="">— não registrado —</option>
          {(Object.keys(FIT_RUNS_LABEL) as FitRuns[]).map((k) => (
            <option key={k} value={k}>
              {FIT_RUNS_LABEL[k]}
            </option>
          ))}
        </Field>
        <Field id="ft-bust" label="Busto confortável até (cm)" type="number" inputMode="decimal" min={0} max={300} value={v.bustComfortCm} placeholder={str(m.bustCm)} onChange={set('bustComfortCm')} error={err('bustComfortCm')} />
        <Field id="ft-waist" label="Cintura máxima observada (cm)" type="number" inputMode="decimal" min={0} max={300} value={v.waistMaxCm} placeholder={str(m.waistCm)} onChange={set('waistMaxCm')} error={err('waistMaxCm')} />
        <Field id="ft-hip" label="Quadril máximo observado (cm)" type="number" inputMode="decimal" min={0} max={300} value={v.hipMaxCm} placeholder={str(m.hipCm)} onChange={set('hipMaxCm')} error={err('hipMaxCm')} />
        <Field id="ft-heel" label="Barra prevista para salto (cm)" type="number" inputMode="decimal" min={0} max={20} value={v.hemHeelCm} placeholder="9" onChange={set('hemHeelCm')} error={err('hemHeelCm')} />
        <Field id="ft-alt" full label="Ajuste mais comum" value={v.commonAlteration} placeholder="Pences na cintura; barra solta 2 cm" onChange={set('commonAlteration')} error={err('commonAlteration')} />
        <Field
          as="textarea"
          id="ft-notes"
          full
          label="Observação de caimento"
          value={v.fitNotes}
          placeholder="Veste um número abaixo. Cintura marcada, quase sempre precisa de ajuste."
          onChange={set('fitNotes')}
          error={err('fitNotes')}
        />
      </div>
    </form>
  )
}
