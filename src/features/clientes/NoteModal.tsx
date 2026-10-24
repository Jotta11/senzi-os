import { useState, type FormEvent } from 'react'
import { useAddNote } from '@/data/hooks'
import { CHANNEL_LABEL } from '@/data/labels'
import type { ContactChannel, Customer } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Field, Icon, Modal } from '@/ui'
import { NO_ERRORS, sourceErrors, type FormErrors } from '../acervo/formErrors'
import './customer.css'

const FORM_ID = 'cn-form'
const FIELDS = ['content'] as const

export type NoteModalProps = { customer: Customer; open: boolean; onClose(): void }

/** "Registrar observação" (protótipo `addNote`): o que a equipe precisa lembrar, canal e "Fixar no topo da ficha". */
export function NoteModal({ customer: c, open, onClose }: NoteModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar observação"
      description={c.fullName}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Registrar
          </Button>
        </>
      }
    >
      {open && <NoteForm customer={c} onDone={onClose} />}
    </Modal>
  )
}

function NoteForm({ customer: c, onDone }: { customer: Customer; onDone(): void }) {
  const add = useAddNote(c.id)
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState<ContactChannel>('presencial')
  const [pinned, setPinned] = useState(false)
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!content.trim()) return setErrors({ fields: { content: errorMessage('OBSERVACAO_OBRIGATORIA') }, top: null })
    setErrors(NO_ERRORS)
    add.mutate({ content: content.trim(), channel, pinned }, { onSuccess: onDone, onError: (x) => setErrors(sourceErrors(x, FIELDS)) })
  }

  return (
    <form id={FORM_ID} className="cp-form" onSubmit={submit} noValidate>
      {errors.top && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>{errors.top}</span>
        </div>
      )}
      <Field
        as="textarea"
        id="cn-content"
        label="O que a equipe precisa lembrar"
        placeholder="Prefere vestidos sem manga. Não gosta de tecido pesado."
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        error={errors.fields.content}
      />
      <div className="cp-note-row">
        <Field as="select" id="cn-channel" label="Canal" value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>
          {(Object.keys(CHANNEL_LABEL) as ContactChannel[]).map((k) => (
            <option key={k} value={k}>
              {CHANNEL_LABEL[k]}
            </option>
          ))}
        </Field>
        <div className="cp-check">
          <input id="cn-pin" type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} aria-describedby="cn-pin-hint" />
          <span>
            <label htmlFor="cn-pin">Fixar no topo da ficha</label>
            <small id="cn-pin-hint">aparece em “Lembre-se ao atender”</small>
          </span>
        </div>
      </div>
    </form>
  )
}
