import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { ToastProvider } from '@/ui'
import { AppPathContext } from '@/shell/appPath'
import { NAV } from '@/shell/nav'
import { Sidebar } from '@/shell/Sidebar'
import { PREVIEW_BASE, previewHref } from './paths'
import { PreviewPermissionsProvider } from './PreviewPermissions'
import { PREVIEW_ROLES, usePreviewRole } from './previewRole'
import '@/shell/shell.css'
import './preview.css'

const ROLE_USER: Record<string, string> = Object.fromEntries(PREVIEW_ROLES.map((r) => [r.role, r.userName]))

// Estado da prévia vive enquanto a aba estiver aberta (recarregar volta aos dados de exemplo).
let defaultSource: DataSource | null = null
let defaultClient: QueryClient | null = null
/** Perfil atual, para a fonte saber quem assina observações e históricos. */
let currentRole = 'admin'

function previewSource() {
  defaultSource ??= createMockSource({ userName: () => ROLE_USER[currentRole] ?? 'Júlia Senzi' })
  return defaultSource
}
function previewClient() {
  defaultClient ??= new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } } })
  return defaultClient
}

export type PreviewLayoutProps = {
  /** Fonte de dados (padrão: a fonte em memória da prévia). Testes passam `createMockSource({ latencyMs: 0 })`. */
  source?: DataSource
  /** Cliente do TanStack Query (padrão: um exclusivo da prévia, separado do app real). */
  queryClient?: QueryClient
}

/**
 * Moldura da prévia visual (pública, sem login, sem banco): mesma Sidebar do app com links para /preview/*,
 * faixa "Prévia visual · dados fictícios" e seletor "Ver como". Provê `DataSource`, permissões simuladas e o
 * prefixo de rotas para as telas.
 */
export function PreviewLayout({ source, queryClient }: PreviewLayoutProps) {
  // `?como=atendimento` abre já nesse perfil (links de conferência); depois vale o seletor.
  const [params] = useSearchParams()
  const initialRole = params.get('como') === 'atendimento' ? 'atendimento' : 'admin'
  return (
    <QueryClientProvider client={queryClient ?? previewClient()}>
      <DataSourceProvider source={source ?? previewSource()}>
        <PreviewPermissionsProvider initialRole={initialRole}>
          <AppPathContext.Provider value={PREVIEW_BASE}>
            <ToastProvider>
              <Frame />
            </ToastProvider>
          </AppPathContext.Provider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>
  )
}

function Frame() {
  const { can } = usePermissions()
  const { role } = usePreviewRole()
  const who = PREVIEW_ROLES.find((r) => r.role === role)!
  useEffect(() => {
    currentRole = role
  }, [role])
  const items = NAV.filter((n) => can(n.perm)).map((n) => ({ to: n.path, icon: n.icon, label: n.label }))
  return (
    <div className="sb-app">
      <Sidebar
        search
        items={items}
        linkTo={previewHref}
        footer={
          <>
            <span className="sb-av" aria-hidden="true">
              {who.initials}
            </span>
            <span className="sb-who">
              <b>{who.userName}</b>
              <span>{who.label}</span>
            </span>
          </>
        }
      />
      <main className="sb-content">
        <PreviewBand />
        <Outlet />
      </main>
    </div>
  )
}

function PreviewBand() {
  const { role, setRole } = usePreviewRole()
  return (
    <div className="pv-band">
      <p className="pv-band-t">
        <span className="pv-band-dot" aria-hidden="true" />
        Prévia visual · dados fictícios
      </p>
      <div className="pv-viewas">
        <span className="pv-viewas-l" id="pv-viewas-l">
          Ver como
        </span>
        <div className="pv-seg" role="group" aria-labelledby="pv-viewas-l">
          {PREVIEW_ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => setRole(r.role)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
