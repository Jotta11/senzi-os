/**
 * Reservas na fonte em memória: compõe leituras, rascunho, ciclo (confirmação atômica, retirada, devolução,
 * cancelamento) e pagamentos sobre o mesmo mundo. As regras vêm de `src/domain/` — aqui só a orquestração.
 */
import type { ReservasSource } from '../source-reservas'
import type { MockCtx } from './context'
import { reservasDraft } from './reservas-draft'
import { reservasLifecycle } from './reservas-lifecycle'
import { reservasPayments } from './reservas-payments'
import { reservasRead } from './reservas-read'
import { reservaKit } from './reservas-shared'

export function reservas(ctx: MockCtx): ReservasSource {
  const kit = reservaKit(ctx)
  return { ...reservasRead(ctx, kit), ...reservasDraft(ctx, kit), ...reservasLifecycle(ctx, kit), ...reservasPayments(ctx, kit) }
}
