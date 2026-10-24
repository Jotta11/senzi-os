import type { RouteObject } from 'react-router'
import { AcervoListPage } from '@/features/acervo/AcervoListPage'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { ClientesListPage } from '@/features/clientes/ClientesListPage'
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
    { path: 'acervo', element: <AcervoListPage /> },
    { path: 'acervo/:id', element: <GarmentPage /> },
    { path: 'clientes', element: <ClientesListPage /> },
    // TODO(Plano 2A Task 5): ficha da cliente
    { path: 'clientes/:id', element: <ComingSoon title="Ficha da cliente" /> },
    { path: '*', element: <PreviewComingSoon /> },
  ],
}
