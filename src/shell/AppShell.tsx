import { Outlet } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { usePermissions } from '@/auth/usePermissions'
import { Icon } from '@/ui'
import { NAV } from './nav'
import { Sidebar } from './Sidebar'
import './shell.css'

const ROLE = { admin: 'Administrador', atendimento: 'Atendimento' } as const

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')

/** Moldura do app logado: sidebar filtrada por permissão + conteúdo da rota. */
export function AppShell() {
  const { user, signOut } = useAuth()
  const { can } = usePermissions()
  const items = NAV.filter((n) => can(n.perm)).map((n) => ({ to: n.path, icon: n.icon, label: n.label }))
  return (
    <div className="sb-app">
      <Sidebar
        items={items}
        footer={
          <>
            <span className="sb-av" aria-hidden="true">{user ? initials(user.full_name) : ''}</span>
            <span className="sb-who">
              <b>{user?.full_name}</b>
              <span>{user ? ROLE[user.role] : ''}</span>
            </span>
            <button type="button" className="sb-signout" aria-label="Sair" title="Sair" onClick={() => void signOut()}>
              <Icon name="seta" size={14} />
              <span>Sair</span>
            </button>
          </>
        }
      />
      <main className="sb-content">
        <Outlet />
      </main>
    </div>
  )
}
