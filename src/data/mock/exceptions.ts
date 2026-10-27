/**
 * Autorização de exceção por PIN na fonte em memória — as mesmas regras da RPC `authorize_exception`:
 * motivo obrigatório, admin ativo com PIN, bloqueio após 5 erros em 15 min e, sem prazo, após 10 erros em 24 h
 * (contados desde o último acerto; tentativas durante o bloqueio não contam; no banco, trocar o PIN libera).
 * Administradora da prévia: Júlia Senzi, PIN 1234.
 * A autorização guarda o valor máximo autorizado (`maxAmount`: obrigatório no desconto acima do limite, opcional nos
 * outros tipos); a operação que a usa (`consumeException`) grava o valor usado e o vínculo com a reserva.
 */
import type { ActiveAdmin, AuthorizeArgs, AuthorizeResult } from '../source-reservas'
import type { ExceptionAuthorization, ExceptionKind, Reservation } from '../types'
import type { MockCtx } from './context'

/** PIN de cada administrador da prévia (no banco é um hash bcrypt). */
const PINS: Record<string, string> = { 'julia@senzi.com.br': '1234' }
export const DEMO_PIN = '1234'

const KINDS: ExceptionKind[] = ['retirada_com_saldo', 'desconto_acima_limite', 'dispensa_sinal_minimo']
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 5
const DAY_MS = 24 * 60 * 60_000
const MAX_FAILURES_DAY = 10

export type ExceptionsMock = {
  listActiveAdmins(): Promise<ActiveAdmin[]>
  authorize(args: AuthorizeArgs): Promise<AuthorizeResult>
}

export function exceptionsMock(ctx: MockCtx): ExceptionsMock {
  const { db, run } = ctx
  return {
    listActiveAdmins: () => run(() => db.users.filter((u) => u.role === 'admin').map((u) => ({ id: u.id, full_name: u.name, email: u.email }))),

    authorize: (args) =>
      run((): AuthorizeResult => {
        if (!KINDS.includes(args.kind)) return { ok: false, error: 'PARAMETRO_INVALIDO' }
        const reason = args.reason?.trim() ?? ''
        if (!reason) return { ok: false, error: 'MOTIVO_OBRIGATORIO' }
        const max = args.maxAmount ?? null
        if ((max !== null && !(max >= 0)) || (args.kind === 'desconto_acima_limite' && !(max !== null && max > 0))) return { ok: false, error: 'PARAMETRO_INVALIDO' }
        const email = args.email.trim().toLowerCase()
        const user = db.users.find((u) => u.email === email)
        if (!user) return { ok: false, error: 'AUTORIZACAO_INVALIDA' }

        // Relógio real (não a data de negócio `today`): a janela de bloqueio de 15 min conta tempo de verdade.
        const nowMs = Date.now()
        const mine = db.pinAttempts.filter((a) => a.email === email)
        const lastOk = mine.map((a) => a.ok).lastIndexOf(true)
        const misses = mine.slice(lastOk + 1).filter((a) => !a.ok).map((a) => Date.parse(a.at))
        const failures = misses.filter((t) => nowMs - t < WINDOW_MS).length
        const lockedForGood = misses.some((t, i) => misses.slice(0, i + 1).filter((u) => u > t - DAY_MS).length >= MAX_FAILURES_DAY)
        if (failures >= MAX_FAILURES || lockedForGood) return { ok: false, error: 'PIN_BLOQUEADO' }

        const ok = user.role === 'admin' && PINS[email] !== undefined && PINS[email] === args.pin
        db.pinAttempts.push({ email, at: new Date(nowMs).toISOString(), ok })
        if (!ok) return { ok: false, error: 'AUTORIZACAO_INVALIDA' }

        const exc: ExceptionAuthorization = {
          id: ctx.newId('exc'),
          reservationId: args.refId,
          refType: args.refType,
          kind: args.kind,
          amount: 0,
          maxAmount: max === null ? null : Math.round(max * 100) / 100,
          reason,
          authorizedBy: user.id,
          authorizedByName: user.name,
          authorizedByRole: 'Administrador',
          authorizedAt: ctx.now(),
        }
        db.exceptions.push(exc)
        return { ok: true, id: exc.id }
      }),
  }
}

/**
 * Exceção utilizável: existe, é do tipo pedido, ainda não foi usada, cobre o valor (`amount` ≤ `maxAmount`; desconto
 * sem valor autorizado não vale) e aponta para esta reserva (`refType = 'reserva'`) ou para um rascunho ainda sem id
 * (`reserva_rascunho`, só se `draft`). Senão `null`.
 */
export function usableException(ctx: MockCtx, id: string | undefined, kind: ExceptionKind, target: { reservationId: string | null; draft?: boolean; amount: number }): ExceptionAuthorization | null {
  if (!id) return null
  const exc = ctx.db.exceptions.find((e) => e.id === id)
  if (!exc || exc.kind !== kind) return null
  const max = exc.maxAmount ?? null
  if (max === null ? kind === 'desconto_acima_limite' : Math.round(target.amount * 100) / 100 > max + 0.005) return null
  if (ctx.db.reservations.some((r) => r.authorizations.some((a) => a.id === id))) return null
  if (exc.refType === 'reserva_rascunho') return target.draft ? exc : null
  return target.reservationId !== null && exc.reservationId === target.reservationId ? exc : null
}

/** Grava o uso: valor, vínculo com a reserva (religa o rascunho), cópia em `authorizations` e entrada no histórico. */
export function consumeException(ctx: MockCtx, exc: ExceptionAuthorization, r: Reservation, amount: number): void {
  exc.reservationId = r.id
  exc.refType = 'reserva'
  exc.amount = amount
  r.authorizations.push({ ...exc })
  r.history.push({
    id: ctx.newId('rh'),
    fromState: null,
    toState: r.state,
    reason: `Exceção autorizada: ${exc.reason || exc.kind} (${exc.authorizedByName})`,
    userId: ctx.userId(),
    userName: ctx.userName(),
    occurredAt: ctx.now(),
  })
}
