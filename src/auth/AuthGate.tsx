import { Outlet } from 'react-router'
import { getEnv } from '@/lib/env'
import { Button } from '@/ui'
import { LoginPage } from './LoginPage'
import { NewPasswordPage } from './NewPasswordPage'
import { SetupScreen } from './SetupScreen'
import { useAuth } from './useAuth'
import './auth.css'

/** Porta de entrada das rotas privadas: sem env → configuração; sem sessão → login; com sessão → rota filha. */
export function AuthGate() {
  const { status, loadError, retry, recovery } = useAuth()
  if (!getEnv()) return <SetupScreen />
  // Link de redefinição: a sessão de recuperação já existe; pede a nova senha antes do app.
  if (recovery && status !== 'signed_out') return <NewPasswordPage />
  if (status === 'loading' && loadError)
    return (
      <div className="auth-loading" role="alert">
        <p>{loadError}</p>
        <Button variant="primary" onClick={() => void retry()}>Tentar novamente</Button>
      </div>
    )
  if (status === 'loading') return <div className="auth-loading" role="status">Carregando…</div>
  if (status === 'signed_out') return <LoginPage />
  return <Outlet />
}
