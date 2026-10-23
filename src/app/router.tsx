import { createBrowserRouter, type RouteObject } from 'react-router'
import { AuthGate } from '@/auth/AuthGate'
import { ConfigPage } from '@/features/config/ConfigPage'
import { previewRoutes } from '@/preview/previewRoutes'
import { AppShell } from '@/shell/AppShell'
import { ComingSoon } from '@/shell/ComingSoon'
import { NotFound } from '@/shell/NotFound'
import { NAV } from '@/shell/nav'
import { RequirePerm } from '@/shell/RequirePerm'

/** Rotas do Senzi OS. `/preview/*` é pública (prévia visual com dados fictícios em memória); o resto exige login. */
export const appRoutes: RouteObject[] = [
  previewRoutes,
  {
    element: <AuthGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          ...NAV.map((n) => ({
            path: n.path,
            element: (
              <RequirePerm perm={n.perm}>
                {n.path === '/config' ? <ConfigPage /> : <ComingSoon title={n.label} />}
              </RequirePerm>
            ),
          })),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
