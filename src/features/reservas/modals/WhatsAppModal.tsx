import { useState } from 'react'
import { Link } from 'react-router'
import { useSettings } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { daysLate } from '@/domain/money'
import { useToday } from '@/lib/useToday'
import { useAppHref } from '@/shell/appPath'
import { Button, Field, Modal, buttonClass } from '@/ui'
import { messages, waLink, type WaKey } from '../whatsapp'

/** Escolhe uma das 6 mensagens, deixa editar o texto (parte do padrão) e abre o WhatsApp (envio manual, sem registro). */
export function WhatsAppModal({ r, onClose, initialKey }: { r: ReservationDetail; onClose(): void; initialKey?: WaKey }) {
  const settings = useSettings()
  const href = useAppHref()
  const today = useToday()
  const list = messages(r, { lateFeeDailyPercent: settings.data?.lateFeeDailyPercent ?? 0 }, today)
  const late = daysLate(r, today) > 0
  const fallback: WaKey = initialKey ?? (late ? 'atraso' : r.items.some((i) => i.itemState === 'retirado') ? 'devolucao' : 'confirmacao')
  const [key, setKey] = useState<WaKey>(fallback)
  // `null` = texto padrão (acompanha os dados ao vivo); string = texto editado pela atendente.
  const [edited, setEdited] = useState<string | null>(null)
  const msg = list.find((m) => m.key === key) ?? list[0]!
  const text = edited ?? msg.text
  const empty = !text.trim()
  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar no WhatsApp"
      description={`${r.code} · ${r.customer.fullName}`}
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          {empty ? (
            <Button variant="primary" disabled title="Escreva a mensagem">
              Abrir WhatsApp
            </Button>
          ) : (
            <a className={buttonClass('primary')} href={waLink(r.customer.phone, text)} target="_blank" rel="noreferrer" onClick={onClose}>
              Abrir WhatsApp
            </a>
          )}
        </>
      }
    >
      <div className="rd-form">
        <Field as="select" label="Mensagem" value={key} onChange={(e) => { setKey(e.target.value as WaKey); setEdited(null) }}>
          {list.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Field>
        <Field
          as="textarea"
          label="Texto da mensagem"
          className="rd-wa-text"
          rows={6}
          value={text}
          onChange={(e) => setEdited(e.target.value)}
          hint={edited !== null && edited !== msg.text ? 'Texto editado só para este envio.' : 'Pode editar o texto antes de enviar.'}
        />
        {edited !== null && edited !== msg.text && (
          <div>
            <Button size="sm" onClick={() => setEdited(null)}>
              Restaurar texto padrão
            </Button>
          </div>
        )}
        {msg.text.includes('PDF') ? (
          <p className="note amber">
            <span>
              <b>O WhatsApp não anexa o PDF sozinho.</b> Salve o{' '}
              <Link to={href(`/reservas/${r.id}/${key === 'contrato' ? 'contrato' : 'os'}`)} onClick={onClose}>
                {key === 'contrato' ? 'PDF do contrato' : 'PDF da OS'}
              </Link>{' '}
              e anexe na conversa antes de enviar.
            </span>
          </p>
        ) : (
          <p className="tiny muted">O envio é manual: o WhatsApp abre com o texto pronto.</p>
        )}
      </div>
    </Modal>
  )
}
