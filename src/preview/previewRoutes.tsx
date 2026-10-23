import type { RouteObject } from 'react-router'
import { ComingSoon } from '@/shell/ComingSoon'
import { PREVIEW_BASE } from './paths'
import { PreviewComingSoon } from './PreviewComingSoon'
import { PreviewLayout } from './PreviewLayout'
import { PreviewPage } from './PreviewPage'

/**
 * Rotas da prévia visual (públicas, sem login, dados fictícios em memória).
 * As Tasks 2–5 do Plano 2A trocam os placeholders abaixo pelas telas definitivas.
 */
export const previewRoutes: RouteObject = {
  path: PREVIEW_BASE,
  element: <PreviewLayout />,
  children: [
    { index: true, element: <PreviewPage /> },
    // TODO(Plano 2A Task 2): lista do acervo
    { path: 'acervo', element: <ComingSoon title="Acervo" /> },
    // TODO(Plano 2A Task 3): ficha da peça
    { path: 'acervo/:id', element: <ComingSoon title="Ficha da peça" /> },
    // TODO(Plano 2A Task 4): lista de clientes
    { path: 'clientes', element: <ComingSoon title="Clientes" /> },
    // TODO(Plano 2A Task 5): ficha da cliente
    { path: 'clientes/:id', element: <ComingSoon title="Ficha da cliente" /> },
    { path: '*', element: <PreviewComingSoon /> },
  ],
}
