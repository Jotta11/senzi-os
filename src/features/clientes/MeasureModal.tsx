import { useState, type FormEvent } from 'react'
import { useAddMeasurement } from '@/data/hooks'
import { SIZES } from '@/data/labels'
import type { Customer, CustomerMeasurementInput, SizeEquiv } from '@/data/types'
import { customerMeasurementIssues } from '@/data/validation'
import { Button, Field, Icon, Modal } from '@/ui'
import { issuesToErrors, NO_ERRORS, numOrNull, sourceErrors, str, type FormErrors } from '../acervo/formErrors'
import { measurementChanged } from './measurementChanged'
import './customer.css'

const NUMS = [
  ['bustCm', 'Busto (cm)'],
  ['waistCm', 'Cintura (cm)'],
  ['hipCm', 'Quadril (cm)'],
  ['heightCm', 'Altura (cm)'],
  ['shoulderCm', 'Ombro (cm)'],
] as const
type NumKey = (typeof NUMS)[number][0]
type Values = Record<NumKey | 'usualSize' | 'shoeSize' | 'notes', string>
const FIELDS = ['usualSize', ...NUMS.map((n) => n[0]), 'shoeSize', 'notes'] as const
const FORM_ID = 'cm-form'

export type MeasureModalProps = { customer: Customer; open: boolean; onClose(): void }

/**
 * "Atualizar medidas" (protótipo `editMeasure`): cada envio cria uma versão nova — nenhuma é sobrescrita.
 * Começa com os valores da medida atual; as faixas (cm) são as mesmas do cadastro e da fonte.
 */
export function MeasureModal({ customer: c, open, onClose }: MeasureModalProps) {
  const save = useAddMeasurement(c.id)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atualizar medidas"
      description={`${c.fullName} · o histórico anterior é preservado`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID} disabled={save.isPending}>
            Salvar medidas
          </Button>
        </>
      }
    >
      {open && <MeasureForm customer={c} save={save} onDone={onClose} />}
    </Modal>
  )
}

function MeasureForm({ customer: c, save, onDone }: { customer: Customer; save: ReturnType<typeof useAddMeasurement>; onDone(): void }) {
  const m = c.measurements[0]
  const [v, setV] = useState<Values>({
    usualSize: m?.usualSize ?? '',
    bustCm: str(m?.bustCm),
    waistCm: str(m?.waistCm),
    hipCm: str(m?.hipCm),
    heightCm: str(m?.heightCm),
    shoulderCm: str(m?.shoulderCm),
    shoeSize: m?.shoeSize ?? '',
    notes: '',
  })
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (save.isPending) return
    const input: CustomerMeasurementInput = {
      usualSize: (v.usualSize || null) as SizeEquiv | null,
      bustCm: numOrNull(v.bustCm),
      waistCm: numOrNull(v.waistCm),
      hipCm: numOrNull(v.hipCm),
      heightCm: numOrNull(v.heightCm),
      shoulderCm: numOrNull(v.shoulderCm),
      shoeSize: v.shoeSize.trim() || null,
      // o comprimento preferido não está neste formulário: segue o da versão atual
      preferredLength: m?.preferredLength ?? null,
      notes: v.notes.trim() || null,
    }
    const issues = customerMeasurementIssues(input)
    if (issues.length) return setErrors(issuesToErrors(issues, FIELDS))
    setErrors(NO_ERRORS)
    // nada mudou (e sem observação): não cria versão idêntica à atual
    if (!input.notes && !measurementChanged(m, input)) return onDone()
    save.mutate(input, { onSuccess: onDone, onError: (x) => setErrors(sourceErrors(x, FIELDS)) })
  }

  return (
    <form id={FORM_ID} className="cp-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}
      <div className="note info">
        <Icon name="regua" size={15} />
        <span>Uma versão nova é criada; a anterior continua no histórico de medidas.</span>
      </div>
      <div className="fgrid g3c">
        <Field as="select" id="cm-usualSize" label="Tamanho usual" value={v.usualSize} onChange={set('usualSize')} error={errors.fields.usualSize}>
          <option value="">—</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Field>
        {NUMS.map(([k, label]) => (
          <Field
            key={k}
            id={`cm-${k}`}
            label={label}
            type="number"
            inputMode="decimal"
            min={0}
            max={300}
            step="0.5"
            value={v[k]}
            onChange={set(k)}
            error={errors.fields[k]}
          />
        ))}
        <Field id="cm-shoeSize" label="Calçado" value={v.shoeSize} onChange={set('shoeSize')} error={errors.fields.shoeSize} />
        <Field
          id="cm-notes"
          full
          label="Observação"
          placeholder="Medidas tiradas na prova do vestido Verona"
          value={v.notes}
          onChange={set('notes')}
          error={errors.fields.notes}
        />
      </div>
    </form>
  )
}
