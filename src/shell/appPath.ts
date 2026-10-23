import { createContext, useCallback, useContext } from 'react'

/**
 * Prefixo das rotas do app: '' no app real, '/preview' na prévia visual.
 * As telas montam links com `useAppHref()('/acervo/123')` e funcionam nos dois lugares.
 */
export const AppPathContext = createContext('')

/** `href('/acervo/x')` → '/acervo/x' no app, '/preview/acervo/x' na prévia; `href('/')` → raiz de cada um. */
export function useAppHref(): (path: string) => string {
  const base = useContext(AppPathContext)
  return useCallback((path: string) => (path === '/' ? base || '/' : `${base}${path}`), [base])
}
