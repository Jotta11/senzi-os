export const MSG_DEACTIVATED = 'Seu acesso foi desativado. Fale com um administrador.'
export const MSG_PROFILE = 'Não foi possível carregar seu perfil. Tente novamente.'
export const MSG_OFFLINE = 'Sem internet para confirmar seu acesso. Você continua conectado — tentamos de novo assim que a conexão voltar.'

export class SignInError extends Error {
  constructor(
    message: string,
    readonly invalidCredentials: boolean,
  ) {
    super(message)
  }
}
export const MSG_NO_CLIENT = 'Conexão não configurada.'
export const MSG_PASSWORD_UPDATE = 'Não foi possível alterar a senha. Tente novamente.'

/** Erro do Supabase Auth em updateUser({ password }) → mensagem pt-BR. */
export function passwordUpdateMessage(error: { code?: string; message?: string }): string {
  if (error.code === 'same_password') return 'A nova senha deve ser diferente da atual.'
  if (error.code === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres.'
  if (error.code === 'reauthentication_needed' || error.code === 'session_not_found' || error.code === 'session_expired')
    return 'O link de redefinição expirou. Peça um novo em "Esqueci minha senha".'
  return MSG_PASSWORD_UPDATE
}
