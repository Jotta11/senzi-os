/**
 * Tipos de domínio do Acervo e de Clientes, vistos pelas telas.
 * As telas só conhecem estes tipos e a interface `DataSource` (./source.ts);
 * a implementação (memória agora, banco no Plano 2B) fica por trás.
 * Datas puras em `aaaa-mm-dd`; instantes em ISO 8601.
 */

export type SizeEquiv = 'PP' | 'P' | 'M' | 'G' | 'GG' | 'U'
export type GarmentLength = 'curto' | 'midi' | 'longo'
export type FitRuns = 'menor' | 'fiel' | 'maior'
export type FabricStretch = 'nenhum' | 'leve' | 'alto'

/** Os 11 estados da peça (o `pre_reservado` do protótipo não existe aqui). */
export type GarmentState =
  | 'disponivel'
  | 'reservado'
  | 'retirado'
  | 'em_uso'
  | 'aguardando_devolucao'
  | 'higienizacao'
  | 'inspecao'
  | 'ajuste'
  | 'manutencao'
  | 'bloqueado'
  | 'baixado'

/** Filtro de estado da lista. `todos` é o único que inclui peças baixadas. */
export type StateGroup = 'todos' | 'disponivel' | 'reservado' | 'em_uso' | 'ciclo' | 'bloqueado'

export type PhotoKind = 'frente' | 'costas' | 'lateral' | 'detalhe' | 'editorial' | 'manequim' | 'saida' | 'devolucao' | 'dano' | 'manutencao'

export type BlockKind = 'locacao' | 'higienizacao' | 'inspecao' | 'ajuste' | 'manutencao' | 'bloqueio_manual' | 'editorial'

export type Category = { slug: string; name: string; cleaningDays: number }

export type GarmentMeasurement = {
  bustCm: number | null
  waistCm: number | null
  hipCm: number | null
  shoulderCm: number | null
  totalLengthCm: number | null
  hemAllowanceCm: number | null
  stretch: FabricStretch | null
}

export type GarmentPhoto = { id: string; kind: PhotoKind; url: string; isCover: boolean }

/** Compromisso na agenda da peça (`from`/`to` inclusivos, `aaaa-mm-dd`). Só bloqueios ativos. */
export type GarmentBlock = {
  id: string
  kind: BlockKind
  from: string
  to: string
  note: string | null
  /** Reserva dona do bloco (locação, higienização pós-uso, preparação). */
  reservationId?: string | null
  /** Ordem de manutenção dona do bloco. */
  maintenanceId?: string | null
}

export type GarmentHistoryEntry = { at: string; from: GarmentState | null; to: GarmentState; reason: string; userName: string }

export type Garment = {
  id: string
  code: string
  name: string
  categorySlug: string
  categoryName: string
  brandName: string | null
  labelSize: string
  sizeEquiv: SizeEquiv
  colorPrimary: string
  colorHex: string
  fabric: string
  length: GarmentLength
  neckline: string
  sleeve: string
  style: string
  occasions: string[]
  fitNotes: string
  state: GarmentState
  rentalPrice: number
  /** Custos: `null` quando a fonte não os entrega (no banco, sem `acervo.cost`). As telas ainda checam `can('acervo.cost')`. */
  acquisitionCost: number | null
  retailReference: number | null
  /** Dias de higienização próprios da peça; `null` = padrão da categoria. */
  cleaningDays: number | null
  location: string
  /** Caimento observado. */
  fitRuns: FitRuns | null
  bustComfortCm: number | null
  waistMaxCm: number | null
  hipMaxCm: number | null
  hemHeelCm: number | null
  commonAlteration: string | null
  measurement: GarmentMeasurement
  photos: GarmentPhoto[]
  /** Ordenados por início. */
  blocks: GarmentBlock[]
  /** Mais recente primeiro. */
  history: GarmentHistoryEntry[]
}

export type GarmentFilters = {
  /** Código, nome, cor ou tecido — sem acento e sem diferenciar maiúsculas. */
  q?: string
  /** Slug da categoria; vazio/undefined = todas. */
  cat?: string | null
  /** Sem valor = qualquer estado exceto `baixado`; `todos` inclui as baixadas. */
  stateGroup?: StateGroup
  size?: SizeEquiv | null
}

/** Contagem por grupo de estado (`todos` inclui baixadas) + `ativas` (tudo menos baixadas = lista padrão). Sem custos. */
export type GarmentCounts = Record<StateGroup, number> & { ativas: number }

/**
 * Economia unitária da peça — só para quem tem `acervo.cost` (no banco, RPC protegida; spec dashboard §3.3).
 * `rentals`/`revenue` = itens de reservas realizadas (receita = Σ líquido rateado); `cleaning`/`maintenance` =
 * despesas da Operação da peça; `payback` = receita ÷ custo de aquisição (`null` sem custo); `paidBack` = receita ≥ custo.
 */
export type GarmentEconomics = {
  garmentId: string
  rentals: number
  revenue: number
  acquisitionCost: number | null
  payback: number | null
  paidBack: boolean
  cleaning: number
  maintenance: number
  /** Receita − aquisição − higienização − manutenção. */
  result: number
  /** Maior data de evento (ou retirada) das locações realizadas; `null` = nunca alugada. */
  lastRental: string | null
  /** Dias desde `lastRental`; `null` = nunca alugada. */
  idleDays: number | null
}

export type PageRequest = { limit: number; offset: number }
export type PageResult<T> = { items: T[]; total: number }

export type GarmentInput = {
  name: string
  categorySlug: string
  brandName: string | null
  labelSize: string
  sizeEquiv: SizeEquiv
  colorPrimary: string
  colorHex: string
  fabric: string
  length: GarmentLength
  neckline: string
  sleeve: string
  style: string
  occasions: string[]
  fitNotes: string
  rentalPrice: number
  acquisitionCost: number | null
  retailReference: number | null
  cleaningDays: number | null
  location: string
}

/** Caimento observado (FitModal) — inclui a observação de caimento da ficha. */
export type FitInput = Pick<Garment, 'fitRuns' | 'bustComfortCm' | 'waistMaxCm' | 'hipMaxCm' | 'hemHeelCm' | 'commonAlteration' | 'fitNotes'>

/* Tipos das demais telas (agenda, provas, reservas, operação, financeiro, painel). */
export * from './types-agenda'
export * from './types-reservas'
export * from './types-operacao'
export * from './types-financeiro'
export * from './types-painel'

/* ------------------------------------------------------------------ clientes */

export type LeadSource = 'indicacao' | 'instagram' | 'passante' | 'evento' | 'google' | 'outro'
export type ContactChannel = 'presencial' | 'whatsapp' | 'instagram' | 'telefone'
export type FavoriteSource = 'manual' | 'prova'
export type CustomerSort = 'nome' | 'gasto' | 'locacoes' | 'recentes'

export type CustomerMeasurement = {
  measuredAt: string
  usualSize: SizeEquiv | null
  bustCm: number | null
  waistCm: number | null
  hipCm: number | null
  heightCm: number | null
  shoulderCm: number | null
  shoeSize: string | null
  preferredLength: GarmentLength | null
  source: 'manual' | 'modelo_ideal'
  sourceGarmentId: string | null
  /** Observação da medição ("Medidas tiradas na prova do Verona"). */
  notes?: string | null
  /** Quem registrou a versão (preenchido pela fonte). */
  measuredBy?: string | null
}

export type CustomerPreferences = {
  preferredColors: string[]
  avoidedColors: string[]
  preferredLengths: GarmentLength[]
  sleeve: string | null
  neckline: string | null
}

/** Observação de atendimento ("memória"). */
export type CustomerNote = { id: string; content: string; channel: ContactChannel; pinned: boolean; at: string; authorName: string }

export type CustomerFavorite = { garmentId: string; source: FavoriteSource; note: string | null; at: string }

/** `spent` (Σ líquido das locações realizadas): `null` quando a fonte não o entrega (no banco, sem `financeiro.view`). */
export type CustomerStats = { rentals: number; spent: number | null; nextEvent: string | null }

export type Customer = {
  id: string
  code: string
  fullName: string
  /** Só dígitos, com DDD. */
  phone: string
  instagram: string | null
  email: string | null
  birthDate: string
  /** Só dígitos. */
  cpf: string
  city: string | null
  state: string | null
  leadSource: LeadSource | null
  vip: boolean
  /** Observações gerais do cadastro (campo do formulário). */
  notes: string | null
  idealGarmentId: string | null
  createdAt: string
  /** Versões de medidas, mais recente primeiro (`[0]` é a atual). */
  measurements: CustomerMeasurement[]
  preferences: CustomerPreferences
  /** Observações de atendimento, mais recente primeiro. */
  interactions: CustomerNote[]
  favorites: CustomerFavorite[]
  stats: CustomerStats
}

export type CustomerMeasurementInput = Partial<Omit<CustomerMeasurement, 'measuredAt' | 'measuredBy'>>

export type CustomerInput = {
  fullName: string
  /** Com ou sem máscara. */
  phone: string
  birthDate: string
  /** Com ou sem máscara. */
  cpf: string
  instagram?: string | null
  email?: string | null
  city?: string | null
  state?: string | null
  leadSource?: LeadSource | null
  vip?: boolean
  notes?: string | null
  idealGarmentId?: string | null
  /** Se tiver algum valor, cria uma versão de medidas (`modelo_ideal` quando há `idealGarmentId`). */
  measurement?: CustomerMeasurementInput
  preferences?: Partial<CustomerPreferences>
}

export type IdealMeasurements = {
  usualSize: SizeEquiv
  bustCm: number | null
  waistCm: number | null
  hipCm: number | null
  shoulderCm: number | null
  preferredLength: GarmentLength
}

export type Recommendation = { garment: Garment; score: number; reasons: string[] }

/* -------------------------------------------------------------------- erros */

/** Códigos de erro — os mesmos das RPCs do Plano 2B (mensagens pt-BR em `src/lib/errorMessages.ts`). */
export type SourceErrorCode =
  | 'SEM_PERMISSAO'
  | 'NOME_OBRIGATORIO'
  | 'VALOR_LOCACAO_OBRIGATORIO'
  | 'PERIODO_INVALIDO'
  | 'CONFLITO_AGENDA'
  | 'NOME_CLIENTE_OBRIGATORIO'
  | 'TELEFONE_INVALIDO'
  | 'NASCIMENTO_INVALIDO'
  | 'CPF_INVALIDO'
  | 'CPF_DUPLICADO'
  | 'EMAIL_INVALIDO'
  | 'OBSERVACAO_OBRIGATORIA'
  | 'PARAMETRO_INVALIDO'
  | 'NAO_ENCONTRADO'
  | 'MOTIVO_OBRIGATORIO'
  | 'DATA_OBRIGATORIA'
  | 'HORARIO_OBRIGATORIO'
  | 'CLIENTE_OBRIGATORIA'
  | 'DATAS_INCOERENTES'
  | 'PROVA_ENCERRADA'
  | 'RESERVA_SEM_CLIENTE'
  | 'RESERVA_SEM_PECAS'
  | 'DATA_EVENTO_OBRIGATORIA'
  | 'DEVOLUCAO_ANTES_RETIRADA'
  | 'EVENTO_ANTES_RETIRADA'
  | 'EVENTO_DEPOIS_DEVOLUCAO'
  | 'RETIRADA_NO_PASSADO'
  | 'DESCONTO_NEGATIVO'
  | 'DESCONTO_MAIOR_QUE_BRUTO'
  | 'DESCONTO_ACIMA_LIMITE'
  | 'CONTRATO_NAO_ASSINADO'
  | 'SINAL_INSUFICIENTE'
  | 'VALOR_INVALIDO'
  | 'VALOR_EXCEDE_SALDO'
  | 'SALDO_EM_ABERTO'
  | 'ESTADO_INVALIDO'
  | 'DESCRICAO_OBRIGATORIA'
  | 'NOME_CATEGORIA_OBRIGATORIO'
  | 'CATEGORIA_OBRIGATORIA'
  | 'VENCIMENTO_OBRIGATORIO'
  | 'DATA_FUTURA'
  | 'CATEGORIA_DUPLICADA'
  | 'CATEGORIA_EM_USO'
  | 'CATEGORIA_SISTEMA'
  | 'RECORRENCIA_FIM_INVALIDO'
  | 'PECA_NAO_ENCONTRADA'
  | 'ORDEM_NAO_ENCONTRADA'
  | 'ORDEM_JA_CONCLUIDA'
  | 'CUSTO_INVALIDO'

export type SourceIssue = { code: SourceErrorCode; field?: string }

/**
 * Erro de regra de negócio. `message` é o próprio código, então `errorMessage(err)` já devolve o texto pt-BR.
 * `field` aponta o campo do formulário; `issues` traz todos os problemas de uma validação (o primeiro = `code`/`field`);
 * `hint` dá detalhe (ex.: período em conflito "dd/mm/aaaa – dd/mm/aaaa").
 */
export class SourceError extends Error {
  readonly code: SourceErrorCode
  readonly field?: string
  readonly hint?: string
  readonly issues?: SourceIssue[]

  constructor(code: SourceErrorCode, opts: { field?: string; hint?: string; issues?: SourceIssue[] } = {}) {
    super(code)
    this.name = 'SourceError'
    this.code = code
    this.field = opts.field
    this.hint = opts.hint
    this.issues = opts.issues
  }
}
