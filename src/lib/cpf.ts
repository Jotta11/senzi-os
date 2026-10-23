const digitsOf = (s: string) => s.replace(/\D/g, '')

function checkDigit(nums: number[]): number {
  const start = nums.length + 1
  const sum = nums.reduce((acc, n, i) => acc + n * (start - i), 0)
  const r = sum % 11
  return r < 2 ? 0 : 11 - r
}

/** CPF válido (com ou sem máscara): 11 dígitos, não todos iguais, verificadores corretos. */
export function isValidCPF(s: string): boolean {
  const d = digitsOf(s ?? '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const nums = [...d].map(Number)
  const d1 = checkDigit(nums.slice(0, 9))
  const d2 = checkDigit([...nums.slice(0, 9), d1])
  return nums[9] === d1 && nums[10] === d2
}

/** Completa 9 dígitos-base com os dois verificadores (gera CPFs válidos para dados fictícios). */
export function cpfFromBase(base9: string): string {
  const nums = [...digitsOf(base9).padStart(9, '0').slice(-9)].map(Number)
  const d1 = checkDigit(nums)
  const d2 = checkDigit([...nums, d1])
  return [...nums, d1, d2].join('')
}
