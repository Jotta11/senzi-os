export const PASSWORD_MIN = 8
/** Limite do bcrypt usado pelo Supabase Auth (em bytes). */
export const PASSWORD_MAX_BYTES = 72

/** Validação local da nova senha; null = válida. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES)
    return `A senha deve ter no máximo ${PASSWORD_MAX_BYTES} caracteres.`
  if (password !== confirm) return 'As senhas não conferem.'
  return null
}
