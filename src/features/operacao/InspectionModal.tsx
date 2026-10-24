import { useId, useState, type FormEvent } from 'react'
import { useChecklist, useInspectionTarget, useRegisterInspection, useSuppliers } from '@/data/hooks-operacao'
import { MAINTENANCE_KIND } from '@/data/labels-ops'
import type { Garment, InspectionFinding, MaintenanceKind, Severity } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Field, Icon, Modal, useToast } from '@/ui'

const FORM_ID = 'op-insp-form'
type Mark = { on: boolean; severity: Severity; note: string }
type PhotoKind = 'devolucao' | 'dano' | 'detalhe'
const PHOTO_LABEL: Record<PhotoKind, string> = { devolucao: 'Devolução', dano: 'Dano', detalhe: 'Detalhe' }
const KINDS = Object.keys(MAINTENANCE_KIND) as MaintenanceKind[]

export type InspectionModalProps = { garment: Garment | null; onClose(): void }

/** Inspeção de devolução (spec §1.3.1): marca-se só o que está com problema; a severidade decide o destino da peça. */
export function InspectionModal({ garment, onClose }: InspectionModalProps) {
  const target = useInspectionTarget(garment?.id)
  const sub = garment ? `${garment.code} · ${garment.name}${target.data ? ` · devolvida por ${target.data.customerName}` : ''}` : undefined
  return (
    <Modal
      open={!!garment}
      onClose={onClose}
      size="lg"
      title="Inspeção de devolução"
      description={sub}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID} icon="check">
            Registrar inspeção
          </Button>
        </>
      }
    >
      {garment && <InspectionForm garment={garment} reservationId={target.data?.reservationId ?? null} onDone={onClose} />}
    </Modal>
  )
}

function InspectionForm({ garment: g, reservationId, onDone }: { garment: Garment; reservationId: string | null; onDone(): void }) {
  const toast = useToast()
  const checklist = useChecklist()
  const suppliers = useSuppliers()
  const register = useRegisterInspection()
  const listId = useId()
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [photos, setPhotos] = useState<PhotoKind[]>([])
  const [kind, setKind] = useState<MaintenanceKind>('costura')
  const [provider, setProvider] = useState('')
  const [openRepair, setOpenRepair] = useState(false)
  const [perda, setPerda] = useState(false)
  const [notes, setNotes] = useState('')

  const items = checklist.data ?? []
  const marked = items.filter((i) => marks[i.id]?.on)
  const hasGrave = marked.some((i) => marks[i.id]!.severity === 'grave')
  const patch = (id: string, p: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...(m[id] ?? { on: false, severity: 'leve' as Severity, note: '' }), ...p } }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (register.isPending) return
    const findings: InspectionFinding[] = marked.map((i) => ({ label: i.label, ok: false, severity: marks[i.id]!.severity, note: marks[i.id]!.note.trim() || null }))
    register.mutate(
      { garmentId: g.id, reservationId, findings, photos: photos.map((p) => ({ kind: p })), perda: hasGrave && perda, maintenanceKind: kind, provider: provider.trim() || null, openRepair: !hasGrave && openRepair, notes: notes.trim() || null },
      {
        onSuccess: ({ result }) => {
          toast({ title: 'Inspeção registrada', description: result === 'perda' ? `${g.code} bloqueada para avaliação gerencial.` : result === 'reprovada' ? `${g.code} enviada para manutenção.` : `${g.code} enviada para higienização.`, tone: 'ok' })
          onDone()
        },
        onError: (err) => toast({ title: 'Não foi possível registrar a inspeção', description: errorMessage(err), tone: 'error' }),
      },
    )
  }

  return (
    <form id={FORM_ID} className="op-form" onSubmit={submit} noValidate>
      <div className="note info">
        <Icon name="operacao" size={15} />
        <span>
          Marque apenas o que estiver <b>com problema</b>. A severidade decide o destino da peça: leve segue para higienização, grave abre manutenção bloqueante, e dano com risco de perda vai para avaliação da gestão.
        </span>
      </div>

      <ul className="op-chk" aria-label="Checklist da inspeção">
        {items.map((i) => {
          const m = marks[i.id]
          return (
            <li key={i.id}>
              <label>
                <input type="checkbox" checked={!!m?.on} onChange={(e) => patch(i.id, { on: e.target.checked })} />
                {i.label}
              </label>
              <select aria-label={`Severidade de ${i.label}`} disabled={!m?.on} value={m?.severity ?? 'leve'} onChange={(e) => patch(i.id, { severity: e.target.value as Severity })}>
                <option value="leve">leve</option>
                <option value="media">média</option>
                <option value="grave">grave</option>
              </select>
              <input type="text" aria-label={`Descrição de ${i.label}`} placeholder="descrição" disabled={!m?.on} value={m?.note ?? ''} onChange={(e) => patch(i.id, { note: e.target.value })} />
            </li>
          )
        })}
      </ul>

      <div>
        <p className="eyebrow">Registro fotográfico</p>
        <div className="op-photos">
          <div className="op-photo-btns">
            {(Object.keys(PHOTO_LABEL) as PhotoKind[]).map((k) => (
              <Button key={k} size="sm" icon="camera" onClick={() => setPhotos((p) => [...p, k])}>
                {PHOTO_LABEL[k]}
              </Button>
            ))}
          </div>
          {photos.length === 0 ? (
            <span className="muted tiny">Nenhuma foto anexada.</span>
          ) : (
            photos.map((k, idx) => (
              <span key={idx} className="op-photo">
                <Icon name="camera" size={16} />
                {PHOTO_LABEL[k]}
                <button type="button" aria-label="Remover foto" onClick={() => setPhotos((p) => p.filter((_, j) => j !== idx))}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="op-fields">
        <Field as="select" id="op-kind" label="Tipo de serviço, se houver reparo" value={kind} onChange={(e) => setKind(e.target.value as MaintenanceKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {MAINTENANCE_KIND[k]}
            </option>
          ))}
        </Field>
        <Field id="op-provider" label="Fornecedor" list={listId} value={provider} onChange={(e) => setProvider(e.target.value)} />
        <datalist id={listId}>
          {(suppliers.data ?? []).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {marked.length > 0 && !hasGrave && (
          <label className="op-opt full">
            <input type="checkbox" checked={openRepair} onChange={(e) => setOpenRepair(e.target.checked)} />
            <span>Abrir ordem de reparo leve além da higienização</span>
          </label>
        )}
        <Field as="textarea" id="op-notes" full label="Observação geral" placeholder="Peça devolvida em boas condições." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {marked.length > 0 && (
        <div className="note amber" role="status">
          <Icon name="alerta" size={15} />
          {hasGrave ? (
            <span>
              <b>Dano grave marcado.</b> A peça vai para <b>manutenção</b> e fica bloqueada até o reparo ser concluído. Se houver risco de perda, marque a opção abaixo para enviar à avaliação gerencial.
            </span>
          ) : (
            <span>
              <b>{marked.length} ressalva(s).</b> A peça segue para higienização. Marque “abrir ordem de reparo leve” se o ateliê precisar intervir antes de ela voltar à arara.
            </span>
          )}
        </div>
      )}
      {hasGrave && (
        <label className="op-opt">
          <input type="checkbox" checked={perda} onChange={(e) => setPerda(e.target.checked)} />
          <span>
            <b>Possível perda da peça</b> — bloquear para avaliação gerencial em vez de mandar para o ateliê
          </span>
        </label>
      )}
    </form>
  )
}
