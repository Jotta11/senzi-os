import { useId, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { ERROR_MESSAGES, errorMessage } from '@/lib/errorMessages'
import { Button, Field } from '@/ui'
import './exceptions.css'

export type ExceptionKind = 'retirada_com_saldo' | 'desconto_acima_limite' | 'dispensa_sinal_minimo'

const KIND_LABEL: Record<ExceptionKind, string> = {
  retirada_com_saldo: 'Retirada com saldo em aberto',
  desconto_acima_limite: 'Desconto acima do limite',
  dispensa_sinal_minimo: 'Dispensa do sinal mínimo',
}

type Admin = { id: string; full_name: string; email: string }

export type AuthorizeExceptionDialogProps = {
  kind: ExceptionKind
  refType: string
  refId: string
  onAuthorized(id: string): void
  onCancel?(): void
}

/**
 * Autorização de exceção por PIN de um administrador presente no balcão.
 * Falhas de autenticação vêm no retorno (`{ok:false,error}`); erros de requisição
 * vêm como exceção da RPC — os dois caminhos usam o mesmo mapa de mensagens.
 */
export function AuthorizeExceptionDialog({ kind, refType, refId, onAuthorized, onCancel }: AuthorizeExceptionDialogProps) {
  const titleId = useId()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const admins = useQuery({
    queryKey: ['active_admins'],
    queryFn: async () => {
      const sb = getSupabase()
      if (!sb) return []
      const { data, error } = await sb.rpc('list_active_admins')
      if (error) throw error
      return (data ?? []) as Admin[]
    },
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setReasonError(undefined)
    if (!reason.trim()) {
      setReasonError(ERROR_MESSAGES.MOTIVO_OBRIGATORIO)
      return
    }
    const sb = getSupabase()
    if (!sb) return
    setBusy(true)
    try {
      const { data, error: rpcError } = await sb.rpc('authorize_exception', {
        p_admin_email: email,
        p_pin: pin,
        p_kind: kind,
        p_reason: reason.trim(),
        p_ref_type: refType,
        p_ref_id: refId,
      })
      if (rpcError) {
        if (rpcError.message === 'MOTIVO_OBRIGATORIO') setReasonError(ERROR_MESSAGES.MOTIVO_OBRIGATORIO)
        else setError(errorMessage(rpcError))
        return
      }
      const result = data as { ok: boolean; id?: string; error?: string } | null
      if (result?.ok && result.id) {
        onAuthorized(result.id)
        return
      }
      setPin('')
      setError(errorMessage(result?.error ?? ''))
    } catch {
      setError(errorMessage(null))
    } finally {
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
