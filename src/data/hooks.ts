/**
 * Hooks TanStack Query sobre a `DataSource` do contexto. As telas usam só estes hooks (ou `useDataSource()`).
 * Chaves: ['categories'], ['brands'], ['garments', filtros, página], ['garments', 'counts', filtros],
 * ['garments', 'economics', ids], ['garments', 'investment'], ['garment', id],
 * ['customers', q, ordem, página], ['customer', id], ['recommendations', id, limite], ['ideal', garmentId].
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useDataSource } from './source'
import type {
  ContactChannel,
  Customer,
  CustomerInput,
  CustomerMeasurementInput,
  CustomerSort,
  FitInput,
  Garment,
  GarmentFilters,
  GarmentInput,
  GarmentMeasurement,
  PageRequest,
  PhotoKind,
} from './types'

export const dataKeys = {
  categories: ['categories'] as const,
  brands: ['brands'] as const,
  garments: ['garments'] as const,
  garmentSearch: (f: GarmentFilters, page: PageRequest) => ['garments', f, page] as const,
  garmentCounts: (f: Omit<GarmentFilters, 'stateGroup'>) => ['garments', 'counts', f] as const,
  garmentEconomics: (ids: string[]) => ['garments', 'economics', ids] as const,
  acervoInvestment: ['garments', 'investment'] as const,
  garment: (id: string) => ['garment', id] as const,
  customers: ['customers'] as const,
  customerSearch: (q: string, sort: CustomerSort, page: PageRequest) => ['customers', q, sort, page] as const,
  customer: (id: string) => ['customer', id] as const,
  recommendations: (id?: string) => (id ? (['recommendations', id] as const) : (['recommendations'] as const)),
  ideal: (garmentId: string) => ['ideal', garmentId] as const,
}

/* ------------------------------------------------------------------ leituras */

export function useCategories() {
  const src = useDataSource()
  return useQuery({ queryKey: dataKeys.categories, queryFn: () => src.listCategories(), staleTime: Infinity })
}

export function useBrands() {
  const src = useDataSource()
  return useQuery({ queryKey: dataKeys.brands, queryFn: () => src.listBrands() })
}

export function useGarmentSearch(filters: GarmentFilters, page: PageRequest) {
  const src = useDataSource()
  return useQuery({
    queryKey: dataKeys.garmentSearch(filters, page),
    queryFn: () => src.searchGarments(filters, page),
    placeholderData: keepPreviousData,
  })
}

/** Contagem por grupo de estado (chips) com os demais filtros. */
export function useGarmentCounts(filters: Omit<GarmentFilters, 'stateGroup'>) {
  const src = useDataSource()
  return useQuery({
    queryKey: dataKeys.garmentCounts(filters),
    queryFn: () => src.garmentCounts(filters),
    placeholderData: keepPreviousData,
  })
}

/** Receita/payback das peças. Passe `enabled = can('acervo.cost')`: sem a permissão, a fonte nunca é chamada. */
export function useGarmentEconomics(ids: string[], enabled: boolean) {
  const src = useDataSource()
  return useQuery({
    queryKey: dataKeys.garmentEconomics(ids),
    queryFn: () => src.garmentEconomics(ids),
    enabled: enabled && ids.length > 0,
    placeholderData: keepPreviousData,
  })
}

/** Σ custo de aquisição do acervo ativo. Passe `enabled = can('acervo.cost')`. */
export function useAcervoInvestment(enabled: boolean) {
  const src = useDataSource()
  return useQuery({ queryKey: dataKeys.acervoInvestment, queryFn: () => src.acervoInvestment(), enabled })
}

/** `data === null` → não encontrada. */
export function useGarment(id: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: dataKeys.garment(id ?? ''), queryFn: () => src.getGarment(id!), enabled: !!id })
}

export function useCustomers(q: string, sort: CustomerSort, page: PageRequest) {
  const src = useDataSource()
  return useQuery({
    queryKey: dataKeys.customerSearch(q, sort, page),
    queryFn: () => src.searchCustomers(q, sort, page),
    placeholderData: keepPreviousData,
  })
}

/** `data === null` → não encontrada. */
export function useCustomer(id: string | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: dataKeys.customer(id ?? ''), queryFn: () => src.getCustomer(id!), enabled: !!id })
}

export function useRecommendations(id: string | undefined, limit = 8) {
  const src = useDataSource()
  return useQuery({ queryKey: [...dataKeys.recommendations(id ?? ''), limit], queryFn: () => src.recommend(id!, limit), enabled: !!id })
}

export function useIdealMeasurements(garmentId: string | null | undefined) {
  const src = useDataSource()
  return useQuery({ queryKey: dataKeys.ideal(garmentId ?? ''), queryFn: () => src.idealMeasurements(garmentId!), enabled: !!garmentId })
}

/* ------------------------------------------------------------------ mutações */

function afterGarment(qc: QueryClient, g: Garment) {
  qc.setQueryData(dataKeys.garment(g.id), g)
  void qc.invalidateQueries({ queryKey: dataKeys.garments })
  void qc.invalidateQueries({ queryKey: dataKeys.recommendations() })
  void qc.invalidateQueries({ queryKey: dataKeys.ideal(g.id) })
  void qc.invalidateQueries({ queryKey: dataKeys.brands })
}

function afterCustomer(qc: QueryClient, c: Customer) {
  qc.setQueryData(dataKeys.customer(c.id), c)
  void qc.invalidateQueries({ queryKey: dataKeys.customers })
  void qc.invalidateQueries({ queryKey: dataKeys.recommendations(c.id) })
}

/** Mutação de peça: grava a ficha devolvida no cache e invalida listas e sugestões. */
function useGarmentMutation<V>(fn: (v: V) => Promise<Garment>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (g) => afterGarment(qc, g) })
}

/** Mutação de cliente: grava a ficha devolvida no cache e invalida a lista e as sugestões dela. */
function useCustomerMutation<V>(fn: (v: V) => Promise<Customer>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (c) => afterCustomer(qc, c) })
}

export function useCreateGarment() {
  const src = useDataSource()
  return useGarmentMutation((input: GarmentInput) => src.createGarment(input))
}
export function useUpdateGarment(id: string) {
  const src = useDataSource()
  return useGarmentMutation((input: Partial<GarmentInput>) => src.updateGarment(id, input))
}
export function useUpdateFit(id: string) {
  const src = useDataSource()
  return useGarmentMutation((input: Partial<FitInput>) => src.updateFit(id, input))
}
export function useUpdateMeasurement(id: string) {
  const src = useDataSource()
  return useGarmentMutation((input: Partial<GarmentMeasurement>) => src.updateMeasurement(id, input))
}
export function useAddPhoto(id: string) {
  const src = useDataSource()
  return useGarmentMutation((v: { file: Blob; kind: PhotoKind }) => src.addPhoto(id, v.file, v.kind))
}
export function useRemovePhoto(id: string) {
  const src = useDataSource()
  return useGarmentMutation((photoId: string) => src.removePhoto(id, photoId))
}
export function useSetCover(id: string) {
  const src = useDataSource()
  return useGarmentMutation((photoId: string) => src.setCover(id, photoId))
}
export function useBlockGarment(id: string) {
  const src = useDataSource()
  return useGarmentMutation((v: { from: string; to: string; note: string }) => src.blockGarment(id, v.from, v.to, v.note))
}
export function useReleaseBlock(id: string) {
  const src = useDataSource()
  return useGarmentMutation((blockId: string) => src.releaseBlock(id, blockId))
}

export function useCreateCustomer() {
  const src = useDataSource()
  return useCustomerMutation((input: CustomerInput) => src.createCustomer(input))
}
export function useUpdateCustomer(id: string) {
  const src = useDataSource()
  return useCustomerMutation((input: Partial<CustomerInput>) => src.updateCustomer(id, input))
}
export function useAddMeasurement(id: string) {
  const src = useDataSource()
  return useCustomerMutation((input: CustomerMeasurementInput) => src.addMeasurement(id, input))
}
export function useAddNote(id: string) {
  const src = useDataSource()
  return useCustomerMutation((v: { content: string; channel: ContactChannel; pinned: boolean }) => src.addNote(id, v.content, v.channel, v.pinned))
}
export function useSetNotePinned(id: string) {
  const src = useDataSource()
  return useCustomerMutation((v: { noteId: string; pinned: boolean }) => src.setNotePinned(id, v.noteId, v.pinned))
}
export function useSetFavorite(id: string) {
  const src = useDataSource()
  return useCustomerMutation((v: { garmentId: string; on: boolean }) => src.setFavorite(id, v.garmentId, v.on))
}

/**
 * Depois de qualquer mutação das áreas de Agenda em diante: refaz todas as consultas (o mundo é um só, uma
 * reserva muda agenda, peças, caixa e alertas). Só `['categories']` fica de fora, que não depende de nada.
 */
export function invalidateWorld(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'categories' })
}
