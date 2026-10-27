import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ERROR_MESSAGES, errorMessage } from '@/lib/errorMessages'
import type { ExceptionKind } from '@/data/types'
import { Button, Field } from '@/ui'
import { useExceptionAuthorizer } from './ExceptionAuthorizer'
import './exceptions.css'

export type { ExceptionKind }

const KIND_LABEL: Record<ExceptionKind, string> = {
  retirada_com_saldo: 'Retirada com saldo em aberto',
  desconto_acima_limite: 'Desconto acima do limite',
  dispensa_sinal_minimo: 'Dispensa do sinal mínimo',
}

export type AuthorizeExceptionDialogProps = {
  kind: ExceptionKind
  refType: string
  refId: string
  /** Valor que a exceção cobre (desconto pedido, sinal dispensado, saldo em aberto): a autorização vale até ele. */
  maxAmount?: number
  onAuthorized(id: string): void
  onCancel?(): void
  /** Frase de contexto (ex.: valor do desconto), sob o subtítulo. */
  detail?: ReactNode
}

/**
 * Autorização de exceção por PIN de um administrador presente no balcão. Administradores e autorização vêm do
 * `ExceptionAuthorizer` do contexto (banco por padrão; memória na prévia, com a dica do PIN de demonstração).
 * Falhas vêm no retorno (`{ok:false,error}`) e usam o mesmo mapa de mensagens; exceção = falha de rede.
 */
export function AuthorizeExceptionDialog({ kind, refType, refId, maxAmount, onAuthorized, onCancel, detail }: AuthorizeExceptionDialogProps) {
  const titleId = useId()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const authorizer = useExceptionAuthorizer()

  const admins = useQuery({ queryKey: ['active_admins'], queryFn: () => authorizer.listActiveAdmins() })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setReasonError(undefined)
    if (!reason.trim()) {
      setReasonError(ERROR_MESSAGES.MOTIVO_OBRIGATORIO)
      return
    }
    setBusy(true)
    try {
      const result = await authorizer.authorize({ email, pin, kind, reason: reason.trim(), refType, refId, maxAmount: maxAmount ?? null })
      if (result.ok) {
        onAuthorized(result.id)
        return
      }
      if (result.error === 'MOTIVO_OBRIGATORIO') setReasonError(ERROR_MESSAGES.MOTIVO_OBRIGATORIO)
      else setError(errorMessage(result.error))
    } catch {
      setError(errorMessage(null))
    } finally {
      // O PIN nunca fica no estado depois de uma tentativa, qualquer que seja o desfecho.
      setPin('')
      setBusy(false)
    }
  }

  return (
    <div className="exc-backdrop">
      <div className="exc-dialog card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <form className="card-b" onSubmit={submit} noValidate>
          <p className="eyebrow">{KIND_LABEL[kind]}</p>
          <h2 id={titleId} className="display">Autorizar exceção</h2>
          <p className="muted">Um administrador precisa confirmar com o PIN dele.</p>
          {detail && <p className="note amber">{detail}</p>}

          <Field
            as="select"
            label="Administrador"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            hint={admins.isError ? 'Não foi possível carregar os administradores.' : undefined}
          >
            <option value="">Selecione…</option>
            {(admins.data ?? []).map((a) => (
              <option key={a.id} value={a.email}>
                {a.full_name} ({a.email})
              </option>
            ))}
          </Field>
          <Field
            label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
            hint={authorizer.demoHint}
          />
          <Field as="textarea" label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError} rows={3} />

          {error && (
            <p className="note red" role="alert">
              {error}
            </p>
          )}

          <div className="row exc-actions">
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !email || !pin}>
              Autorizar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
