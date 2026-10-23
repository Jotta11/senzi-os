/** Raiz da prévia visual. */
export const PREVIEW_BASE = '/preview'

/** Caminho do app → caminho na prévia: '/' → '/preview', '/acervo' → '/preview/acervo'. */
export const previewHref = (to: string): string => (to === '/' ? PREVIEW_BASE : `${PREVIEW_BASE}${to}`)
