import { useMemo } from 'react'
import { Outlet } from 'react-router'
import { DataSourceProvider } from '@/data/source'
import { createSupabaseSource } from '@/data/supabaseSource'
import { ExceptionAuthorizerProvider, sourceAuthorizer } from '@/features/exceptions/ExceptionAuthorizer'
import { getSupabase } from '@/lib/supabase'

/**
 * Entrega às telas do app real a fonte de dados do Supabase (o AuthGate só chega aqui com o cliente configurado) e o
 * autorizador de exceções por PIN sobre ela (RPC `authorize_exception`, sem PIN de demonstração).
 */
export function SupabaseDataLayout() {
  const source = useMemo(() => createSupabaseSource(getSupabase()!), [])
  const authorizer = useMemo(() => sourceAuthorizer(source), [source])
  return (
    <DataSourceProvider source={source}>
      <ExceptionAuthorizerProvider value={authorizer}>
        <Outlet />
      </ExceptionAuthorizerProvider>
    </DataSourceProvider>
  )
}
