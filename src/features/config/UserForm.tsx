import { useState, type FormEvent } from 'react'
import { getSupabase } from '@/lib/supabase'
import { errorMessage, GENERIC_ERROR } from '@/lib/errorMessages'
import { Button, Field } from '@/ui'
import { ROLE_LABEL, updateUser, type Role, type UserRow } from './queries'

type Props = { onDone(): void; onCancel(): void } & ({ mode: 'create' } | { mode: 'edit'; user: UserRow })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lê `{ error }` do corpo de uma resposta não-2xx da Edge Function. */
async function functionError(err: unknown): Promise<string> {
  const ctx = err && typeof err === 'object' && 'context' in err ? (err as { context: unknown }).context : null
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.json()) as { error?: unknown }
      if (typeof body.error === 'string') return body.error
    } catch {
      // corpo não-JSON: cai na mensagem genérica
    }
  }
  return GENERIC_ERROR
}

/** Criação (via Edge Function `admin-users`) ou edição de perfil/status (via `admin_update_user`). */
export function UserForm(props: Props) {
  const editing = props.mode === 'edit' ? props.user : null
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(editing?.role ?? 'atendimento')
  const [active, setActive] = useState(editing?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function validateCreate(): string | null {
    if (!fullName.trim()) return 'Informe o nome.'
    if (!EMAIL_RE.test(email.trim())) return 'Informe um e-mail válido.'
    if (password.length < 8) return 'A senha deve ter ao menos 8 caracteres.'
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!editing) {
      const invalid = validateCreate()
      if (invalid) return setError(invalid)
    }
    setBusy(true)
    try {
      if (editing) {
        await updateUser({ id: editing.id, role, is_active: active }, null)
      } else {
        const sb = getSupabase()
        if (!sb) throw new Error()
        const { error: fnError } = await sb.functions.invoke('admin-users', {
          body: { action: 'create', full_name: fullName.trim(), email: email.trim(), role, password },
        })
        if (fnError) return setError(await functionError(fnError))
      }
      props.onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="cfg-form" onSubmit={submit} noValidate aria-label={editing ? `Editar ${editing.full_name}` : 'Novo usuário'}>
      {editing ? (
        <div>
          <strong>{editing.full_name}</strong>
          <span className="cfg-sub muted tiny">{editing.email}</span>
        </div>
      ) : (
        <>
          <Field label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
          <Field label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </>
      )}
      <Field as="select" label="Perfil" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </Field>
      {editing ? (
        <label className="cfg-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Usuário ativo
        </label>
      ) : (
        <Field
          label="Senha inicial"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres. A pessoa pode trocá-la depois."
        />
      )}
      {error && (
        <p className="note red cfg-full" role="alert">
          {error}
        </p>
      )}
      <div className="cfg-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {editing ? 'Salvar' : 'Criar usuário'}
        </Button>
      </div>
    </form>
  )
}
