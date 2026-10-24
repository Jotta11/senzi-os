import { errorMessage } from '@/lib/errorMessages'
import type { FormErrors } from '../../acervo/formErrors'

/** Campos de valor: o texto da spec ("Informe um valor maior que zero.") no lugar da mensagem do pagamento de reserva. */
export function fixAmountMessage(errors: FormErrors, fields: string[]): FormErrors {
  const generic = errorMessage('VALOR_INVALIDO')
  const next = { ...errors.fields }
  for (const f of fields) if (next[f] === generic) next[f] = 'Informe um valor maior que zero.'
  return { ...errors, fields: next }
}
