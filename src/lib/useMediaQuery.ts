import { useCallback, useSyncExternalStore } from 'react'

/** Celular: a sidebar vira gaveta + barra de abas embaixo. Mesmo valor do `@media` em shell.css. */
export const PHONE_QUERY = '(max-width: 640px)'

/** `true` enquanto a media query casar. Sem `matchMedia` (jsdom, SSR) responde `false`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
