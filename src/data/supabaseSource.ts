/**
 * Fonte de dados do app real (Supabase). Acervo, Clientes, Agenda/Provas, Reservas (com as exceções por PIN) e
 * Financeiro estão no banco; as leituras que as telas já ligadas consultam de passagem (manutenções da peça) respondem vazio, e qualquer
 * outra chamada falha com `NAO_DISPONIVEL` — essas telas continuam "Em breve" no app real até entrarem no banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataSource } from './source'
import { photoSigner, supabaseAcervo } from './supabase/acervo'
import { supabaseAgenda } from './supabase/agenda'
import { supabaseClientes } from './supabase/clientes'
import { supabaseFinanceiro } from './supabase/financeiro'
import { supabaseReservas } from './supabase/reservas'
import { SourceError } from './types'

export function createSupabaseSource(client: SupabaseClient): DataSource {
  const sign = photoSigner(client)
  const ready: Partial<DataSource> = {
    ...supabaseAcervo(client, sign),
    ...supabaseClientes(client, sign),
    ...supabaseAgenda(client, sign),
    ...supabaseReservas(client, sign),
    ...supabaseFinanceiro(client),
    // Aba Manutenções da ficha da peça: vazia até a área 5 (Operação).
    maintenancesOf: async () => ({ maintenances: [], inspections: [] }),
  }
  return new Proxy(ready, {
    get: (target, key) => (key in target ? target[key as keyof DataSource] : () => Promise.reject(new SourceError('NAO_DISPONIVEL'))),
  }) as DataSource
}
