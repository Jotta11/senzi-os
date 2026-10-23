import { createBrowserRouter } from 'react-router'
import { App } from '@/app/App'
import { PreviewPage } from '@/preview/PreviewPage'

/** Rotas do Senzi OS. `/preview` é pública (prévia visual com dados fictícios). */
export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/preview', element: <PreviewPage /> },
])
