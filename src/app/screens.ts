import { lazy, type ComponentType } from 'react'

/**
 * Telas do app real carregadas sob demanda (cada uma vira um pedaço do build; o que elas compartilham vai para pedaços
 * comuns). O app logado baixa só a moldura (login, menu, permissões) e a tela aberta. `SupabaseDataLayout` dá o
 * `<Suspense>` enquanto o pedaço chega.
 */
function screen<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(async () => ({ default: (await load())[name] }))
}

export const DashboardPage = screen(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
export const AgendaPage = screen(() => import('@/features/agenda/AgendaPage'), 'AgendaPage')
export const ProvasListPage = screen(() => import('@/features/provas/ProvasListPage'), 'ProvasListPage')
export const FittingPage = screen(() => import('@/features/provas/FittingPage'), 'FittingPage')
export const ReservasListPage = screen(() => import('@/features/reservas/ReservasListPage'), 'ReservasListPage')
export const ReservationPage = screen(() => import('@/features/reservas/ReservationPage'), 'ReservationPage')
export const ContractPrint = screen(() => import('@/features/reservas/print/ContractPrint'), 'ContractPrint')
export const OsPrint = screen(() => import('@/features/reservas/print/OsPrint'), 'OsPrint')
export const AcervoListPage = screen(() => import('@/features/acervo/AcervoListPage'), 'AcervoListPage')
export const GarmentPage = screen(() => import('@/features/acervo/GarmentPage'), 'GarmentPage')
export const ClientesListPage = screen(() => import('@/features/clientes/ClientesListPage'), 'ClientesListPage')
export const CustomerPage = screen(() => import('@/features/clientes/CustomerPage'), 'CustomerPage')
export const FinanceOverviewPage = screen(() => import('@/features/financeiro/FinanceOverviewPage'), 'FinanceOverviewPage')
export const ReceivablesPage = screen(() => import('@/features/financeiro/ReceivablesPage'), 'ReceivablesPage')
export const PayablesPage = screen(() => import('@/features/financeiro/PayablesPage'), 'PayablesPage')
export const CategoriesPage = screen(() => import('@/features/financeiro/CategoriesPage'), 'CategoriesPage')
export const OperacaoPage = screen(() => import('@/features/operacao/OperacaoPage'), 'OperacaoPage')
export const IntelPage = screen(() => import('@/features/inteligencia/IntelPage'), 'IntelPage')
export const ConfigPage = screen(() => import('@/features/config/ConfigPage'), 'ConfigPage')
