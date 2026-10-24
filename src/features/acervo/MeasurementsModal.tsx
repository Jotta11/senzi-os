import { useState, type FormEvent } from 'react'
import { useUpdateMeasurement } from '@/data/hooks'
import { STRETCH_LABEL } from '@/data/labels'
import type { FabricStretch, Garment, GarmentMeasurement } from '@/data/types'
import { measurementIssues } from '@/data/validation'
import { Button, Field, Icon, Modal } from '@/ui'
import { issuesToErrors, NO_ERRORS, numOrNull, sourceErrors, str, type FormErrors } from './formErrors'
import './garment.css'

const NUMS = [
  ['bustCm', 'Busto (cm)', 300],
  ['waistCm', 'Cintura (cm)', 300],
  ['hipCm', 'Quadril (cm)', 300],
  ['shoulderCm', 'Ombro (cm)', 300],
  ['totalLengthCm', 'Comprimento total (cm)', 300],
  ['hemAllowanceCm', 'Sobra de barra (cm)', 20],
] as const
type NumKey = (typeof NUMS)[number][0]
const FIELDS = [...NUMS.map((n) => n[0]), 'stretch'] as const
const FORM_ID = 'md-form'

export type MeasurementsModalProps = { garment: Garment; open: boolean; onClose(): void }

/** Medidas da peça (fita métrica na peça, não na cliente): Busto, Cintura, Quadril, Ombro, Comprimento, Sobra de barra, Elasticidade. */
export function MeasurementsModal({ garment: g, open, onClose }: MeasurementsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Medidas da peça"
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
      {open && <MeasurementsForm garment={g} onDone={onClose} />}
    </Modal>
  )
}

function MeasurementsForm({ garment: g, onDone }: { garment: Garment; onDone(): void }) {
  const save = useUpdateMeasurement(g.id)
  const m = g.measurement
  const [v, setV] = useState<Record<NumKey | 'stretch', string>>({
    bustCm: str(m.bustCm),
    waistCm: str(m.waistCm),
    hipCm: str(m.hipCm),
    shoulderCm: str(m.shoulderCm),
    totalLengthCm: str(m.totalLengthCm),
    hemAllowanceCm: str(m.hemAllowanceCm),
    stretch: m.stretch ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)

  function submit(e: FormEvent) {
    e.preventDefault()
    const input: GarmentMeasurement = {
      bustCm: numOrNull(v.bustCm),
      waistCm: numOrNull(v.waistCm),
      hipCm: numOrNull(v.hipCm),
      shoulderCm: numOrNull(v.shoulderCm),
      totalLengthCm: numOrNull(v.totalLengthCm),
      hemAllowanceCm: numOrNull(v.hemAllowanceCm),
      stretch: (v.stretch || null) as FabricStretch | null,
    }
    const issues = measurementIssues(input)
    if (issues.length) return setErrors(issuesToErrors(issues, FIELDS))
    setErrors(NO_ERRORS)
    save.mutate(input, { onSuccess: onDone, onError: (x) => setErrors(sourceErrors(x, FIELDS)) })
  }

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
        <span>Medidas tiradas na peça, deitada e sem esticar. São confrontadas com as medidas da cliente antes de prometer o caimento.</span>
      </div>
      <div className="fgrid g3c">
        {NUMS.map(([k, label, max]) => (
          <Field
            key={k}
            id={`md-${k}`}
            label={label}
            type="number"
            inputMode="decimal"
            min={0}
            max={max}
            step="0.5"
            value={v[k]}
            onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))}
            error={errors.fields[k]}
          />
        ))}
        <Field
          as="select"
          id="md-stretch"
          full
          label="Elasticidade"
          value={v.stretch}
          onChange={(e) => setV((p) => ({ ...p, stretch: e.target.value }))}
          error={errors.fields.stretch}
        >
          <option value="">— não registrada —</option>
          {(Object.keys(STRETCH_LABEL) as FabricStretch[]).map((k) => (
            <option key={k} value={k}>
              {STRETCH_LABEL[k]}
            </option>
          ))}
        </Field>
      </div>
    </form>
  )
}
