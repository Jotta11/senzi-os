/** Iniciais do primeiro e do último nome ("Mariana Fontes Ribeiro" → "MR"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0]![0]!
  const last = parts.length > 1 ? parts.at(-1)![0]! : ''
  return (first + last).toLocaleUpperCase('pt-BR')
}
