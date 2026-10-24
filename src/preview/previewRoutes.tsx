import type { RouteObject } from 'react-router'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AcervoListPage } from '@/features/acervo/AcervoListPage'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { OperacaoPage } from '@/features/operacao/OperacaoPage'
import { CategoriesPage } from '@/features/financeiro/CategoriesPage'
import { FinanceOverviewPage } from '@/features/financeiro/FinanceOverviewPage'
import { PayablesPage } from '@/features/financeiro/PayablesPage'
import { ReceivablesPage } from '@/features/financeiro/ReceivablesPage'
import { IntelPage } from '@/features/inteligencia/IntelPage'
import { RequirePerm } from '@/shell/RequirePerm'
import { ClientesListPage } from '@/features/clientes/ClientesListPage'
import { CustomerPage } from '@/features/clientes/CustomerPage'
import { FittingPage } from '@/features/provas/FittingPage'
import { ProvasListPage } from '@/features/provas/ProvasListPage'
import { ContractPrint } from '@/features/reservas/print/ContractPrint'
import { OsPrint } from '@/features/reservas/print/OsPrint'
import { ReservasListPage } from '@/features/reservas/ReservasListPage'
import { ReservationPage } from '@/features/reservas/ReservationPage'
import { PREVIEW_BASE } from './paths'
import { PreviewComingSoon } from './PreviewComingSoon'
import { PreviewLayout } from './PreviewLayout'

/**
 * Rotas da prévia visual (públicas, sem login, dados fictícios em memória).
 * As Tasks 2–5 do Plano 2A trocam os placeholders abaixo pelas telas definitivas.
 */
export const previewRoutes: RouteObject = {
  path: PREVIEW_BASE,
  element: <PreviewLayout />,
  children: [
    { index: true, element: <DashboardPage /> },
    { path: 'acervo', element: <AcervoListPage /> },
    { path: 'acervo/:id', element: <GarmentPage /> },
    { path: 'agenda', element: <AgendaPage /> },
    { path: 'clientes', element: <ClientesListPage /> },
    { path: 'clientes/:id', element: <CustomerPage /> },
    { path: 'operacao', element: <OperacaoPage /> },
    { path: 'financeiro', element: <FinanceOverviewPage /> },
    { path: 'financeiro/receber', element: <RequirePerm perm="financeiro.geral"><ReceivablesPage /></RequirePerm> },
    { path: 'financeiro/pagar', element: <RequirePerm perm="financeiro.geral"><PayablesPage /></RequirePerm> },
    { path: 'financeiro/categorias', element: <RequirePerm perm="financeiro.geral"><CategoriesPage /></RequirePerm> },
    { path: 'inteligencia', element: <RequirePerm perm="inteligencia.view"><IntelPage /></RequirePerm> },
    { path: 'provas', element: <ProvasListPage /> },
    { path: 'provas/:id', element: <FittingPage /> },
    { path: 'reservas', element: <ReservasListPage /> },
    { path: 'reservas/:id', element: <ReservationPage /> },
    { path: 'reservas/:id/contrato', element: <ContractPrint /> },
    { path: 'reservas/:id/os', element: <OsPrint /> },
    { path: '*', element: <PreviewComingSoon /> },
  ],
}
