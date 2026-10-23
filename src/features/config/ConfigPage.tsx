import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useAuth } from '@/auth/useAuth'
import { usePermissions } from '@/auth/usePermissions'
import { AuditTab } from './AuditTab'
import { PermissionsTab } from './PermissionsTab'
import { PinTab } from './PinTab'
import { UsersTab } from './UsersTab'
import '@/shell/shell.css'
import './config.css'

type TabDef = { key: string; label: string; render(): ReactNode }

/**
 * Configurações: abas visíveis conforme permissão (conveniência — o banco decide).
 * Usuários/Permissões: config.users · PIN: perfil admin · Auditoria: config.audit.
 */
export function ConfigPage() {
  const { user } = useAuth()
  const { can } = usePermissions()
  const baseId = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const tabs: TabDef[] = []
  if (can('config.users')) {
    tabs.push({ key: 'usuarios', label: 'Usuários', render: () => <UsersTab /> })
    tabs.push({ key: 'permissoes', label: 'Permissões', render: () => <PermissionsTab /> })
  }
  if (user?.role === 'admin') tabs.push({ key: 'pin', label: 'PIN', render: () => <PinTab /> })
  if (can('config.audit')) tabs.push({ key: 'auditoria', label: 'Auditoria', render: () => <AuditTab /> })

  const [selected, setSelected] = useState<string | null>(null)
  const current = tabs.find((t) => t.key === selected) ?? tabs[0]

  function onKeyDown(e: KeyboardEvent) {
    if (!current) return
    const i = tabs.indexOf(current)
    const next =
      e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
      : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
      : e.key === 'Home' ? tabs[0]
      : e.key === 'End' ? tabs[tabs.length - 1]
      : undefined
    if (!next) return
    e.preventDefault()
    setSelected(next.key)
    tabRefs.current[next.key]?.focus()
  }

  return (
    <div className="sb-pad">
      <p className="eyebrow">Senzi OS</p>
      <h1 className="display">Configurações</h1>
      {!current ? (
        <p>Nenhuma configuração disponível para o seu perfil.</p>
      ) : (
        <>
          <div className="cfg-tabs" role="tablist" aria-label="Configurações" onKeyDown={onKeyDown}>
            {tabs.map((t) => {
              const active = t.key === current.key
              return (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[t.key] = el
                  }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${t.key}`}
                  aria-selected={active}
                  aria-controls={`${baseId}-panel-${t.key}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setSelected(t.key)}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <div role="tabpanel" id={`${baseId}-panel-${current.key}`} aria-labelledby={`${baseId}-tab-${current.key}`} tabIndex={0}>
            {current.render()}
          </div>
        </>
      )}
    </div>
  )
}
