export const MSG_DEACTIVATED = 'Seu acesso foi desativado. Fale com um administrador.'
export const MSG_PROFILE = 'Não foi possível carregar seu perfil. Tente novamente.'

export class SignInError extends Error {
  constructor(
    message: string,
    readonly invalidCredentials: boolean,
  ) {
    super(message)
  }
}
