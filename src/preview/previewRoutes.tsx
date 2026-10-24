import type { RouteObject } from 'react-router'
import { AcervoListPage } from '@/features/acervo/AcervoListPage'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { ClientesListPage } from '@/features/clientes/ClientesListPage'
import { CustomerPage } from '@/features/clientes/CustomerPage'
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
    { path: 'agenda', element: <AgendaPage /> },
    { path: 'clientes', element: <ClientesListPage /> },
    { path: 'clientes/:id', element: <CustomerPage /> },
    { path: '*', element: <PreviewComingSoon /> },
  ],
}
