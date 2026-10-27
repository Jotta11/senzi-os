import { useRoutes } from 'react-router'
import { PreviewLayout } from './PreviewLayout'
import { previewRoutes } from './previewRoutes'

/**
 * Entrada da prévia carregada sob demanda pelo roteador do app (`/preview/*`): monta as mesmas rotas de
 * `previewRoutes` como rotas descendentes. Assim a fonte em memória, o fixture e as telas da prévia ficam num pedaço
 * próprio do build, fora do pedaço principal do app real.
 */
export function PreviewApp() {
  return useRoutes([{ element: <PreviewLayout />, children: previewRoutes.children }])
}
