import { createContext, createElement, useContext, type ReactNode } from 'react'
import type {
  Category,
  ContactChannel,
  Customer,
  CustomerInput,
  CustomerMeasurementInput,
  CustomerSort,
  FitInput,
  Garment,
  GarmentCounts,
  GarmentEconomics,
  GarmentFilters,
  GarmentInput,
  GarmentMeasurement,
  IdealMeasurements,
  PageRequest,
  PageResult,
  PhotoKind,
  Recommendation,
} from './types'
import type { AgendaSource } from './source-agenda'
import type { ExceptionsSource, ReservasSource } from './source-reservas'

/**
 * Porta de dados das telas de Acervo e Clientes.
 * Nesta etapa só existe a implementação em memória (`createMockSource`); no Plano 2B entra a do banco.
 * Tudo é assíncrono. Erros de regra chegam como `SourceError` (código + campo).
 * Mutações devolvem o registro atualizado.
 */
export interface AcervoClientesSource {
  listCategories(): Promise<Category[]>
  /** Nomes das marcas cadastradas (para sugerir no formulário). */
  listBrands(): Promise<string[]>
  /** Ordenado por código. */
  searchGarments(f: GarmentFilters, page: PageRequest): Promise<PageResult<Garment>>
  /** Quantas peças cada chip de estado traria com os demais filtros (busca, categoria, tamanho). */
  garmentCounts(f: Omit<GarmentFilters, 'stateGroup'>): Promise<GarmentCounts>
  /** Economia das peças pedidas (receita, despesas, payback, última locação; ids inexistentes são ignorados). Só com `acervo.cost`. */
  garmentEconomics(ids: string[]): Promise<GarmentEconomics[]>
  /** Σ custo de aquisição das peças ativas (sem baixadas). Só com `acervo.cost`. */
  acervoInvestment(): Promise<number>
  /** `null` se não existe. */
  getGarment(id: string): Promise<Garment | null>
  createGarment(input: GarmentInput): Promise<Garment>
  updateGarment(id: string, input: Partial<GarmentInput>): Promise<Garment>
  updateFit(id: string, input: Partial<FitInput>): Promise<Garment>
  updateMeasurement(id: string, input: Partial<GarmentMeasurement>): Promise<Garment>
  /** A primeira foto vira capa. */
  addPhoto(id: string, file: Blob, kind: PhotoKind): Promise<Garment>
  removePhoto(id: string, photoId: string): Promise<Garment>
  setCover(id: string, photoId: string): Promise<Garment>
  /** `from`/`to` em `aaaa-mm-dd`, inclusivos. `PERIODO_INVALIDO` / `CONFLITO_AGENDA` (com `hint`). */
  blockGarment(id: string, from: string, to: string, note: string): Promise<Garment>
  /** Só bloqueios manuais. */
  releaseBlock(id: string, blockId: string): Promise<Garment>

  /** Busca em nome, telefone (dígitos), Instagram, código, cidade e CPF (dígitos), sem acento. */
  searchCustomers(q: string, sort: CustomerSort, page: PageRequest): Promise<PageResult<Customer>>
  getCustomer(id: string): Promise<Customer | null>
  createCustomer(input: CustomerInput): Promise<Customer>
  updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer>
  /** Medidas sugeridas a partir de uma peça ("modelo ideal"). */
  idealMeasurements(garmentId: string): Promise<IdealMeasurements>
  /** Nova versão (nunca altera as anteriores). */
  addMeasurement(id: string, input: CustomerMeasurementInput): Promise<Customer>
  addNote(id: string, content: string, channel: ContactChannel, pinned: boolean): Promise<Customer>
  setNotePinned(id: string, noteId: string, pinned: boolean): Promise<Customer>
  setFavorite(id: string, garmentId: string, on: boolean): Promise<Customer>
  /** Até `limit` (padrão 8) sugestões ordenadas por pontuação. */
  recommend(id: string, limit?: number): Promise<Recommendation[]>
}

/** Única porta de dados das telas: interseção das interfaces de cada área (as próximas áreas entram aqui). */
export type DataSource = AcervoClientesSource & AgendaSource & ReservasSource & ExceptionsSource

const DataSourceContext = createContext<DataSource | null>(null)

export function DataSourceProvider({ source, children }: { source: DataSource; children: ReactNode }) {
  return createElement(DataSourceContext.Provider, { value: source }, children)
}

export function useDataSource(): DataSource {
  const src = useContext(DataSourceContext)
  if (!src) throw new Error('useDataSource fora do DataSourceProvider')
  return src
}
