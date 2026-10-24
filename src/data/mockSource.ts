/**
 * Fonte de dados em memória para a prévia visual: compõe as áreas (Acervo/Clientes, Agenda, Reservas e exceções por PIN;
 * Operação; Financeiro; Painel; Inteligência) sobre um único mundo fictício (`MockCtx`).
 * Mesma interface e mesmos códigos de erro do banco (Plano 2B); o estado some ao recarregar a página.
 */
import { agenda } from './mock/agenda'
import { acervoClientes } from './mock/acervoClientes'
import { createMockCtx, type MockSourceOptions } from './mock/context'
import { exceptionsMock } from './mock/exceptions'
import { financeiro } from './mock/financeiro'
import { intel } from './mock/intel'
import { operacao } from './mock/operacao'
import { painel } from './mock/painel'
import { reservas } from './mock/reservas'
import type { DataSource } from './source'

export type { MockSourceOptions } from './mock/context'

export function createMockSource(opts: MockSourceOptions = {}): DataSource {
  const ctx = createMockCtx(opts)
  const base = acervoClientes(ctx)
  const exc = exceptionsMock(ctx)
  const ag = agenda(ctx, base.createCustomer)
  return { ...base, ...ag, ...reservas(ctx), ...operacao(ctx), ...financeiro(ctx), ...painel(ctx, ag), ...intel(ctx), listActiveAdmins: exc.listActiveAdmins, authorizeException: exc.authorize }
}
