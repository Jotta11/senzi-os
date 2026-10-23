// Entrada Deno da Edge Function `admin-users`. Fora do tsc/eslint do app web
// (runtime Deno); a lógica testável fica em handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { EmailTakenError, handleAdminUsers } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve((req) =>
  handleAdminUsers(req, {
    async getCaller(token) {
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data.user) return null
      // has_perm avaliado com o token do chamador (auth.uid() = ele; inativo → false).
      const asCaller = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: can, error: permError } = await asCaller.rpc('has_perm', { p: 'config.users' })
      if (permError) throw permError
      return { id: data.user.id, canManageUsers: can === true }
    },

    async createAuthUser({ email, password, full_name }) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })
      if (error) {
        if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) {
          throw new EmailTakenError()
        }
        throw error
      }
      return data.user.id
    },

    async insertAppUser({ id, email, full_name, role }) {
      const { error } = await admin.from('app_user').insert({ id, email, full_name, role })
      if (error) {
        if (error.code === '23505') throw new EmailTakenError()
        throw error
      }
    },

    async deleteAuthUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw error
    },
  }),
)
