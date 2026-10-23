import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { formatDateTime } from '@/lib/datetime'
import { getSupabase } from '@/lib/supabase'
import { Button, Card, Field } from '@/ui'

export const AUDIT_PAGE_SIZE = 50

/** Tabelas auditadas (trigger `audit_trigger`) e seus rótulos. Novas tabelas entram aqui. */
const TABLE_LABEL: Record<string, string> = {
  app_user: 'Usuários',
  user_permission_override: 'Permissões por usuário',
}

const ACTION_LABEL: Record<string, string> = { insert: 'inserção', update: 'alteração', delete: 'exclusão' }

type AuditRow = {
  id: number
  at: string
  actor_id: string | null
  table_name: string
  row_id: string
  action: string
  before: unknown
  after: unknown
}

export function AuditTab() {
  const [table, setTable] = useState('')
  const [page, setPage] = useState(0)

  const log = useQuery({
    queryKey: ['config', 'audit', table, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const sb = getSupabase()
      if (!sb) return { rows: [] as AuditRow[], total: 0 }
      const from = page * AUDIT_PAGE_SIZE
      let q = sb
        .from('audit_log')
        .select('id, at, actor_id, table_name, row_id, action, before, after', { count: 'exact' })
        .order('at', { ascending: false })
        .order('id', { ascending: false })
      if (table) q = q.eq('table_name', table)
      const { data, error, count } = await q.range(from, from + AUDIT_PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as AuditRow[], total: count ?? 0 }
    },
  })

  const actorIds = [...new Set((log.data?.rows ?? []).map((r) => r.actor_id).filter((x): x is string => !!x))].sort()
  const actors = useQuery({
    queryKey: ['config', 'audit-actors', actorIds],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const sb = getSupabase()
      if (!sb) return new Map<string, string>()
      const { data, error } = await sb.from('app_user').select('id, full_name').in('id', actorIds)
      if (error) throw error
      return new Map(((data ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]))
    },
  })

  const total = log.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))
  const actorName = (id: string | null) => (id ? (actors.data?.get(id) ?? '—') : 'Sistema')

  return (
    <Card
      title="Histórico de alterações"
      flush
      actions={
        <div style={{ minWidth: 220 }}>
          <Field
            as="select"
            label="Tabela"
            value={table}
            onChange={(e) => {
              setTable(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Todas</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Field>
        </div>
      }
    >
      {log.isLoading && <p className="card-b muted">Carregando…</p>}
      {log.isError && (
        <p className="card-b note red" role="alert">
          Não foi possível carregar a auditoria.
        </p>
      )}
      {log.data && log.data.rows.length === 0 && <p className="card-b muted">Nenhum registro encontrado.</p>}
      {log.data && log.data.rows.length > 0 && (
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th scope="col">Data e hora</th>
                <th scope="col">Quem</th>
                <th scope="col">Tabela</th>
                <th scope="col">Ação</th>
                <th scope="col">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {log.data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="num">{formatDateTime(r.at)}</td>
                  <td>{actorName(r.actor_id)}</td>
                  <td>
                    {TABLE_LABEL[r.table_name] ?? r.table_name}
                    <span className="cfg-sub mono">{r.row_id}</span>
                  </td>
                  <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td>
                    <details>
                      <summary>Ver detalhes</summary>
                      {r.before != null && (
                        <>
                          <span className="tiny muted">Antes</span>
                          <pre className="cfg-json">{JSON.stringify(r.before, null, 2)}</pre>
                        </>
                      )}
                      {r.after != null && (
                        <>
                          <span className="tiny muted">Depois</span>
                          <pre className="cfg-json">{JSON.stringify(r.after, null, 2)}</pre>
                        </>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row cfg-pager">
        <span>
          Página {page + 1} de {pages}
        </span>
        <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </Button>
        <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
          Próxima
        </Button>
      </div>
    </Card>
  )
}
