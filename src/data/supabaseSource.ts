/**
 * Fonte de dados do app real (Supabase): todas as áreas estão no banco (Acervo, Clientes, Agenda/Provas, Reservas com
 * as exceções por PIN, Financeiro, Operação, Dashboard e Inteligência). O objeto é tipado como `DataSource` completo:
 * se a interface ganhar um método, o TypeScript acusa aqui até a área correspondente implementá-lo no banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataSource } from './source'
import { photoSigner, supabaseAcervo } from './supabase/acervo'
import { supabaseAgenda } from './supabase/agenda'
import { supabaseClientes } from './supabase/clientes'
import { supabaseFinanceiro } from './supabase/financeiro'
import { supabaseOperacao } from './supabase/operacao'
import { supabasePainel } from './supabase/painel'
import { supabaseReservas } from './supabase/reservas'

export function createSupabaseSource(client: SupabaseClient): DataSource {
  const sign = photoSigner(client)
  const source: DataSource = {
    ...supabaseAcervo(client, sign),
    ...supabaseClientes(client, sign),
    ...supabaseAgenda(client, sign),
    ...supabaseReservas(client, sign),
    ...supabaseFinanceiro(client),
    ...supabaseOperacao(client, sign),
    ...supabasePainel(client),
  }
  return source
}
