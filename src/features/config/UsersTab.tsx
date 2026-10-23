import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card } from '@/ui'
import { UserForm } from './UserForm'
import { ROLE_LABEL, usersKey, useUsers } from './queries'

type Editing = { mode: 'create' } | { mode: 'edit'; id: string } | null

export function UsersTab() {
  const qc = useQueryClient()
  const users = useUsers()
  const [editing, setEditing] = useState<Editing>(null)
  const editingUser = editing?.mode === 'edit' ? users.data?.find((u) => u.id === editing.id) : undefined

  async function done() {
    setEditing(null)
    await Promise.all([
      qc.invalidateQueries({ queryKey: usersKey }),
      qc.invalidateQueries({ queryKey: ['my_permissions'] }),
      qc.invalidateQueries({ queryKey: ['active_admins'] }),
    ])
  }

  return (
    <div className="cfg-stack">
      {editing?.mode === 'create' && (
        <Card title="Novo usuário">
          <UserForm mode="create" onDone={done} onCancel={() => setEditing(null)} />
        </Card>
      )}
      {editingUser && (
        <Card title="Editar usuário">
          <UserForm key={editingUser.id} mode="edit" user={editingUser} onDone={done} onCancel={() => setEditing(null)} />
        </Card>
      )}
      <Card
        title="Usuários"
        flush
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({ mode: 'create' })}>
            Novo usuário
          </Button>
        }
      >
        {users.isLoading && <p className="card-b muted">Carregando…</p>}
        {users.isError && (
          <p className="card-b note red" role="alert">
            Não foi possível carregar os usuários.
          </p>
        )}
        {users.data && (
          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.full_name}
                      <span className="cfg-sub">{u.email}</span>
                    </td>
                    <td>
                      <Badge tone={u.role === 'admin' ? 'wine' : 'indigo'} dot={false}>
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={u.is_active ? 'green' : 'stone'}>{u.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" aria-label={`Editar ${u.full_name}`} onClick={() => setEditing({ mode: 'edit', id: u.id })}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
