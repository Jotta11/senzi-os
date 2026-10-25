/** Cor da marca usada na barra do sistema, na tela de abertura e no fundo dos ícones. */
export const THEME_COLOR = '#3F1116'

/**
 * Manifesto do app instalável. `startUrl` é onde o ícone abre: '/' no sistema de verdade,
 * '/preview' enquanto o Supabase não está configurado (prévia com dados fictícios).
 */
export function buildManifest(startUrl: string) {
  const base = startUrl === '/' ? '' : startUrl
  const shortcut = (name: string, path: string) => ({
    name,
    url: `${base}${path}`,
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  })
  return {
    id: '/',
    name: 'Senzi OS',
    short_name: 'Senzi',
    description: 'Sistema da Senzi Club: agenda, provas, reservas, acervo, clientes e financeiro.',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      shortcut('Agenda', '/agenda'),
      shortcut('Reservas', '/reservas'),
      shortcut('Clientes', '/clientes'),
      shortcut('Acervo', '/acervo'),
    ],
  }
}
