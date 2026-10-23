import type { ReactNode } from 'react'
import type { Perm } from '@/auth/permissions'
import { usePermissions } from '@/auth/usePermissions'
import { RestrictedPage } from './RestrictedPage'
import './shell.css'

/** Guarda de rota (conveniência de UI — a barreira real é a RLS). Carregando: estado neutro, sem piscar "Acesso restrito". */
export function RequirePerm({ perm, children }: { perm: Perm; children: ReactNode }) {
  const { can, isLoading } = usePermissions()
  if (isLoading) return <div className="sb-center" role="status">Carregando…</div>
  return can(perm) ? <>{children}</> : <RestrictedPage />
}
