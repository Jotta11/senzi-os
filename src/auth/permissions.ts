/**
 * Catálogo de permissões do Senzi OS — espelho exato da tabela `public.permission`
 * (migration `20261023000100_acesso.sql`). O teste `tests/db/acesso.test.ts` garante
 * a sincronia de chaves e rótulos. A checagem que vale é a do banco (`has_perm`);
 * no front isto é só conveniência de interface.
 *
 * Sem imports de navegador: este arquivo também é carregado pelos testes de banco (node).
 */
export const PERMISSIONS = {
  'dashboard.view': 'Ver o painel do dia',
  'agenda.view': 'Ver a agenda',
  'agenda.manage': 'Criar e editar compromissos',

  'cliente.view': 'Ver clientes',
  'cliente.create': 'Cadastrar cliente',
  'cliente.edit': 'Editar cadastro e medidas',
  'cliente.note': 'Registrar observações de atendimento',

  'acervo.view': 'Ver o acervo',
  'acervo.create': 'Cadastrar peça',
  'acervo.edit': 'Editar ficha da peça',
  'acervo.block': 'Bloquear e liberar peça',
  'acervo.cost': 'Ver custo de aquisição e economia da peça',

  'prova.view': 'Ver provas',
  'prova.manage': 'Agendar e conduzir provas',

  'reserva.view': 'Ver reservas',
  'reserva.create': 'Criar reserva',
  'reserva.confirm': 'Confirmar reserva',
  'reserva.cancel': 'Cancelar reserva',
  'reserva.pickup': 'Registrar retirada',
  'reserva.return': 'Registrar devolução',
  'reserva.discount': 'Conceder desconto',
  'reserva.authorize': 'Autorizar exceção (retirada com saldo, desconto acima do limite)',

  'operacao.view': 'Ver a fila de operação',
  'operacao.inspect': 'Registrar inspeção',
  'operacao.maintenance': 'Abrir e concluir ordens de serviço',
  'operacao.release': 'Liberar peça para o acervo',

  'financeiro.view': 'Ver o financeiro das reservas',
  'financeiro.payment': 'Lançar pagamento',
  'financeiro.consolidated': 'Ver resultado consolidado, margem e investimento',
  'financeiro.geral': 'Ver e gerir contas a pagar, a receber e categorias',

  'inteligencia.view': 'Ver a inteligência de acervo',

  'config.view': 'Abrir configurações',
  'config.params': 'Alterar parâmetros de operação',
  'config.users': 'Gerenciar usuários e permissões',
  'config.audit': 'Ver o histórico de auditoria',
  'config.data': 'Exportar e regenerar dados',
} as const

export type Perm = keyof typeof PERMISSIONS
