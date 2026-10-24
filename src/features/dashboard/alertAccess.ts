import type { Perm } from '@/auth/permissions'
import type { Alert } from '@/data/types'

/** Permissão da rota de destino do alerta (cada box leva a uma página; quem não pode abri-la não vê o alerta). */
function routePerm(route: string): Perm | null {
  if (route.startsWith('/reservas')) return 'reserva.view'
  if (route.startsWith('/acervo')) return 'acervo.view'
  if (route.startsWith('/clientes')) return 'cliente.view'
  if (route.startsWith('/provas')) return 'prova.view'
  if (route.startsWith('/operacao')) return 'operacao.view'
  return null
}

/** Alertas que o perfil pode ver: `pagamento_pendente` exige `financeiro.view`; os demais, a permissão do destino. */
export function visibleAlerts(alerts: Alert[], can: (p: Perm) => boolean): Alert[] {
  return alerts.filter((a) => {
    if (a.kind === 'pagamento_pendente' && !can('financeiro.view')) return false
    const p = routePerm(a.route)
    return p ? can(p) : true
  })
}
