import { useAuth } from '@/auth/useAuth'
import { usePermissions } from '@/auth/usePermissions'
import { Tabs, type TabItem } from '@/ui'
import { AuditTab } from './AuditTab'
import { PermissionsTab } from './PermissionsTab'
import { PinTab } from './PinTab'
import { UsersTab } from './UsersTab'
import '@/shell/shell.css'
import './config.css'

/**
 * Configurações: abas visíveis conforme permissão (conveniência — o banco decide).
 * Usuários/Permissões: config.users · PIN: perfil admin · Auditoria: config.audit.
 */
export function ConfigPage() {
  const { user } = useAuth()
  const { can } = usePermissions()

  const tabs: TabItem[] = []
  if (can('config.users')) {
    tabs.push({ key: 'usuarios', label: 'Usuários', content: () => <UsersTab /> })
    tabs.push({ key: 'permissoes', label: 'Permissões', content: () => <PermissionsTab /> })
  }
  if (user?.role === 'admin') tabs.push({ key: 'pin', label: 'PIN', content: () => <PinTab /> })
  if (can('config.audit')) tabs.push({ key: 'auditoria', label: 'Auditoria', content: () => <AuditTab /> })

  return (
    <div className="sb-pad">
      <p className="eyebrow">Senzi OS</p>
      <h1 className="display">Configurações</h1>
      {tabs.length === 0 ? <p>Nenhuma configuração disponível para o seu perfil.</p> : <Tabs label="Configurações" tabs={tabs} />}
    </div>
  )
}
