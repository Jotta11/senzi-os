/**
 * Cria o primeiro administrador do Senzi OS.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm bootstrap:admin -- --email ana@senzi.com.br --name "Ana Souza"
 *
 * Lê só SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente do terminal — nunca o
 * `.env.local` do front nem variáveis VITE_* (a chave service_role não pode ir para o front).
 * A senha vem de `--password` ou é pedida no terminal (sem eco). Roda com o
 * type stripping nativo do Node ≥ 22.18 / 24.
 */
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

function fail(msg: string): never {
  console.error(`Erro: ${msg}`)
  process.exit(1)
}

async function askPassword(): Promise<string> {
  let muted = false
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk)
      cb()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  const pending = rl.question('Senha (mínimo 8 caracteres): ')
  muted = true
  const answer = await pending
  rl.close()
  process.stdout.write('\n')
  return answer
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
  })

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    fail('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do terminal (não use o .env.local do front).')
  }

  const email = values.email?.trim().toLowerCase()
  const name = values.name?.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('informe um e-mail válido com --email.')
  if (!name) fail('informe o nome com --name.')

  const password = values.password ?? (await askPassword())
  if (password.length < 8) fail('a senha deve ter ao menos 8 caracteres.')

  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })
  if (error || !data.user) fail(`não foi possível criar o usuário no Auth (${error?.message ?? 'sem retorno'}).`)

  const { error: insertError } = await sb
    .from('app_user')
    .insert({ id: data.user.id, email, full_name: name, role: 'admin' })
  if (insertError) {
    await sb.auth.admin.deleteUser(data.user.id)
    fail(`não foi possível registrar o administrador (${insertError.message}). O usuário do Auth foi removido.`)
  }

  console.log(`Administrador criado: ${name} <${email}>. Entre no Senzi OS e defina seu PIN em Configurações.`)
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)))
