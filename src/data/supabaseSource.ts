/**
 * Fonte de dados do app real (Supabase). Por enquanto só o Acervo está no banco; as áreas que a ficha da peça
 * consulta de passagem (reservas e manutenções da peça) respondem vazio, e qualquer outra chamada falha com
 * `NAO_DISPONIVEL` — essas telas continuam "Em breve" no app real até entrarem no banco.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataSource } from './source'
import { supabaseAcervo } from './supabase/acervo'
import { SourceError } from './types'

export function createSupabaseSource(client: SupabaseClient): DataSource {
  const ready: Partial<DataSource> = {
    ...supabaseAcervo(client),
    reservationsOfGarment: async () => [],
    maintenancesOf: async () => ({ maintenances: [], inspections: [] }),
  }
  return new Proxy(ready, {
    get: (target, key) => (key in target ? target[key as keyof DataSource] : () => Promise.reject(new SourceError('NAO_DISPONIVEL'))),
  }) as DataSource
}
