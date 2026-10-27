import { useId, useState, type FormEvent } from 'react'
import { usePermissions } from '@/auth/usePermissions'
import { useBrands, useCategories, useCreateGarment, useUpdateGarment } from '@/data/hooks'
import { LENGTH_LABEL, SIZES } from '@/data/labels'
import type { Garment, GarmentInput, GarmentLength, SizeEquiv } from '@/data/types'
import { CLEANING_MAX, garmentIssues } from '@/data/validation'
import { colorHexFor } from '@/domain/colorNames'
import { Button, Field, Icon, Modal } from '@/ui'
import { issuesToErrors, NO_ERRORS, numOrNull, sourceErrors, str, type FormErrors } from './formErrors'
import './garment.css'

const FORM_ID = 'gf-form'
const FIELDS = [
  'name',
  'categorySlug',
  'brandName',
  'labelSize',
  'sizeEquiv',
  'length',
  'colorPrimary',
  'colorHex',
  'fabric',
  'neckline',
  'sleeve',
  'style',
  'acquisitionCost',
  'retailReference',
  'rentalPrice',
  'cleaningDays',
  'location',
  'occasions',
  'fitNotes',
] as const

export type GarmentFormProps = {
  open: boolean
  onClose(): void
  /** Sem peça = "Nova peça"; com peça = "Editar peça". */
  garment?: Garment
  /** Depois de cadastrar (a tela navega para a ficha). */
  onCreated?(g: Garment): void
}

/**
 * Cadastro e edição da peça (protótipo `garmentForm`, campos gf-*). Validação no cliente igual à da fonte;
 * custos (aquisição e referência) só com `acervo.cost` — sem ela, nem são enviados na edição.
 */
export function GarmentForm({ open, onClose, garment, onCreated }: GarmentFormProps) {
  const editing = !!garment
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar peça' : 'Nova peça'}
      description={editing ? `${garment.code} · alterações ficam registradas na auditoria` : 'O código é gerado automaticamente na sequência do acervo'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            {editing ? 'Salvar' : 'Cadastrar peça'}
          </Button>
        </>
      }
    >
      {open && <GarmentFields garment={garment} onDone={onClose} onCreated={onCreated} />}
    </Modal>
  )
}

function initial(g?: Garment) {
  return {
    name: g?.name ?? '',
    categorySlug: g?.categorySlug ?? '',
    brandName: g?.brandName ?? '',
    labelSize: g?.labelSize ?? '',
    sizeEquiv: g?.sizeEquiv ?? 'M',
    length: g?.length ?? 'longo',
    colorPrimary: g?.colorPrimary ?? '',
    colorHex: g?.colorHex ?? '#7A2E43',
    fabric: g?.fabric ?? '',
    neckline: g?.neckline ?? '',
    sleeve: g?.sleeve ?? '',
    style: g?.style ?? '',
    acquisitionCost: str(g?.acquisitionCost),
    retailReference: str(g?.retailReference),
    rentalPrice: str(g?.rentalPrice),
    cleaningDays: str(g?.cleaningDays),
    location: g?.location ?? '',
    occasions: (g?.occasions ?? []).join(', '),
    fitNotes: g?.fitNotes ?? '',
  }
}
type Values = ReturnType<typeof initial>

function GarmentFields({ garment, onDone, onCreated }: { garment?: Garment; onDone(): void; onCreated?(g: Garment): void }) {
  const { can } = usePermissions()
  const canCost = can('acervo.cost')
  const categories = useCategories()
  const brands = useBrands()
  const create = useCreateGarment()
  const update = useUpdateGarment(garment?.id ?? '')
  const brandList = useId()
  const [v, setV] = useState<Values>(() => initial(garment))
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const busy = create.isPending || update.isPending

  const cats = categories.data ?? []
  const categorySlug = v.categorySlug || cats[0]?.slug || ''
  const catDays = cats.find((c) => c.slug === categorySlug)?.cleaningDays

  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))
  // O tom acompanha o nome da cor até a pessoa escolher um tom à mão.
  const [toneTouched, setToneTouched] = useState(!!garment)
  const setColorName = (e: { target: { value: string } }) => {
    const name = e.target.value
    const hex = toneTouched ? null : colorHexFor(name)
    setV((p) => ({ ...p, colorPrimary: name, ...(hex ? { colorHex: hex } : {}) }))
  }
  const f = (k: keyof Values) => ({ id: `gf-${k}`, value: v[k], onChange: set(k), error: errors.fields[k] })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const input: GarmentInput = {
      name: v.name.trim(),
      categorySlug,
      brandName: v.brandName.trim() || null,
      labelSize: v.labelSize.trim() || 'U',
      sizeEquiv: v.sizeEquiv as SizeEquiv,
      length: v.length as GarmentLength,
      colorPrimary: v.colorPrimary.trim() || 'Sem cor definida',
      colorHex: v.colorHex,
      fabric: v.fabric.trim(),
      neckline: v.neckline.trim(),
      sleeve: v.sleeve.trim(),
      style: v.style.trim(),
      occasions: v.occasions
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      fitNotes: v.fitNotes.trim(),
      rentalPrice: numOrNull(v.rentalPrice) ?? 0,
      acquisitionCost: canCost ? numOrNull(v.acquisitionCost) : null,
      retailReference: canCost ? numOrNull(v.retailReference) : null,
      cleaningDays: numOrNull(v.cleaningDays),
      location: v.location.trim(),
    }
    const issues = garmentIssues(input)
    if (issues.length) return setErrors(issuesToErrors(issues, FIELDS))
    setErrors(NO_ERRORS)
    const onError = (x: unknown) => setErrors(sourceErrors(x, FIELDS))
    if (garment) {
      // sem acervo.cost os custos não são enviados (não apaga o que está gravado)
      const patch: Partial<GarmentInput> = { ...input }
      if (!canCost) {
        delete patch.acquisitionCost
        delete patch.retailReference
      }
      update.mutate(patch, { onSuccess: onDone, onError })
    } else {
      create.mutate(input, { onSuccess: (g) => (onCreated ? onCreated(g) : onDone()), onError })
    }
  }

  return (
    <form id={FORM_ID} className="gp-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}
      <div className="fgrid g3c">
        <Field label="Nome / modelo *" placeholder="Vestido Verona" autoComplete="off" {...f('name')} />
        <Field as="select" label="Categoria" {...f('categorySlug')} value={categorySlug}>
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Field>
        <Field label="Marca" list={brandList} autoComplete="off" {...f('brandName')} />
        <datalist id={brandList}>
          {(brands.data ?? []).map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>

        <Field label="Tamanho da etiqueta" placeholder="38" {...f('labelSize')} />
        <Field as="select" label="Equivalência" {...f('sizeEquiv')}>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Field>
        <Field as="select" label="Comprimento" {...f('length')}>
          {(Object.keys(LENGTH_LABEL) as GarmentLength[]).map((k) => (
            <option key={k} value={k}>
              {LENGTH_LABEL[k]}
            </option>
          ))}
        </Field>

        <Field label="Cor" placeholder="Verde esmeralda" {...f('colorPrimary')} onChange={setColorName} />
        <div className="field gf-tone">
          <label htmlFor="gf-colorHex">Tom</label>
          <span className="gf-tone-row">
            <input
              id="gf-colorHex"
              type="color"
              value={v.colorHex}
              onChange={(e) => {
                setToneTouched(true)
                set('colorHex')(e)
              }}
            />
            <span className="mono tiny muted">{v.colorHex.toUpperCase()}</span>
          </span>
        </div>
        <Field label="Tecido" placeholder="Crepe com fenda" {...f('fabric')} />

        <Field label="Decote" placeholder="Tomara que caia" {...f('neckline')} />
        <Field label="Manga" placeholder="Sem manga" {...f('sleeve')} />
        <Field label="Estilo" placeholder="Reto fluido" {...f('style')} />

        {canCost && (
          <>
            <Field label="Custo de aquisição (R$)" type="number" inputMode="decimal" min={0} step="0.01" {...f('acquisitionCost')} />
            <Field label="Valor de referência (R$)" type="number" inputMode="decimal" min={0} step="0.01" {...f('retailReference')} />
          </>
        )}
        <Field label="Valor da locação (R$) *" type="number" inputMode="decimal" min={0} step="0.01" {...f('rentalPrice')} />
        <Field
          label="Higienização (dias)"
          type="number"
          inputMode="numeric"
          min={0}
          max={CLEANING_MAX}
          placeholder={catDays != null ? `herda da categoria (${catDays})` : 'herda da categoria'}
          {...f('cleaningDays')}
        />
        <Field label="Localização física" placeholder="Arara B · pos. 4" {...f('location')} />
        <Field label="Ocasiões" placeholder="Casamento, Formatura" hint="Separe por vírgula" {...f('occasions')} />

        <Field
          as="textarea"
          full
          label="Observações de caimento"
          placeholder="Veste um número abaixo. Cintura marcada, costuma precisar de ajuste."
          {...f('fitNotes')}
        />
      </div>
      <div className="note info">
        <Icon name="camera" size={15} />
        <span>
          <b>Fotos.</b> {garment ? 'Envie e organize as fotos na aba Fotos da ficha.' : 'Depois de cadastrar, envie as fotos na aba Fotos da ficha.'} Sem foto, a peça aparece como
          silhueta na cor cadastrada.
        </span>
      </div>
    </form>
  )
}
