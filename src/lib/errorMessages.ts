/**
 * Códigos de erro do banco (exceções das RPCs chegam como `error.message` igual ao
 * código, ex.: 'ULTIMO_ADMIN') → mensagens pt-BR para a interface.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  AUTO_REBAIXAMENTO: 'Você não pode desativar ou rebaixar a si mesmo.',
  ULTIMO_ADMIN: 'É preciso manter ao menos um administrador ativo.',
  PARAMETRO_INVALIDO: 'Dados inválidos. Revise os campos e tente de novo.',
  USUARIO_NAO_ENCONTRADO: 'Usuário não encontrado.',
  PIN_INVALIDO: 'O PIN deve ter de 4 a 6 dígitos.',
  AUTORIZACAO_INVALIDA: 'Administrador ou PIN inválido',
  PIN_BLOQUEADO: 'Muitas tentativas. Tente de novo em 15 minutos.',
  MOTIVO_OBRIGATORIO: 'Informe o motivo',
  // Acervo e Clientes (Plano 2B; a prévia em memória usa os mesmos códigos)
  NOME_OBRIGATORIO: 'Informe o nome ou modelo da peça.',
  VALOR_LOCACAO_OBRIGATORIO: 'Informe o valor da locação.',
  PERIODO_INVALIDO: 'A data final deve ser igual ou posterior à inicial.',
  CONFLITO_AGENDA: 'A peça já tem compromisso nesse período.',
  NOME_CLIENTE_OBRIGATORIO: 'Informe o nome completo da cliente.',
  TELEFONE_INVALIDO: 'Informe um telefone com DDD.',
  NASCIMENTO_INVALIDO: 'Informe a data de nascimento (não pode ser no futuro).',
  CPF_INVALIDO: 'CPF inválido.',
  CPF_DUPLICADO: 'Já existe uma cliente com este CPF.',
  EMAIL_INVALIDO: 'E-mail inválido.',
  OBSERVACAO_OBRIGATORIA: 'Escreva a observação.',
  NAO_ENCONTRADO: 'Registro não encontrado.',
  NAO_DISPONIVEL: 'Esta parte do sistema ainda não está ligada ao banco.',
  // Agenda, provas, reservas e financeiro (Plano 3V). Mensagens com valor recebem-no em `hint`.
  DATA_OBRIGATORIA: 'Informe a data.',
  HORARIO_OBRIGATORIO: 'Informe o horário.',
  CLIENTE_OBRIGATORIA: 'Selecione a cliente.',
  DATAS_INCOERENTES: 'O evento não pode ser antes da prova.',
  PROVA_ENCERRADA: 'Esta prova já foi encerrada.',
  RESERVA_SEM_CLIENTE: 'Selecione a cliente — toda reserva pertence a alguém.',
  RESERVA_SEM_PECAS: 'Selecione ao menos uma peça.',
  DATA_EVENTO_OBRIGATORIA: 'Informe a data do evento.',
  DEVOLUCAO_ANTES_RETIRADA: 'A devolução não pode ser anterior à retirada.',
  EVENTO_ANTES_RETIRADA: 'O evento não pode acontecer antes da retirada.',
  EVENTO_DEPOIS_DEVOLUCAO: 'O evento não pode acontecer depois da devolução prevista.',
  RETIRADA_NO_PASSADO: 'A retirada está no passado. Revise as datas.',
  DESCONTO_NEGATIVO: 'O desconto não pode ser negativo.',
  DESCONTO_MAIOR_QUE_BRUTO: 'O desconto é maior que o valor das peças.',
  DESCONTO_ACIMA_LIMITE: 'Desconto acima do limite da casa — precisa de autorização.',
  CONTRATO_NAO_ASSINADO: 'Marque o contrato como assinado antes de confirmar.',
  SINAL_INSUFICIENTE: 'Sinal abaixo do mínimo. Só o Administrador pode dispensar.',
  VALOR_INVALIDO: 'O valor do pagamento deve ser maior que zero.',
  VALOR_EXCEDE_SALDO: 'O valor excede o saldo em aberto.',
  SALDO_EM_ABERTO: 'Retirada com saldo pendente exige autorização.',
  ESTADO_INVALIDO: 'Esta ação não está disponível no estado atual.',
  DESCRICAO_OBRIGATORIA: 'Informe a descrição.',
  NOME_CATEGORIA_OBRIGATORIO: 'Informe o nome.',
  CATEGORIA_OBRIGATORIA: 'Escolha a categoria.',
  VENCIMENTO_OBRIGATORIO: 'Informe o vencimento.',
  DATA_FUTURA: 'A data não pode ser futura.',
  CATEGORIA_DUPLICADA: 'Já existe uma categoria com esse nome.',
  CATEGORIA_EM_USO: 'Há lançamentos nesta categoria — arquive em vez de excluir.',
  CATEGORIA_SISTEMA: 'Categorias do sistema não podem ser alteradas.',
  RECORRENCIA_FIM_INVALIDO: 'A data final deve ser posterior ao vencimento.',
  PECA_NAO_ENCONTRADA: 'Peça não encontrada.',
  ORDEM_NAO_ENCONTRADA: 'Ordem de serviço não encontrada.',
  ORDEM_JA_CONCLUIDA: 'Esta ordem já foi concluída.',
  CUSTO_INVALIDO: 'Informe um custo igual ou maior que zero.',
}

export const GENERIC_ERROR = 'Algo deu errado. Tente novamente.'

/** Mensagem pt-BR para um código ou erro (`{ message }`); desconhecido → genérica. */
export function errorMessage(err: unknown, fallback: string = GENERIC_ERROR): string {
  const code =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : ''
  return ERROR_MESSAGES[code.trim()] ?? fallback
}
