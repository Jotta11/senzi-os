import type { ReactNode } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AuthGate } from '@/auth/AuthGate'
import { AcervoListPage } from '@/features/acervo/AcervoListPage'
import { GarmentPage } from '@/features/acervo/GarmentPage'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { ClientesListPage } from '@/features/clientes/ClientesListPage'
import { CustomerPage } from '@/features/clientes/CustomerPage'
import { ConfigPage } from '@/features/config/ConfigPage'
import { CategoriesPage } from '@/features/financeiro/CategoriesPage'
import { FinanceOverviewPage } from '@/features/financeiro/FinanceOverviewPage'
import { PayablesPage } from '@/features/financeiro/PayablesPage'
import { ReceivablesPage } from '@/features/financeiro/ReceivablesPage'
import { OperacaoPage } from '@/features/operacao/OperacaoPage'
import { FittingPage } from '@/features/provas/FittingPage'
import { ProvasListPage } from '@/features/provas/ProvasListPage'
import { ContractPrint } from '@/features/reservas/print/ContractPrint'
import { OsPrint } from '@/features/reservas/print/OsPrint'
import { ReservasListPage } from '@/features/reservas/ReservasListPage'
import { ReservationPage } from '@/features/reservas/ReservationPage'
import { previewRoutes } from '@/preview/previewRoutes'
import { AppShell } from '@/shell/AppShell'
import { ComingSoon } from '@/shell/ComingSoon'
import { NotFound } from '@/shell/NotFound'
import { NAV } from '@/shell/nav'
import { RequirePerm } from '@/shell/RequirePerm'
import { SupabaseDataLayout } from './SupabaseDataLayout'

/** Telas do app real que já estão no banco; as demais seguem "Em breve". */
const LIVE: Record<string, ReactNode> = {
  '/agenda': <AgendaPage />,
  '/provas': <ProvasListPage />,
  '/reservas': <ReservasListPage />,
  '/acervo': <AcervoListPage />,
  '/clientes': <ClientesListPage />,
  '/financeiro': <FinanceOverviewPage />,
  '/operacao': <OperacaoPage />,
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
                path: '/provas/:id',
                element: (
                  <RequirePerm perm="prova.view">
                    <FittingPage />
                  </RequirePerm>
                ),
              },
              {
                path: '/reservas/:id',
                element: (
                  <RequirePerm perm="reserva.view">
                    <ReservationPage />
                  </RequirePerm>
                ),
              },
              {
                path: '/reservas/:id/contrato',
                element: (
                  <RequirePerm perm="reserva.view">
                    <ContractPrint />
                  </RequirePerm>
                ),
              },
              {
                path: '/reservas/:id/os',
                element: (
                  <RequirePerm perm="reserva.view">
                    <OsPrint />
                  </RequirePerm>
                ),
              },
              {
                path: '/financeiro/receber',
                element: (
                  <RequirePerm perm="financeiro.geral">
                    <ReceivablesPage />
                  </RequirePerm>
                ),
              },
              {
                path: '/financeiro/pagar',
                element: (
                  <RequirePerm perm="financeiro.geral">
                    <PayablesPage />
                  </RequirePerm>
                ),
              },
              {
                path: '/financeiro/categorias',
                element: (
                  <RequirePerm perm="financeiro.geral">
                    <CategoriesPage />
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
