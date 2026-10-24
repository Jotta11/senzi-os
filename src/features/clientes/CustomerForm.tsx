import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useCreateCustomer, useUpdateCustomer } from '@/data/hooks'
import { LEAD_SOURCE_LABEL, LENGTH_LABEL, SIZES } from '@/data/labels'
import type { Customer, CustomerInput, CustomerMeasurementInput, GarmentLength, IdealMeasurements, LeadSource, SizeEquiv } from '@/data/types'
import { customerIssues } from '@/data/validation'
import { maskCPF, maskPhone, onlyDigits, todayISO } from '@/lib/format'
import { Button, Field, Icon, Modal } from '@/ui'
import { issuesToErrors, NO_ERRORS, numOrNull, sourceErrors, str, type FormErrors } from '../acervo/formErrors'
import { IdealGarmentPicker } from './IdealGarmentPicker'
import { CM_KEYS, measurementChanged } from './measurementChanged'
import './clientes.css'

const FORM_ID = 'cf-form'
export const REQUIRED_NOTE = 'Nome, telefone, nascimento e CPF são obrigatórios.'

/** Campos com mensagem própria (os ids são `cf-<campo>`), na ordem da tela — o primeiro com erro recebe o foco. */
const FIELDS = [
  'fullName',
  'phone',
  'birthDate',
  'cpf',
  'instagram',
  'email',
  'city',
  'state',
  'leadSource',
  'notes',
  'usualSize',
  'bustCm',
  'waistCm',
  'hipCm',
  'shoulderCm',
  'heightCm',
  'shoeSize',
  'preferredLength',
] as const

const CM = CM_KEYS
type CmKey = (typeof CM)[number]

export type CustomerFormProps = {
  open: boolean
  onClose(): void
  /** Sem cliente = "Nova cliente"; com cliente = "Editar cliente" (a ficha da Task 5 abre assim). */
  customer?: Customer
  /** Depois de cadastrar (a lista navega para a ficha). Sem ele, só fecha. */
  onCreated?(c: Customer): void
  /** Depois de salvar a edição (o modal fecha em seguida). */
  onSaved?(c: Customer): void
  /** Cadastro já com uma peça como modelo ideal (ex.: `?ideal=sz-0107`). */
  initialIdealGarmentId?: string | null
}

/**
 * Cadastro e edição da cliente (protótipo `customerForm`, adaptado ao Plano 2B): Dados · Modelo ideal ·
 * Perfil corporal · Preferências. Validação no cliente igual à da fonte (`customerIssues`), erros por campo,
 * telefone e CPF com máscara enquanto digita (guardados só com dígitos).
 */
export function CustomerForm({ open, onClose, customer, onCreated, onSaved, initialIdealGarmentId }: CustomerFormProps) {
  const editing = !!customer
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar cliente' : 'Nova cliente'}
      description={editing ? `${customer.code} · ${REQUIRED_NOTE}` : REQUIRED_NOTE}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {editing ? 'Salvar' : 'Cadastrar cliente'}
          </Button>
        </>
      }
    >
      {open && <CustomerFields customer={customer} onDone={onClose} onCreated={onCreated} onSaved={onSaved} initialIdeal={initialIdealGarmentId ?? null} />}
    </Modal>
  )
}

function initial(c: Customer | undefined, ideal: string | null) {
  const m = c?.measurements[0]
  const p = c?.preferences
  return {
    fullName: c?.fullName ?? '',
    phone: c?.phone ?? '',
    birthDate: c?.birthDate ?? '',
    cpf: c?.cpf ?? '',
    instagram: c?.instagram ?? '',
    email: c?.email ?? '',
    city: c?.city ?? '',
    state: c?.state ?? '',
    leadSource: (c?.leadSource ?? '') as LeadSource | '',
    notes: c?.notes ?? '',
    idealGarmentId: c ? c.idealGarmentId : ideal,
    usualSize: (m?.usualSize ?? '') as SizeEquiv | '',
    bustCm: str(m?.bustCm),
    waistCm: str(m?.waistCm),
    hipCm: str(m?.hipCm),
    shoulderCm: str(m?.shoulderCm),
    heightCm: str(m?.heightCm),
    shoeSize: m?.shoeSize ?? '',
    preferredLength: (m?.preferredLength ?? '') as GarmentLength | '',
    preferredColors: p?.preferredColors ?? [],
    avoidedColors: p?.avoidedColors ?? [],
    sleeve: p?.sleeve ?? '',
    neckline: p?.neckline ?? '',
  }
}
type Values = ReturnType<typeof initial>
type TextKey = { [K in keyof Values]: Values[K] extends string ? K : never }[keyof Values]

/** Dígitos do telefone; colado com DDI (+55 …, 12–13 dígitos) perde o 55. */
function phoneDigits(s: string): string {
  let d = onlyDigits(s)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.slice(0, 11)
}

const orNull = (s: string) => s.trim() || null
const instagramOf = (s: string) => (s.trim() ? `@${s.trim().replace(/^@+/, '')}` : null)

function CustomerFields({
  customer,
  onDone,
  onCreated,
  onSaved,
  initialIdeal,
}: {
  customer?: Customer
  onDone(): void
  onCreated?(c: Customer): void
  onSaved?(c: Customer): void
  initialIdeal: string | null
}) {
  const create = useCreateCustomer()
  const update = useUpdateCustomer(customer?.id ?? '')
  const [v, setV] = useState<Values>(() => initial(customer, initialIdeal))
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  /** Peça cujas medidas foram aplicadas (vira a origem "modelo ideal" da versão de medidas). */
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null)
  const busy = create.isPending || update.isPending

  const put = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }))
  const f = (k: TextKey) => ({
    id: `cf-${k}`,
    value: v[k],
    onChange: (e: { target: { value: string } }) => put(k, e.target.value as never),
    error: errors.fields[k],
  })

  function applyIdeal(m: IdealMeasurements, garmentId: string) {
    setV((p) => ({
      ...p,
      usualSize: m.usualSize,
      bustCm: str(m.bustCm),
      waistCm: str(m.waistCm),
      hipCm: str(m.hipCm),
      shoulderCm: str(m.shoulderCm),
      preferredLength: m.preferredLength,
    }))
    setAppliedFrom(garmentId)
  }

  function measurementInput(): CustomerMeasurementInput {
    const fromIdeal = !!appliedFrom && appliedFrom === v.idealGarmentId
    const cm = Object.fromEntries(CM.map((k) => [k, numOrNull(v[k])])) as Record<CmKey, number | null>
    return {
      usualSize: v.usualSize || null,
      ...cm,
      shoeSize: orNull(v.shoeSize),
      preferredLength: v.preferredLength || null,
      source: fromIdeal ? 'modelo_ideal' : 'manual',
      sourceGarmentId: fromIdeal ? appliedFrom : null,
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const measurement = measurementInput()
    const len = v.preferredLength || null
    const prevLengths = customer?.preferences.preferredLengths ?? []
    const input: CustomerInput = {
      fullName: v.fullName.trim(),
      phone: onlyDigits(v.phone),
      birthDate: v.birthDate,
      cpf: onlyDigits(v.cpf),
      instagram: instagramOf(v.instagram),
      email: orNull(v.email),
      city: orNull(v.city),
      state: orNull(v.state)?.toUpperCase() ?? null,
      leadSource: v.leadSource || null,
      notes: orNull(v.notes),
      idealGarmentId: v.idealGarmentId,
      preferences: {
        preferredColors: v.preferredColors,
        avoidedColors: v.avoidedColors,
        preferredLengths: len ? [len, ...prevLengths.filter((x) => x !== len)] : prevLengths,
        sleeve: orNull(v.sleeve),
        neckline: orNull(v.neckline),
      },
    }
    if (measurementChanged(customer?.measurements[0], measurement)) input.measurement = measurement

    const issues = customerIssues(input, todayISO())
    if (issues.length) return fail(issuesToErrors(issues, FIELDS))
    setErrors(NO_ERRORS)
    const onError = (x: unknown) => fail(sourceErrors(x, FIELDS))
    if (customer) {
      update.mutate(input, {
        onSuccess: (c) => {
          onSaved?.(c)
          onDone()
        },
        onError,
      })
    } else {
      create.mutate(input, { onSuccess: (c) => (onCreated ? onCreated(c) : onDone()), onError })
    }
  }

  function fail(next: FormErrors) {
    setErrors(next)
    const first = FIELDS.find((k) => next.fields[k])
    if (first) requestAnimationFrame(() => document.getElementById(`cf-${first}`)?.focus())
  }

  return (
    <form id={FORM_ID} className="cf-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}

      <fieldset className="cf-sec">
        <legend>Dados</legend>
        <div className="cf-grid cf-g4">
          <Field label="Nome completo *" autoComplete="off" placeholder="Mariana Fontes Ribeiro" {...f('fullName')} />
          <Field
            label="Telefone / WhatsApp *"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(63) 99612-4478"
            {...f('phone')}
            value={maskPhone(v.phone)}
            onChange={(e) => put('phone', phoneDigits(e.target.value))}
          />
          <Field label="Data de nascimento *" type="date" max={todayISO()} {...f('birthDate')} />
          <Field
            label="CPF *"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            hint="Exigido no contrato"
            {...f('cpf')}
            value={maskCPF(v.cpf)}
            onChange={(e) => put('cpf', onlyDigits(e.target.value).slice(0, 11))}
          />
          <Field label="Instagram" placeholder="@usuaria" autoComplete="off" {...f('instagram')} />
          <Field label="E-mail" type="email" autoComplete="off" placeholder="nome@email.com" {...f('email')} />
          <Field label="Cidade" placeholder="Palmas" {...f('city')} />
          <Field
            label="UF"
            maxLength={2}
            placeholder="TO"
            {...f('state')}
            onChange={(e) => put('state', e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2))}
          />
          <Field as="select" label="Origem do lead" {...f('leadSource')}>
            <option value="">—</option>
            {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((k) => (
              <option key={k} value={k}>
                {LEAD_SOURCE_LABEL[k]}
              </option>
            ))}
          </Field>
          <Field as="textarea" full label="Observações" placeholder="Como chegou, do que gosta, o que evitar…" {...f('notes')} />
        </div>
      </fieldset>

      <fieldset className="cf-sec">
        <legend>Modelo ideal</legend>
        <p className="cf-lead">A peça do acervo que vestiu perfeitamente nela — vira a referência de medidas e de sugestões.</p>
        <IdealGarmentPicker
          value={v.idealGarmentId}
          onChange={(id) => {
            put('idealGarmentId', id)
            setAppliedFrom(null)
          }}
          onUseMeasurements={(m, g) => applyIdeal(m, g.id)}
          applied={!!appliedFrom && appliedFrom === v.idealGarmentId}
        />
        <p className="cf-help">
          <Icon name="regua" size={13} />
          As medidas vêm da peça escolhida e podem ser ajustadas.
        </p>
      </fieldset>

      <fieldset className="cf-sec">
        <legend>Perfil corporal</legend>
        <p className="cf-lead">Pode ficar em branco e ser preenchido na primeira prova.</p>
        <div className="cf-grid cf-g4">
          <Field as="select" label="Tamanho usual" {...f('usualSize')}>
            <option value="">—</option>
            {SIZES.filter((s) => s !== 'U').map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Field>
          <Field label="Busto (cm)" type="number" inputMode="decimal" min={0} step="0.5" {...f('bustCm')} />
          <Field label="Cintura (cm)" type="number" inputMode="decimal" min={0} step="0.5" {...f('waistCm')} />
          <Field label="Quadril (cm)" type="number" inputMode="decimal" min={0} step="0.5" {...f('hipCm')} />
          <Field label="Ombro (cm)" type="number" inputMode="decimal" min={0} step="0.5" {...f('shoulderCm')} />
          <Field label="Altura (cm)" type="number" inputMode="numeric" min={0} step="1" {...f('heightCm')} />
          <Field label="Calçado" inputMode="numeric" placeholder="37" {...f('shoeSize')} />
          <Field as="select" label="Comprimento preferido" {...f('preferredLength')}>
            <option value="">—</option>
            {(Object.keys(LENGTH_LABEL) as GarmentLength[]).map((k) => (
              <option key={k} value={k}>
                {LENGTH_LABEL[k]}
              </option>
            ))}
          </Field>
        </div>
      </fieldset>

      <fieldset className="cf-sec">
        <legend>Preferências</legend>
        <div className="cf-grid cf-g2">
          <TagField id="cf-preferredColors" label="Cores preferidas" placeholder="Verde, Vinho" value={v.preferredColors} onChange={(x) => put('preferredColors', x)} />
          <TagField id="cf-avoidedColors" label="Cores evitadas" placeholder="Amarelo" tone="avoid" value={v.avoidedColors} onChange={(x) => put('avoidedColors', x)} />
          <Field label="Manga" placeholder="Sem manga" {...f('sleeve')} />
          <Field label="Decote" placeholder="V" {...f('neckline')} />
        </div>
      </fieldset>
    </form>
  )
}

/**
 * Lista de valores em chips: vírgula ou Enter confirmam o texto digitado (também ao sair do campo);
 * Backspace com o campo vazio tira o último; cada chip tem "Remover <valor>".
 */
function TagField({
  id,
  label,
  placeholder,
  value,
  onChange,
  tone,
}: {
  id: string
  label: string
  placeholder?: string
  value: string[]
  onChange(v: string[]): void
  tone?: 'avoid'
}) {
  const [text, setText] = useState('')

  function commit(raw: string) {
    const add = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const next = [...value]
    for (const a of add) if (!next.some((x) => x.toLocaleLowerCase('pt-BR') === a.toLocaleLowerCase('pt-BR'))) next.push(a)
    if (next.length !== value.length) onChange(next)
  }

  function change(s: string) {
    if (s.includes(',')) {
      const parts = s.split(',')
      commit(parts.slice(0, -1).join(','))
      setText(parts.at(-1)!.trimStart())
    } else setText(s)
  }

  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(text)
      setText('')
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={['cf-tags', tone && `is-${tone}`].filter(Boolean).join(' ')}>
        {value.map((t) => (
          <span key={t} className="cf-tag">
            {t}
            <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          placeholder={value.length ? '' : placeholder}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          onChange={(e) => change(e.target.value)}
          onKeyDown={key}
          onBlur={() => {
            commit(text)
            setText('')
          }}
        />
      </div>
      <span className="hint" id={`${id}-hint`}>
        Separe por vírgula ou Enter
      </span>
    </div>
  )
}
