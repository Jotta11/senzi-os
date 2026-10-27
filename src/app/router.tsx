import type { ReactNode } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AuthGate } from '@/auth/AuthGate'
import { AcervoListPage } from '@/features/acervo/AcervoListPage'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { ClientesListPage } from '@/features/clientes/ClientesListPage'
import { CustomerPage } from '@/features/clientes/CustomerPage'
import { ConfigPage } from '@/features/config/ConfigPage'
import { previewRoutes } from '@/preview/previewRoutes'
import { AppShell } from '@/shell/AppShell'
import { ComingSoon } from '@/shell/ComingSoon'
import { NotFound } from '@/shell/NotFound'
import { NAV } from '@/shell/nav'
import { RequirePerm } from '@/shell/RequirePerm'
import { SupabaseDataLayout } from './SupabaseDataLayout'

/** Telas do app real que já estão no banco; as demais seguem "Em breve". */
const LIVE: Record<string, ReactNode> = {
  '/acervo': <AcervoListPage />,
  '/clientes': <ClientesListPage />,
  '/config': <ConfigPage />,
}

/** Rotas do Senzi OS. `/preview/*` é pública (prévia visual com dados fictícios em memória); o resto exige login. */
export const appRoutes: RouteObject[] = [
  previewRoutes,
  {
    element: <AuthGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <SupabaseDataLayout />,
            children: [
              ...NAV.map((n) => ({
                path: n.path,
                element: <RequirePerm perm={n.perm}>{LIVE[n.path] ?? <ComingSoon title={n.label} />}</RequirePerm>,
              })),
              {
                path: '/acervo/:id',
                element: (
                  <RequirePerm perm="acervo.view">
                    <GarmentPage />
                  </RequirePerm>
                ),
              },
              {
                path: '/clientes/:id',
                element: (
                  <RequirePerm perm="cliente.view">
                    <CustomerPage />
                  </RequirePerm>
                ),
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
