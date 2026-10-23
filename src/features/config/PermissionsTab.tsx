import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PERMISSIONS, type Perm } from '@/auth/permissions'
import { getSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Card, Field } from '@/ui'
import { fetchUserAccess, ROLE_LABEL, updateUser, usersKey, useUsers, type Role } from './queries'

type State = 'herdado' | 'concedido' | 'revogado'

const GROUP_LABEL: Record<string, string> = {
  dashboard: 'Painel',
  agenda: 'Agenda',
  cliente: 'Clientes',
  acervo: 'Acervo',
  prova: 'Provas',
  reserva: 'Reservas',
  operacao: 'Operação',
  financeiro: 'Financeiro',
  inteligencia: 'Inteligência',
  config: 'Configurações',
}

const CATALOG = Object.keys(PERMISSIONS) as Perm[]

function useRoleDefaults() {
  return useQuery({
    queryKey: ['config', 'role_permission'],
    queryFn: async () => {
      const sb = getSupabase()
      if (!sb) return []
      const { data, error } = await sb.from('role_permission').select('role, permission_key')
      if (error) throw error
      return (data ?? []) as { role: Role; permission_key: string }[]
    },
  })
}

function useOverrides(userId: string) {
  return useQuery({
    queryKey: ['config', 'overrides', userId],
    enabled: !!userId,
    queryFn: async () => {
      const sb = getSupabase()
      if (!sb) return []
      const { data, error } = await sb
        .from('user_permission_override')
        .select('user_id, permission_key, granted')
        .eq('user_id', userId)
      if (error) throw error
      return (data ?? []) as { permission_key: string; granted: boolean }[]
    },
  })
}

/** Exceções por usuário sobre o perfil: herdado (segue o perfil), concedido ou revogado. */
export function PermissionsTab() {
  const qc = useQueryClient()
  const users = useUsers()
  const defaults = useRoleDefaults()
  const [userId, setUserId] = useState('')
  const overrides = useOverrides(userId)
  /** Alterações locais ainda não salvas, sobre o estado do banco. */
  const [edits, setEdits] = useState<Record<string, State>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const user = users.data?.find((u) => u.id === userId)

  const draft = useMemo(() => {
    const saved: Record<string, State> = {}
    for (const o of overrides.data ?? []) saved[o.permission_key] = o.granted ? 'concedido' : 'revogado'
    return { ...saved, ...edits }
  }, [overrides.data, edits])

  const roleHas = useMemo(() => {
    const set = new Set<string>()
    for (const r of defaults.data ?? []) if (user && r.role === user.role) set.add(r.permission_key)
    return set
  }, [defaults.data, user])

  // REPLACE: salvar sem os overrides atuais carregados apagaria os existentes.
  const canSave = !!user && overrides.isSuccess && defaults.isSuccess && !busy

  async function save() {
    if (!user || !canSave) return
    setMsg(null)
    setBusy(true)
    const payload: Record<string, boolean> = {}
    for (const [k, s] of Object.entries(draft)) if (s !== 'herdado') payload[k] = s === 'concedido'
    try {
      const fresh = await fetchUserAccess(user.id)
      await updateUser(fresh, payload)
      await qc.invalidateQueries({ queryKey: ['config', 'overrides', user.id] })
      setEdits({})
      setMsg({ ok: true, text: 'Permissões salvas.' })
      await Promise.all([
        qc.invalidateQueries({ queryKey: usersKey }),
        qc.invalidateQueries({ queryKey: ['my_permissions'] }),
      ])
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cfg-stack">
      <Card>
        <div className="cfg-narrow">
          <Field
            as="select"
            label="Usuário"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              setEdits({})
              setMsg(null)
            }}
          >
            <option value="">Selecione…</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} — {ROLE_LABEL[u.role]}
              </option>
            ))}
          </Field>
        </div>
      </Card>

      {user && (
        <Card
          title={`Permissões de ${user.full_name}`}
          meta={<span className="muted tiny">Perfil: {ROLE_LABEL[user.role]}</span>}
          flush
          actions={
            <Button variant="primary" size="sm" onClick={save} disabled={!canSave}>
              Salvar permissões
            </Button>
          }
        >
          {(overrides.isError || defaults.isError) && (
            <div className="note red" role="alert" style={{ margin: 12, alignItems: 'center' }}>
              <span>Não foi possível carregar as permissões deste usuário.</span>
              <Button
                size="sm"
                onClick={() => {
                  if (overrides.isError) void overrides.refetch()
                  if (defaults.isError) void defaults.refetch()
                }}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {msg && (
            <p className={`note ${msg.ok ? 'green' : 'red'}`} role={msg.ok ? 'status' : 'alert'} style={{ margin: 12 }}>
              {msg.text}
            </p>
          )}
          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th scope="col">Permissão</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {CATALOG.map((key, i) => {
                  const group = key.split('.')[0]!
                  const header = i === 0 || CATALOG[i - 1]!.split('.')[0] !== group
                  const label = PERMISSIONS[key]
                  const id = `perm-${key}`
                  return [
                    header && (
                      <tr key={`g-${group}`}>
                        <td colSpan={2} className="cfg-group">
                          {GROUP_LABEL[group] ?? group}
                        </td>
                      </tr>
                    ),
                    <tr key={key}>
                      <td>
                        <label htmlFor={id}>{label}</label>
                        <span className="cfg-sub mono">{key}</span>
                      </td>
                      <td>
                        <select
                          id={id}
                          value={draft[key] ?? 'herdado'}
                          disabled={!overrides.isSuccess}
                          onChange={(e) => setEdits((d) => ({ ...d, [key]: e.target.value as State }))}
                        >
                          <option value="herdado">Herdado do perfil ({roleHas.has(key) ? 'permitido' : 'não permitido'})</option>
                          <option value="concedido">Concedido</option>
                          <option value="revogado">Revogado</option>
                        </select>
                      </td>
                    </tr>,
                  ]
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
