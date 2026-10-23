import { useLocation } from 'react-router'
import { ComingSoon } from '@/shell/ComingSoon'
import { NAV } from '@/shell/nav'
import { PREVIEW_BASE } from './paths'

/** Itens do menu ainda sem tela na prévia: "Em construção" com o nome da área. */
export function PreviewComingSoon() {
  const { pathname } = useLocation()
  const area = pathname.slice(PREVIEW_BASE.length).split('/')[1] ?? ''
  const item = NAV.find((n) => n.path === `/${area}`)
  return <ComingSoon title={item?.label ?? 'Página'} />
}
