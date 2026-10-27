import type { ReactNode } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AuthGate } from '@/auth/AuthGate'
import { PREVIEW_BASE } from '@/preview/paths'
import { AppShell } from '@/shell/AppShell'
import { NotFound } from '@/shell/NotFound'
import { NAV } from '@/shell/nav'
import { RequirePerm } from '@/shell/RequirePerm'
import {
  AcervoListPage,
  AgendaPage,
  CategoriesPage,
  ClientesListPage,
  ConfigPage,
  ContractPrint,
  CustomerPage,
  DashboardPage,
  FinanceOverviewPage,
  FittingPage,
  GarmentPage,
  IntelPage,
  OperacaoPage,
  OsPrint,
  PayablesPage,
  ProvasListPage,
  ReceivablesPage,
  ReservasListPage,
  ReservationPage,
} from './screens'
import { SupabaseDataLayout } from './SupabaseDataLayout'

/** Tela de cada item do menu no app real (todas no banco desde a área 6; `shell.test.tsx` garante que nenhum item fica sem tela). */
export const LIVE: Record<string, ReactNode> = {
  '/': <DashboardPage />,
  '/agenda': <AgendaPage />,
  '/provas': <ProvasListPage />,
  '/reservas': <ReservasListPage />,
  '/acervo': <AcervoListPage />,
  '/clientes': <ClientesListPage />,
  '/financeiro': <FinanceOverviewPage />,
  '/operacao': <OperacaoPage />,
  '/inteligencia': <IntelPage />,
  '/config': <ConfigPage />,
}

/**
 * Rotas do Senzi OS. `/preview/*` é pública (prévia visual com dados fictícios em memória); o resto exige login.
 * A prévia inteira (fonte em memória + fixture) é carregada sob demanda: nunca entra no pedaço principal do app real.
 * As telas do app real também (`./screens`).
 */
export const appRoutes: RouteObject[] = [
  {
    path: `${PREVIEW_BASE}/*`,
    lazy: async () => ({ Component: (await import('@/preview/PreviewApp')).PreviewApp }),
  },
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
                element: <RequirePerm perm={n.perm}>{LIVE[n.path] ?? <NotFound />}</RequirePerm>,
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
