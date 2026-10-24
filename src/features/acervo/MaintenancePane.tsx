import { usePermissions } from '@/auth/usePermissions'
import { useGarmentMaintenances } from '@/data/hooks-operacao'
import { INSPECTION_RESULT, MAINTENANCE_KIND, MAINTENANCE_STATE } from '@/data/labels-ops'
import type { Garment, Maintenance } from '@/data/types'
import { brl, dateBR } from '@/lib/format'
import { Badge, DataTable, EmptyState, type Column } from '@/ui'
import '../operacao/operacao.css'

/** Aba "Manutenções" da ficha: ordens de serviço e inspeções da peça (custo só com `acervo.cost`). */
export function MaintenancePane({ garment: g }: { garment: Garment }) {
  const { can } = usePermissions()
  const q = useGarmentMaintenances(g.id, can('operacao.view'))
  const cost = can('acervo.cost')

  const columns: Column<Maintenance>[] = [
    { key: 'tipo', header: 'Tipo', render: (m) => MAINTENANCE_KIND[m.kind] },
    { key: 'desc', header: 'Descrição', render: (m) => m.description ?? '—' },
    { key: 'open', header: 'Abertura', render: (m) => dateBR(m.openedAt.slice(0, 10)) },
    { key: 'end', header: 'Prazo / conclusão', render: (m) => (m.closedAt ? `concluída ${dateBR(m.closedAt.slice(0, 10))}` : m.dueAt ? `prazo ${dateBR(m.dueAt)}` : '—') },
    { key: 'prov', header: 'Fornecedor', render: (m) => m.provider ?? '—' },
    ...(cost ? [{ key: 'cost', header: 'Custo', align: 'right' as const, className: 'op-num', render: (m: Maintenance) => (m.state === 'concluida' ? brl(m.cost) : '—') }] : []),
    { key: 'st', header: 'Estado', render: (m) => <Badge tone={MAINTENANCE_STATE[m.state].tone}>{MAINTENANCE_STATE[m.state].label}</Badge> },
  ]

  if (q.isPending) return <p className="muted tiny" role="status">Carregando manutenções…</p>
  const { maintenances = [], inspections = [] } = q.data ?? {}
  return (
    <div className="op-pane">
      <section className="card">
        <div className="card-h">
          <h3>Ordens de serviço</h3>
          <span className="muted tiny">higienização, ajuste e manutenção</span>
        </div>
        <DataTable caption="Ordens de serviço" columns={columns} rows={maintenances} rowKey={(m) => m.id} empty={<EmptyState icon="costura" title="Nenhuma ordem de serviço" description="A peça ainda não passou pela Operação." />} />
      </section>
      <section className="card">
        <div className="card-h">
          <h3>Inspeções</h3>
          <span className="muted tiny">da mais recente para a mais antiga</span>
        </div>
        {inspections.length === 0 ? (
          <EmptyState icon="operacao" title="Nenhuma inspeção" description="As inspeções de devolução aparecem aqui." />
        ) : (
          <ul className="op-insp" aria-label="Inspeções">
            {inspections.map((i) => (
              <li key={i.id}>
                <div className="op-insp-h">
                  <b>{dateBR(i.inspectedAt.slice(0, 10))}</b>
                  <Badge tone={INSPECTION_RESULT[i.result].tone}>{INSPECTION_RESULT[i.result].label}</Badge>
                  <span className="muted tiny">por {i.inspectorName}</span>
                  {i.photos.length > 0 && <span className="muted tiny">{i.photos.length} foto(s)</span>}
                </div>
                {i.findings.length > 0 && (
                  <ul>
                    {i.findings.map((f) => (
                      <li key={f.label}>
                        {f.label} ({f.severity === 'media' ? 'média' : f.severity}){f.note ? ` — ${f.note}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {i.notes && <span className="tiny muted">{i.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
