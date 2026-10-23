import { createBrowserRouter } from 'react-router'
import { App } from '@/app/App'
import { AuthGate } from '@/auth/AuthGate'
import { PreviewPage } from '@/preview/PreviewPage'

/** Rotas do Senzi OS. `/preview` é pública (prévia visual com dados fictícios); o resto exige login. */
export const router = createBrowserRouter([
  { path: '/preview', element: <PreviewPage /> },
  { element: <AuthGate />, children: [{ path: '/', element: <App /> }] },
])
