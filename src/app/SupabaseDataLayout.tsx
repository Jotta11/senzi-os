import { useMemo } from 'react'
import { Outlet } from 'react-router'
import { DataSourceProvider } from '@/data/source'
import { createSupabaseSource } from '@/data/supabaseSource'
import { getSupabase } from '@/lib/supabase'

/** Entrega às telas do app real a fonte de dados do Supabase (o AuthGate só chega aqui com o cliente configurado). */
export function SupabaseDataLayout() {
  const source = useMemo(() => createSupabaseSource(getSupabase()!), [])
  return (
    <DataSourceProvider source={source}>
      <Outlet />
    </DataSourceProvider>
  )
}
