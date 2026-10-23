/**
 * Acervo fictício portado do seed do protótipo (protótipo v0.2 L2765–2868 e caimento L3311–3324).
 * Determinístico: o que no protótipo era sorteado aqui deriva do índice da peça.
 * Datas são relativas a `today` para a agenda sempre parecer "viva".
 * Só a fonte em memória importa este arquivo — as telas nunca.
 */
import { addDays } from '@/lib/format'
import type { BlockKind, Category, FabricStretch, FitRuns, Garment, GarmentLength, GarmentState, SizeEquiv } from '../types'

export const CATEGORIES: Category[] = [
  { slug: 'vestido-longo', name: 'Vestido longo', cleaningDays: 3 },
  { slug: 'vestido-midi', name: 'Vestido midi', cleaningDays: 2 },
  { slug: 'vestido-curto', name: 'Vestido curto', cleaningDays: 2 },
  { slug: 'vestido-sereia', name: 'Vestido sereia', cleaningDays: 3 },
  { slug: 'macacao', name: 'Macacão', cleaningDays: 2 },
  { slug: 'conjunto', name: 'Conjunto', cleaningDays: 2 },
  { slug: 'saia', name: 'Saia', cleaningDays: 1 },
  { slug: 'bolsa-acessorio', name: 'Bolsa & acessório', cleaningDays: 1 },
]

export const BRANDS: string[] = [
  'PatBO',
  'Lethicia Bronstein',
  'Fabiana Milazzo',
  'Martha Medeiros',
  'Iorane',
  'Animale',
  'Le Lis Blanc',
  'Tufi Duek',
  'Isabella Narchi',
  'Ateliê Senzi',
]

const HOUSE_BRAND = 'Ateliê Senzi'

// nome, categoria, etiqueta, tam., cor, hex, tecido, comprimento, decote, manga, estilo, [marca], custo, referência, locação
type Row =
  | [string, string, string, SizeEquiv, string, string, string, GarmentLength, string, string, string, number, number, number]
  | [string, string, string, SizeEquiv, string, string, string, GarmentLength, string, string, string, string, number, number, number]

const ACERVO: Row[] = [
  ['Verona', 'vestido-longo', '38', 'M', 'Verde esmeralda', '#0E5C4A', 'Crepe com fenda', 'longo', 'Tomara que caia', 'Sem manga', 'Reto fluido', 'PatBO', 3200, 8900, 890],
  ['Amalfi', 'vestido-longo', '40', 'M', 'Vinho marsala', '#6E1F2E', 'Musseline de seda', 'longo', 'V profundo', 'Manga longa fluida', 'Império', 2800, 7200, 780],
  ['Sorrento', 'vestido-sereia', '38', 'M', 'Off-white', '#EFE7DA', 'Crepe com bordado manual', 'longo', 'Ombro a ombro', 'Manga curta', 'Sereia', 4600, 12500, 1180],
  ['Capri', 'vestido-midi', '36', 'P', 'Azul serenity', '#8FA9C9', 'Organza plissada', 'midi', 'Canoa', 'Manga bufante', 'Evasê', 1900, 4800, 620],
  ['Positano', 'vestido-longo', '42', 'G', 'Terracota', '#B4633F', 'Cetim texturizado', 'longo', 'Halter', 'Sem manga', 'Reto', 2400, 6100, 720],
  ['Portofino', 'vestido-sereia', '40', 'M', 'Preto', '#191919', 'Paetê bordado', 'longo', 'Alcinha', 'Sem manga', 'Sereia', 5200, 14000, 1250],
  ['Ravello', 'vestido-midi', '38', 'M', 'Rosa antigo', '#C98A99', 'Tafetá', 'midi', 'Quadrado', 'Manga curta', 'Godê', 1700, 4300, 580],
  ['Toscana', 'vestido-longo', '44', 'GG', 'Dourado champanhe', '#C9A961', 'Lurex plissado', 'longo', 'V', 'Manga longa', 'Reto fluido', 'Iorane', 2600, 6800, 760],
  ['Siena', 'vestido-curto', '36', 'P', 'Vermelho carmim', '#A81F33', 'Crepe', 'curto', 'Tomara que caia', 'Sem manga', 'Tubinho', 1400, 3500, 480],
  ['Bolonha', 'vestido-longo', '40', 'M', 'Azul marinho', '#1B2A4A', 'Zibeline', 'longo', 'Um ombro só', 'Manga única', 'Sereia', 3400, 9200, 940],
  ['Milano', 'vestido-midi', '42', 'G', 'Grafite', '#3C3F46', 'Alfaiataria com brilho', 'midi', 'Gola alta', 'Manga 3/4', 'Reto', 1600, 4000, 540],
  ['Firenze', 'vestido-longo', '38', 'M', 'Lilás', '#A98BC4', 'Tule bordado', 'longo', 'Coração', 'Sem manga', 'Princesa', 3900, 10400, 1050],
  ['Trastevere', 'vestido-curto', '40', 'M', 'Verde oliva', '#5E6B3C', 'Linho misto', 'curto', 'V', 'Manga curta', 'Envelope', 980, 2400, 390],
  ['Modena', 'vestido-longo', '36', 'P', 'Prata', '#B9BEC6', 'Malha metalizada', 'longo', 'Halter', 'Sem manga', 'Sereia', 2900, 7600, 820],
  ['Parma', 'vestido-midi', '44', 'GG', 'Marfim', '#F2ECE0', 'Crepe com renda', 'midi', 'Canoa', 'Manga longa renda', 'Evasê', 2100, 5300, 650],
  ['Ostuni', 'vestido-longo', '38', 'M', 'Azul petróleo', '#1D4E63', 'Cetim duchesse', 'longo', 'Decote nas costas', 'Alcinha', 'Reto fluido', 'Fabiana Milazzo', 3600, 9800, 980],
  ['Lecce', 'vestido-curto', '38', 'M', 'Nude rosé', '#D9B3A3', 'Tule com pedraria', 'curto', 'Coração', 'Manga bufante tule', 'Godê', 1800, 4600, 590],
  ['Bari', 'vestido-midi', '40', 'M', 'Preto', '#191919', 'Crepe com recortes', 'midi', 'Assimétrico', 'Manga longa', 'Tubinho', 1500, 3900, 520],
  ['Assis', 'vestido-longo', '42', 'G', 'Verde esmeralda', '#0E5C4A', 'Veludo molhado', 'longo', 'V profundo', 'Manga longa', 'Sereia', 3100, 8200, 900],
  ['Gênova', 'vestido-longo', '36', 'P', 'Vinho marsala', '#6E1F2E', 'Musseline plissada', 'longo', 'Ombro a ombro', 'Manga ampla', 'Império', 2200, 5700, 690],
  ['Urbino', 'macacao', '38', 'M', 'Preto', '#191919', 'Alfaiataria com cinto', 'longo', 'V', 'Manga longa', 'Pantalona', 1300, 3300, 470],
  ['Como', 'macacao', '40', 'M', 'Off-white', '#EFE7DA', 'Crepe pesado', 'longo', 'Gola smoking', 'Sem manga', 'Reto', 1500, 3800, 510],
  ['Pisa', 'conjunto', '38', 'M', 'Azul serenity', '#8FA9C9', 'Cropped + saia longa', 'longo', 'Quadrado', 'Manga curta', 'Conjunto', 1700, 4400, 560],
  ['Turim', 'conjunto', '42', 'G', 'Dourado champanhe', '#C9A961', 'Blazer + calça lurex', 'longo', 'Alfaiataria', 'Manga longa', 'Conjunto', 1900, 4900, 600],
  ['Nápoles', 'saia', '38', 'M', 'Terracota', '#B4633F', 'Saia longa plissada', 'longo', '—', '—', 'Plissada', 720, 1800, 280],
  ['Rimini', 'vestido-curto', '44', 'GG', 'Rosa antigo', '#C98A99', 'Jacquard', 'curto', 'Redondo', 'Manga curta', 'Evasê', 1100, 2800, 420],
  ['Carrara', 'bolsa-acessorio', 'U', 'U', 'Prata', '#B9BEC6', 'Clutch com cristais', 'curto', '—', '—', 'Clutch', 620, 1600, 180],
  ['Umbria', 'bolsa-acessorio', 'U', 'U', 'Dourado champanhe', '#C9A961', 'Clutch metalizada', 'curto', '—', '—', 'Clutch', 540, 1400, 160],
]

const OCASIOES: Record<string, string[]> = {
  'vestido-longo': ['Casamento', 'Formatura', 'Gala'],
  'vestido-sereia': ['Casamento', 'Gala', 'Premiação'],
  'vestido-midi': ['Festa', 'Casamento civil', 'Corporativo'],
  'vestido-curto': ['Festa', 'Aniversário', 'Jantar'],
  macacao: ['Festa', 'Corporativo'],
  conjunto: ['Festa', 'Corporativo'],
  saia: ['Festa', 'Casual chique'],
  'bolsa-acessorio': ['Casamento', 'Festa', 'Gala'],
}

const FIT_NOTES = [
  'Modelagem fiel ao tamanho.',
  'Veste um número abaixo — provar antes.',
  'Tecido com elastano, acomoda bem.',
  'Barra longa: prever salto de 9 cm.',
  'Cintura marcada, requer ajuste em quase todas as provas.',
]

const STRETCH: FabricStretch[] = ['nenhum', 'leve', 'alto']

// v0.2 · caimento observado: nome, veste, busto conforto, cintura máx., quadril máx., salto da barra, ajuste comum
const CAIMENTO: [string, FitRuns, number, number, number, number, string][] = [
  ['Verona', 'fiel', 92, 74, 100, 9, 'Barra solta 2 cm para salto baixo'],
  ['Amalfi', 'maior', 96, 80, 104, 8, 'Pences nas costas quando o busto é menor'],
  ['Sorrento', 'menor', 88, 70, 96, 10, 'Quase sempre precisa de pences na cintura'],
  ['Portofino', 'menor', 90, 72, 98, 10, 'Paetê não permite soltar barra — conferir altura antes'],
  ['Firenze', 'fiel', 93, 75, 101, 9, 'Tule permite ajuste generoso no corpete'],
  ['Ostuni', 'fiel', 92, 73, 99, 9, 'Cetim marca: cliente precisa de lingerie adequada'],
  ['Bolonha', 'menor', 89, 71, 97, 8, 'Zibeline rígida, não cede nada'],
  ['Milano', 'menor', 94, 78, 102, 6, 'Gola alta incomoda em pescoço curto; alfaiataria não cede'],
  ['Toscana', 'maior', 104, 88, 112, 9, 'Lurex plissado acomoda bem'],
  ['Capri', 'fiel', 86, 68, 94, 7, 'Organza precisa de anágua em dia de vento'],
]

/** Estado atual e agenda de exemplo para a tela mostrar todos os tons. Offsets em dias a partir de hoje. */
const CENARIO: Record<string, { state?: GarmentState; reason?: string; blocks?: [BlockKind, number, number, string][] }> = {
  Verona: {
    blocks: [
      ['locacao', 12, 15, 'Reserva · Mariana Fontes Ribeiro — casamento'],
      ['bloqueio_manual', 30, 32, 'Separada para prova de noiva'],
    ],
  },
  Amalfi: { state: 'reservado', reason: 'Reserva confirmada', blocks: [['locacao', 2, 5, 'Reserva · Juliana Tavares Lima — formatura']] },
  Capri: { state: 'higienizacao', reason: 'Devolvida, enviada à lavanderia', blocks: [['higienizacao', -1, 1, 'Lavanderia Palmas · lavagem a seco']] },
  Positano: { state: 'retirado', reason: 'Retirada pela cliente', blocks: [['locacao', -2, 2, 'Locação · Camila Nogueira Alves']] },
  Portofino: { state: 'reservado', reason: 'Reserva confirmada', blocks: [['locacao', 5, 8, 'Reserva · Ana Paula Siqueira — gala']] },
  Ravello: { state: 'inspecao', reason: 'Devolvida, aguardando inspeção', blocks: [['inspecao', 0, 0, 'Inspeção na devolução']] },
  Toscana: { state: 'em_uso', reason: 'Em uso no evento', blocks: [['locacao', -1, 1, 'Locação · Renata Bastos Oliveira']] },
  Siena: { state: 'ajuste', reason: 'Enviada para ajuste', blocks: [['ajuste', 0, 2, 'Ajuste de barra com a costureira']] },
  Milano: { state: 'manutencao', reason: 'Zíper com defeito', blocks: [['manutencao', -3, 4, 'Troca de zíper']] },
  Firenze: { blocks: [['editorial', 20, 21, 'Ensaio de fotos da coleção']] },
  Bari: { state: 'aguardando_devolucao', reason: 'Prazo de devolução vencendo', blocks: [['locacao', -5, -1, 'Locação · Tatiane Lopes Vieira']] },
  Rimini: { state: 'bloqueado', reason: 'Bloqueio manual', blocks: [['bloqueio_manual', -2, 6, 'Separada para editorial de verão']] },
  Umbria: { state: 'baixado', reason: 'Fecho quebrado sem reparo — baixada do acervo' },
}

const PREFIX: Record<string, string> = { 'bolsa-acessorio': 'Clutch ', saia: 'Saia ', macacao: 'Macacão ', conjunto: 'Conjunto ' }
const USERS = ['Júlia Senzi', 'Ana Lima']

export function buildGarments(today: string): Garment[] {
  const catName = new Map(CATEGORIES.map((c) => [c.slug, c.name]))
  return ACERVO.map((row, idx) => {
    const [nm, cat, size, equiv, cor, hex, tecido, comp, decote, manga, estilo] = row
    const n = row.length
    const custo = row[n - 3] as number
    const ref = row[n - 2] as number
    const loc = row[n - 1] as number
    const marca = n === 15 ? (row[11] as string) : HOUSE_BRAND
    const code = `SZ-${String((idx + 1) * 7 + 100).padStart(4, '0')}`
    const id = code.toLowerCase()
    const num = Number(size)
    const step = Number.isFinite(num) ? (num - 36) * 3 : null
    const fit = CAIMENTO.find((c) => c[0] === nm)
    const cen = CENARIO[nm] ?? {}
    const acquiredAt = addDays(today, -(120 + ((idx * 37) % 440)))
    const state = cen.state ?? 'disponivel'

    const history: Garment['history'] = [
      { at: `${acquiredAt}T13:00:00.000Z`, from: null, to: 'disponivel', reason: 'Peça cadastrada no acervo', userName: USERS[0]! },
    ]
    if (state !== 'disponivel') {
      history.unshift({ at: `${addDays(today, -1 - (idx % 3))}T15:30:00.000Z`, from: 'disponivel', to: state, reason: cen.reason ?? '', userName: USERS[idx % 2]! })
    }

    return {
      id,
      code,
      name: (PREFIX[cat] ?? 'Vestido ') + nm,
      categorySlug: cat,
      categoryName: catName.get(cat) ?? cat,
      brandName: marca,
      labelSize: size,
      sizeEquiv: equiv,
      colorPrimary: cor,
      colorHex: hex,
      fabric: tecido,
      length: comp,
      neckline: decote,
      sleeve: manga,
      style: estilo,
      occasions: OCASIOES[cat] ?? ['Festa'],
      fitNotes: FIT_NOTES[idx % FIT_NOTES.length]!,
      state,
      rentalPrice: loc,
      acquisitionCost: custo,
      retailReference: ref,
      cleaningDays: null,
      location: `Arara ${String.fromCharCode(65 + (idx % 5))} · pos. ${(idx % 9) + 1}`,
      fitRuns: fit?.[1] ?? null,
      bustComfortCm: fit?.[2] ?? null,
      waistMaxCm: fit?.[3] ?? null,
      hipMaxCm: fit?.[4] ?? null,
      hemHeelCm: fit?.[5] ?? null,
      commonAlteration: fit?.[6] ?? null,
      measurement: {
        bustCm: step == null ? null : 82 + step,
        waistCm: step == null ? null : 64 + step,
        hipCm: step == null ? null : 90 + step,
        shoulderCm: cat === 'bolsa-acessorio' ? null : 36 + (idx % 6),
        totalLengthCm: cat === 'bolsa-acessorio' ? null : comp === 'longo' ? 140 + (idx % 16) : comp === 'midi' ? 110 + (idx % 13) : 88 + (idx % 11),
        hemAllowanceCm: cat === 'bolsa-acessorio' ? null : 3 + (idx % 6),
        stretch: cat === 'bolsa-acessorio' ? null : STRETCH[idx % 3]!,
      },
      // sem imagens de rede: a tela mostra a silhueta na cor da peça
      photos: [],
      blocks: (cen.blocks ?? []).map(([kind, a, b, note], i) => ({ id: `${id}-b${i + 1}`, kind, from: addDays(today, a), to: addDays(today, b), note })),
      history,
    }
  })
}
