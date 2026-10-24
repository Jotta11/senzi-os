import { useState, type FormEvent } from 'react'
import { Button, Card, Field, Logo } from '@/ui'
import { getSupabase } from '@/lib/supabase'
import { MSG_NO_CLIENT } from './authErrors'
import { useAuth } from './useAuth'
import './auth.css'

export function LoginPage() {
  const { signIn, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function onForgot() {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError('Informe seu e-mail para redefinir a senha.')
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      setError(MSG_NO_CLIENT)
      return
    }
    let failed: boolean
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      })
      failed = !!err
    } catch {
      failed = true
    }
    if (failed) setError('Não foi possível enviar o e-mail de redefinição. Tente novamente.')
    else setInfo('Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.')
  }

  return (
    <main className="login">
      <aside className="login-brand">
        <Logo className="login-logo" />
        <p>Senzi OS · back-office do Senzi Club</p>
      </aside>
      <div className="login-form">
        <Card title="Entrar">
          <form onSubmit={onSubmit} className="login-fields">
            {notice && <p role="alert" className="login-notice">{notice}</p>}
            <Field label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p role="alert" className="login-error">{error}</p>}
            {info && <p role="status" className="login-info">{info}</p>}
            <Button type="submit" variant="primary" disabled={busy}>Entrar</Button>
            <button type="button" className="login-link" onClick={() => void onForgot()}>Esqueci minha senha</button>
          </form>
        </Card>
      </div>
    </main>
  )
}
