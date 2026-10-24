import { SourceError, type SourceIssue } from '@/data/types'
import { issueMessage } from '@/data/validation'
import { errorMessage } from '@/lib/errorMessages'

export type FormErrors = { fields: Record<string, string>; top: string | null }
export const NO_ERRORS: FormErrors = { fields: {}, top: null }

/** Campo numérico do formulário: vazio → null; texto inválido → NaN (a validação acusa). Aceita vírgula. */
export function numOrNull(s: string): number | null {
  const t = s.trim().replace(',', '.')
  return t === '' ? null : Number(t)
}

export const str = (n: number | null | undefined) => (n == null ? '' : String(n))

/**
 * Problemas de validação → mensagem em cada campo conhecido; o que não tem campo no formulário vai para o topo.
 */
export function issuesToErrors(issues: SourceIssue[], known: readonly string[]): FormErrors {
  const fields: Record<string, string> = {}
  let top: string | null = null
  for (const i of issues) {
    if (i.field && known.includes(i.field)) fields[i.field] ??= issueMessage(i)
    else top ??= issueMessage(i)
  }
  return { fields, top }
}

/** Erro devolvido pela fonte → campos/topo (SourceError com `issues`) ou mensagem genérica no topo. */
export function sourceErrors(err: unknown, known: readonly string[]): FormErrors {
  if (err instanceof SourceError) {
    const issues = err.issues?.length ? err.issues : [{ code: err.code, field: err.field }]
    return issuesToErrors(issues, known)
  }
  return { fields: {}, top: errorMessage(err) }
}
