import type { ReactNode } from 'react'
import { Button } from '@/ui'
import type { Perm } from '@/auth/permissions'
import { usePermissions } from '@/auth/usePermissions'
import { RestrictedPage } from './RestrictedPage'
import './shell.css'

/** Guarda de rota (conveniência de UI — a barreira real é a RLS). Carregando: estado neutro, sem piscar "Acesso restrito". */
export function RequirePerm({ perm, children }: { perm: Perm; children: ReactNode }) {
  const { can, isLoading, isError, refetch } = usePermissions()
  if (isLoading) return <div className="sb-center" role="status">Carregando…</div>
  // Erro de rede/servidor não é falta de permissão: oferece nova tentativa.
  if (isError)
    return (
      <div className="sb-pad" role="alert">
        <p>Não foi possível carregar suas permissões.</p>
        <p><Button variant="primary" onClick={refetch}>Tentar novamente</Button></p>
      </div>
    )
  return can(perm) ? <>{children}</> : <RestrictedPage />
}
