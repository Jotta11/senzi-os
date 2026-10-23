import { createBrowserRouter, type RouteObject } from 'react-router'
import { AuthGate } from '@/auth/AuthGate'
import { PreviewPage } from '@/preview/PreviewPage'
import { AppShell } from '@/shell/AppShell'
import { ComingSoon } from '@/shell/ComingSoon'
import { NAV } from '@/shell/nav'
import { RequirePerm } from '@/shell/RequirePerm'

/** Rotas do Senzi OS. `/preview` é pública (prévia visual com dados fictícios); o resto exige login. */
export const appRoutes: RouteObject[] = [
  { path: '/preview', element: <PreviewPage /> },
  {
    element: <AuthGate />,
    children: [
      {
        element: <AppShell />,
        children: NAV.map((n) => ({
          path: n.path,
          element: (
            <RequirePerm perm={n.perm}>
              <ComingSoon title={n.label} />
            </RequirePerm>
          ),
        })),
      },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
