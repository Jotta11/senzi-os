import { useEffect } from 'react'

/** Atalho ⌘K / Ctrl+K: abre a busca de qualquer tela. */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
}
