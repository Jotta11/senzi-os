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
