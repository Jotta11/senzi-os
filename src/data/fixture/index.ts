import type { Category, Customer, Garment } from '../types'
import { buildCustomers } from './customers'
import { BRANDS, buildGarments, CATEGORIES } from './garments'

export type Fixture = { categories: Category[]; brands: string[]; garments: Garment[]; customers: Customer[] }

/** Dados fictícios completos, com datas relativas a `today` (`aaaa-mm-dd`). Sempre um objeto novo. */
export function buildFixture(today: string): Fixture {
  const garments = buildGarments(today)
  return {
    categories: CATEGORIES.map((c) => ({ ...c })),
    brands: [...BRANDS],
    garments,
    customers: buildCustomers(today, garments),
  }
}
