/* Formas da silhueta — porta de SHAPES/SHEEN/`SZ.shapeFor` do protótipo (viewBox 120×160). */

export const SHAPES = {
  longo: 'M41,60 45,34 75,34 79,60 73,74 C87,100 93,122 95,146 L25,146 C27,122 33,100 47,74 Z',
  midi: 'M41,58 45,32 75,32 79,58 73,72 C85,92 90,108 92,126 L28,126 C30,108 35,92 47,72 Z',
  curto: 'M41,56 45,30 75,30 79,56 73,70 C83,84 87,94 89,106 L31,106 C33,94 37,84 47,70 Z',
  sereia: 'M42,58 46,32 74,32 78,58 72,74 C76,96 74,112 70,124 C78,132 84,140 87,148 L33,148 C36,140 42,132 50,124 C46,112 44,96 48,74 Z',
  macacao: 'M41,56 45,30 75,30 79,56 74,72 76,148 62,148 60,96 58,148 44,148 46,72 Z',
  saia: 'M44,70 76,70 78,80 C86,104 90,124 92,142 L28,142 C30,124 34,104 42,80 Z',
  blazer: 'M40,54 46,32 60,42 74,32 80,54 78,124 42,124 Z',
  bolsa: 'M36,74 84,74 88,132 32,132 Z',
  xale: 'M34,42 86,42 78,78 60,138 42,78 Z',
} as const

export const SHEEN: Record<Shape, string> = {
  longo: 'M52,36 62,36 58,72 C50,98 44,122 42,146 L30,146 C33,120 40,96 50,72 Z',
  midi: 'M52,34 62,34 58,70 C48,92 42,108 40,126 L31,126 C33,108 38,92 48,70 Z',
  curto: 'M52,32 62,32 58,68 C49,84 43,94 41,106 L33,106 C35,94 39,84 48,68 Z',
  sereia: 'M53,34 63,34 59,72 C55,96 54,112 52,124 C46,132 41,140 38,148 L34,148 C37,140 43,132 51,124 C47,112 46,96 50,74 Z',
  macacao: 'M52,32 62,32 58,70 57,148 46,148 48,72 Z',
  saia: 'M50,70 60,70 58,80 C50,104 45,124 43,142 L31,142 C33,124 40,104 48,80 Z',
  blazer: 'M48,36 58,44 55,124 44,124 42,54 Z',
  bolsa: 'M40,74 52,74 48,132 36,132 Z',
  xale: 'M40,44 54,44 55,80 60,132 52,80 Z',
}

export type Shape = keyof typeof SHAPES

/** Forma da silhueta pela categoria, estilo e comprimento (mesma ordem de decisão do protótipo). */
export function shapeFor(categorySlug: string, style: string | null | undefined, length: string | null | undefined): Shape {
  const c = (categorySlug || '').toLowerCase()
  if (c.includes('macacao')) return 'macacao'
  if (c.includes('saia')) return 'saia'
  if (c.includes('blazer') || c.includes('conjunto')) return 'blazer'
  if (c.includes('bolsa') || c.includes('acessorio')) return 'bolsa'
  if (c.includes('xale') || c.includes('capa')) return 'xale'
  if ((style || '').toLowerCase().includes('sereia')) return 'sereia'
  if (length === 'curto') return 'curto'
  if (length === 'midi') return 'midi'
  return 'longo'
}
