/** Categorias financeiras de sistema: o domínio as encontra pela `systemKey`, nunca por id literal. */
import type { FinCategory, FinSystemKey } from '@/data/types'

type Cats = Pick<FinCategory, 'id' | 'systemKey'>[]

/** Id da categoria de sistema `key` (`null` se a fonte não a tem). */
export const systemCategoryId = (cats: Cats, key: FinSystemKey): string | null => cats.find((c) => c.systemKey === key)?.id ?? null

/** Ids das categorias de sistema em `keys` (as que existirem). */
export const systemCategoryIds = (cats: Cats, keys: FinSystemKey[]): string[] => cats.filter((c) => c.systemKey && keys.includes(c.systemKey)).map((c) => c.id)
