/** Sugestões de peças para a cliente (fonte em memória). */
import { normalize } from '@/lib/format'
import type { Customer, Garment, Recommendation } from '../types'

/**
 * Sugestões para a cliente — tabela de pesos do Plano 2B (Task 3):
 *   +4 tamanho = tamanho usual da medida atual        'No tamanho dela (M)'
 *   +3 mesma categoria do modelo ideal ou de uma favorita  'Parecida com <peça>'
 *   +2 cor contém uma cor preferida                   'Cor que ela ama (<cor>)'
 *   −5 cor contém uma cor evitada  → aqui a peça é descartada (nunca sugerir cor que ela evita)
 *   +2 comprimento preferido                          'Comprimento preferido'
 *   +2 busto conforto ≥ busto e cintura máx. ≥ cintura 'Caimento compatível com as medidas'
 * Só peças fora de `baixado`/`bloqueado`, sem as favoritas atuais; score > 0; ordem score desc, preço asc.
 * (Planos 3–4 somam sinais de provas e locações aqui.)
 */
export function recommendFor(c: Customer, garments: Garment[], limit: number): Recommendation[] {
  const m = c.measurements[0]
  const favIds = new Set(c.favorites.map((f) => f.garmentId))
  const refs = [c.idealGarmentId, ...c.favorites.map((f) => f.garmentId)]
    .map((gid) => garments.find((g) => g.id === gid))
    .filter((g): g is Garment => !!g)
  const lengths = new Set<string>([...c.preferences.preferredLengths, ...(m?.preferredLength ? [m.preferredLength] : [])])
  const pref = c.preferences.preferredColors.map((x) => [x, normalize(x)] as const)
  const avoid = c.preferences.avoidedColors.map(normalize)

  const out: Recommendation[] = []
  for (const g of garments) {
    if (g.state === 'baixado' || g.state === 'bloqueado' || favIds.has(g.id)) continue
    const color = normalize(g.colorPrimary)
    if (avoid.some((a) => a && color.includes(a))) continue
    let score = 0
    const reasons: string[] = []
    if (m?.usualSize && g.sizeEquiv === m.usualSize) {
      score += 4
      reasons.push(`No tamanho dela (${m.usualSize})`)
    }
    const similar = refs.find((r) => r.id !== g.id && r.categorySlug === g.categorySlug)
    if (similar) {
      score += 3
      reasons.push(`Parecida com ${similar.name}`)
    }
    const loved = pref.find(([, n]) => n && color.includes(n))
    if (loved) {
      score += 2
      reasons.push(`Cor que ela ama (${loved[0]})`)
    }
    if (lengths.has(g.length)) {
      score += 2
      reasons.push('Comprimento preferido')
    }
    if (m?.bustCm != null && m.waistCm != null && g.bustComfortCm != null && g.waistMaxCm != null && g.bustComfortCm >= m.bustCm && g.waistMaxCm >= m.waistCm) {
      score += 2
      reasons.push('Caimento compatível com as medidas')
    }
    if (score > 0) out.push({ garment: g, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score || a.garment.rentalPrice - b.garment.rentalPrice).slice(0, limit)
}
