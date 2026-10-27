/**
 * Fonte de dados do app real (Supabase). Por enquanto Acervo, Clientes e Agenda/Provas estão no banco; as leituras
 * que as telas já ligadas consultam de passagem (reservas e manutenções da peça, reservas da cliente) respondem vazio,
 * e qualquer outra chamada falha com `NAO_DISPONIVEL` — essas telas continuam "Em breve" no app real até entrarem no banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataSource } from './source'
import { photoSigner, supabaseAcervo } from './supabase/acervo'
import { supabaseAgenda } from './supabase/agenda'
import { supabaseClientes } from './supabase/clientes'
import { SourceError } from './types'

export function createSupabaseSource(client: SupabaseClient): DataSource {
  const sign = photoSigner(client)
  const ready: Partial<DataSource> = {
    ...supabaseAcervo(client, sign),
    ...supabaseClientes(client, sign),
    ...supabaseAgenda(client, sign),
    reservationsOfGarment: async () => [],
    maintenancesOf: async () => ({ maintenances: [], inspections: [] }),
    // Aba Reservas da ficha da cliente: vazia até a área 3 (Reservas).
    reservationsOfCustomer: async () => [],
  }
  return new Proxy(ready, {
    get: (target, key) => (key in target ? target[key as keyof DataSource] : () => Promise.reject(new SourceError('NAO_DISPONIVEL'))),
  }) as DataSource
}
