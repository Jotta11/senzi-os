/**
 * Edge Function `admin-users` — lógica pura (sem Deno, sem URLs remotas) para ser
 * testada no Vitest. O wiring real das dependências fica em `index.ts`.
 *
 * POST { action: 'create', email, full_name, role, password }
 *   → 201 { id } | 4xx/5xx { error: <mensagem pt-BR> }
 */

export type AppRole = 'admin' | 'atendimento'

/** Lançado por `createAuthUser`/`insertAppUser` quando o e-mail já existe. */
export class EmailTakenError extends Error {
  constructor() {
    super('EMAIL_EXISTENTE')
    this.name = 'EmailTakenError'
  }
}

export type AdminUsersDeps = {
  /** Valida o JWT do chamador e avalia `has_perm('config.users')` com o token dele. `null` = sessão inválida. */
  getCaller(token: string): Promise<{ id: string; canManageUsers: boolean } | null>
  /** Cria em `auth.users` (service role) e devolve o id. */
  createAuthUser(input: { email: string; password: string; full_name: string }): Promise<string>
  insertAppUser(input: { id: string; email: string; full_name: string; role: AppRole }): Promise<void>
  /** Desfaz `createAuthUser` quando `insertAppUser` falha. */
  deleteAuthUser(id: string): Promise<void>
  /**
   * Log de falhas internas no servidor (padrão: console.error). Recebe só código/mensagem
   * do erro e ids — nunca token, chaves, senha ou corpo da requisição.
   */
  logError?(event: string, detail: Record<string, unknown>): void
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MSG = {
  noSession: 'Sessão inválida. Entre novamente.',
  forbidden: 'Você não tem permissão para gerenciar usuários.',
  method: 'Método não permitido.',
  body: 'Requisição inválida.',
  action: 'Ação inválida.',
  name: 'Informe o nome.',
  email: 'Informe um e-mail válido.',
  role: 'Perfil inválido.',
  password: 'A senha deve ter ao menos 8 caracteres.',
  passwordMax: 'A senha deve ter no máximo 72 caracteres.',
  permCheck: 'Não foi possível verificar suas permissões. Tente novamente.',
  duplicate: 'Já existe um usuário com este e-mail.',
  internal: 'Não foi possível criar o usuário. Tente novamente.',
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

const fail = (status: number, error: string) => json(status, { error })

/** Só código e mensagem do erro — nada de payloads. */
function errInfo(err: unknown): Record<string, unknown> {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; name?: unknown }
    return { code: e.code ?? e.name ?? null, message: typeof e.message === 'string' ? e.message : null }
  }
  return { code: null, message: String(err) }
}

/** Limite do bcrypt usado pelo Supabase Auth. */
const PASSWORD_MAX = 72

export async function handleAdminUsers(req: Request, deps: AdminUsersDeps): Promise<Response> {
  const logError = deps.logError ?? ((event: string, detail: Record<string, unknown>) => console.error(event, detail))
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, MSG.method)

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return fail(401, MSG.noSession)

  let caller: Awaited<ReturnType<AdminUsersDeps['getCaller']>>
  try {
    caller = await deps.getCaller(token)
  } catch (err) {
    // JWT inválido chega como null; exceção aqui é falha ao checar a permissão.
    logError('admin-users: falha ao verificar permissão do chamador', errInfo(err))
    return fail(500, MSG.permCheck)
  }
  if (!caller) return fail(401, MSG.noSession)
  if (!caller.canManageUsers) return fail(403, MSG.forbidden)

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, MSG.body)
    body = parsed as Record<string, unknown>
  } catch {
    return fail(400, MSG.body)
  }

  if (body.action !== 'create') return fail(400, MSG.action)

  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role
  const password = typeof body.password === 'string' ? body.password : ''

  if (!full_name) return fail(400, MSG.name)
  if (!EMAIL_RE.test(email)) return fail(400, MSG.email)
  if (role !== 'admin' && role !== 'atendimento') return fail(400, MSG.role)
  if (password.length < 8) return fail(400, MSG.password)
  if (password.length > PASSWORD_MAX) return fail(400, MSG.passwordMax)

  let id: string
  try {
    id = await deps.createAuthUser({ email, password, full_name })
  } catch (err) {
    if (err instanceof EmailTakenError) return fail(409, MSG.duplicate)
    logError('admin-users: falha ao criar usuário no auth', errInfo(err))
    return fail(500, MSG.internal)
  }

  try {
    await deps.insertAppUser({ id, email, full_name, role })
  } catch (err) {
    if (!(err instanceof EmailTakenError)) logError('admin-users: falha ao inserir app_user', { ...errInfo(err), auth_user_id: id })
    // Sem a linha em app_user o login fica órfão: desfaz o usuário do auth.
    try {
      await deps.deleteAuthUser(id)
    } catch (rollbackErr) {
      logError('admin-users: rollback falhou, usuário órfão no auth', { ...errInfo(rollbackErr), orphan_auth_user_id: id })
    }
    return err instanceof EmailTakenError ? fail(409, MSG.duplicate) : fail(500, MSG.internal)
  }

  return json(201, { id })
}
