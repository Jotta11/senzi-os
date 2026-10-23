import { useState, type FormEvent } from 'react'
import { Button, Card, Field } from '@/ui'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN, validateNewPassword } from './passwordRules'
import { useAuth } from './useAuth'
import './auth.css'

/** Tela aberta pelo link de "Esqueci minha senha" (evento PASSWORD_RECOVERY). */
export function NewPasswordPage() {
  const { updatePassword, finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(password, confirm)
    setError(invalid)
    if (invalid) return
    setBusy(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <aside className="login-brand">
        <span className="login-logo">Senzi</span>
        <p>Senzi OS · back-office do Senzi Club</p>
      </aside>
      <div className="login-form">
        <Card title="Definir nova senha">
          {done ? (
            <div className="login-fields">
              <p role="status" className="login-info">Senha alterada com sucesso.</p>
              <Button variant="primary" onClick={finishRecovery}>Continuar</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="login-fields" noValidate>
              <Field label="Nova senha" type="password" autoComplete="new-password" required hint={`De ${PASSWORD_MIN} a ${PASSWORD_MAX_BYTES} caracteres.`} value={password} onChange={(e) => setPassword(e.target.value)} />
              <Field label="Confirmar nova senha" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {error && <p role="alert" className="login-error">{error}</p>}
              <Button type="submit" variant="primary" disabled={busy}>Salvar nova senha</Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}
