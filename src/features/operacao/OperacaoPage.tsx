import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/auth/usePermissions'
import { invalidateWorld } from '@/data/hooks'
import { useOperacaoQueue } from '@/data/hooks-operacao'
import { useReservation } from '@/data/hooks-reservas'
import { MAINTENANCE_KIND } from '@/data/labels-ops'
import type { Garment, OperacaoQueue, QueueRow } from '@/data/types'
import { diffDays } from '@/domain/dates'
import { brl, dateBR, todayISO } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Button, DataTable, EmptyState, Icon, useToast, type Column, type IconName } from '@/ui'
import '../acervo/acervo.css'
import { CloseMaintenanceModal, ReleaseModal } from './CloseMaintenanceModal'
import { InspectionModal } from './InspectionModal'
import { orderTarget, type OrderTarget } from './orderTarget'
import { QueueCard } from './QueueCard'
import './operacao.css'

type Order = OperacaoQueue['openOrders'][number]
const daysSince = (iso: string, today: string) => Math.max(0, diffDays(iso.slice(0, 10), today))

/**
 * Operação — fila pós-devolução (spec `operacao-financeiro.md` parte 1): tiles por etapa, quatro filas,
 * "Bloqueadas" (quando houver) e ordens em aberto. Peças aqui ocupam o próprio calendário e não podem ser reservadas.
 * `?reserva=<id>` destaca as peças daquela reserva (vindo de "Inspecionar peças").
 */
export function OperacaoPage() {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [params] = useSearchParams()
  const queue = useOperacaoQueue()
  const focusReservation = useReservation(can('reserva.view') ? (params.get('reserva') ?? undefined) : undefined)
  const [inspecting, setInspecting] = useState<Garment | null>(null)
  const [closing, setClosing] = useState<OrderTarget | null>(null)
  const [releasing, setReleasing] = useState<Garment | null>(null)

  const focusIds = useMemo(() => new Set(focusReservation.data?.items.map((i) => i.garmentId) ?? []), [focusReservation.data])
  const q = queue.data
  const today = todayISO()

  const open = (row: QueueRow) => {
    const g = row.garment
    return (
      <>
        {can('operacao.maintenance') && row.order && (
          <Button size="sm" variant="primary" onClick={() => setClosing(orderTarget(row.order!, g))}>
            Concluir
          </Button>
        )}
        {can('operacao.release') && !row.order && (
          <Button size="sm" onClick={() => setReleasing(g)}>
            Liberar
          </Button>
        )}
      </>
    )
  }

  const total = q ? q.inspecao.length + q.higienizacao.length + q.ajuste.length + q.manutencao.length + q.bloqueado.length : 0
  const tiles: { label: string; value: number; desc: string; icon: IconName; alert?: boolean }[] = q
    ? [
        { label: 'Aguardando inspeção', value: q.inspecao.length, desc: 'peças paradas até a conferência', icon: 'alerta', alert: q.inspecao.length > 0 },
        { label: 'Em higienização', value: q.higienizacao.length, desc: 'na lavanderia', icon: 'gota' },
        { label: 'Em ajuste', value: q.ajuste.length, desc: 'ateliê', icon: 'costura' },
        { label: 'Em manutenção', value: q.manutencao.length, desc: 'reparo', icon: 'costura' },
        { label: 'Bloqueadas', value: q.bloqueado.length, desc: 'editorial, avaliação ou decisão da gestão', icon: 'tag' },
      ]
    : []

  const columns: Column<Order>[] = [
    {
      key: 'peca',
      header: 'Peça',
      render: (o) => (
        <Link to={href(`/acervo/${o.garmentId}`)}>
          <span className="mono tiny">{o.garmentCode}</span>
          <br />
          <b>{o.garmentName}</b>
        </Link>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (o) => MAINTENANCE_KIND[o.kind] },
    { key: 'desc', header: 'Descrição', render: (o) => o.description ?? '—' },
    {
      key: 'age',
      header: 'Aberta há',
      align: 'right',
      className: 'op-num',
      render: (o) => {
        const n = daysSince(o.openedAt, today)
        return <span className={n >= 7 ? 'op-old' : undefined}>{n} dia(s)</span>
      },
    },
    { key: 'due', header: 'Prazo', render: (o) => (o.dueAt ? dateBR(o.dueAt).slice(0, 5) : '—') },
    { key: 'prov', header: 'Fornecedor', render: (o) => o.provider ?? '—' },
    {
      key: 'act',
      header: <span className="sr-only">Ação</span>,
      align: 'right',
      render: (o) => (
        <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setClosing({ id: o.id, kind: o.kind, provider: o.provider, garmentCode: o.garmentCode, garmentName: o.garmentName }) }}>
          Concluir
        </Button>
      ),
    },
  ]

  return (
    <div className="ac-page">
      <header className="ac-head">
        <div className="ac-title">
          <h1 className="display">Operação</h1>
          <p className="ac-sub">
            {q ? `${total} peça(s) no ciclo · ${q.openOrders.length} ordem(ns) em aberto` : 'Carregando…'}
            {q && can('acervo.cost') && q.costLast30d != null && ` · ${brl(q.costLast30d, { cents: false })} em custos nos últimos 30 dias`}
          </p>
        </div>
        <div className="ac-actions">
          <Button
            icon="refresh"
            onClick={() => {
              void invalidateWorld(qc)
              toast({ title: 'Atualizado', description: 'Estados reconciliados com o calendário.', tone: 'ok' })
            }}
          >
            Atualizar
          </Button>
        </div>
      </header>

      <div className="ac-body">
        {!q ? (
          <p className="muted" role="status" aria-busy="true">
            Carregando a fila…
          </p>
        ) : (
          <>
            <div className="op-tiles" role="list" aria-label="Resumo da operação">
              {tiles.map((t) => (
                <div key={t.label} role="listitem" className={t.alert ? 'alert' : undefined}>
                  <span className="op-tile-l">
                    <Icon name={t.icon} size={14} /> {t.label}
                  </span>
                  <b className="display">{t.value}</b>
                  <span className="op-tile-d">{t.desc}</span>
                </div>
              ))}
            </div>

            <div className="note info">
              <Icon name="alerta" size={15} />
              <span>
                <b>Nenhuma peça nesta tela pode ser reservada.</b> Enquanto está aqui, ela ocupa o próprio calendário — é o que garante que o Atendimento nunca prometa uma peça que a Operação ainda tem em mãos.
              </span>
            </div>

            <div className="op-grid">
              <QueueCard
                title="Aguardando inspeção"
                tone="teal"
                description="Peça devolvida. Conferir item a item antes de decidir para onde ela vai."
                rows={q.inspecao}
                focusIds={focusIds}
                action={(r) =>
                  can('operacao.inspect') && (
                    <Button size="sm" variant="primary" onClick={() => setInspecting(r.garment)}>
                      Inspecionar
                    </Button>
                  )
                }
              />
              <QueueCard title="Em higienização" tone="teal" description="Na lavanderia. Ao concluir, lance o custo — ele entra no resultado da peça." rows={q.higienizacao} focusIds={focusIds} action={open} />
              <QueueCard title="Em ajuste" tone="ochre" description="Alterações reversíveis feitas para uma cliente específica." rows={q.ajuste} focusIds={focusIds} action={open} />
              <QueueCard title="Em manutenção" tone="ochre" description="Reparos. Custo lançado aqui abate o resultado econômico da peça." rows={q.manutencao} focusIds={focusIds} action={open} />
              {q.bloqueado.length > 0 && (
                <QueueCard
                  wide
                  title="Bloqueadas"
                  tone="stone"
                  description="Fora do acervo por decisão da gestão — ensaio, avaliação, empréstimo institucional."
                  rows={q.bloqueado}
                  focusIds={focusIds}
                  action={(r) =>
                    can('operacao.release') && (
                      <Button size="sm" onClick={() => setReleasing(r.garment)}>
                        Devolver ao acervo
                      </Button>
                    )
                  }
                />
              )}
            </div>

            {can('operacao.maintenance') && (
              <section className="card op-orders" aria-label="Ordens em aberto">
                <div className="card-h">
                  <h3>Ordens em aberto</h3>
                  <span className="muted tiny">higienização, ajuste e manutenção em curso</span>
                </div>
                <DataTable
                  caption="Ordens em aberto"
                  columns={columns}
                  rows={q.openOrders}
                  rowKey={(o) => o.id}
                  onRowClick={(o) => navigate(href(`/acervo/${o.garmentId}`))}
                  empty={<EmptyState icon="check" title="Nenhuma ordem em aberto" description="Todo o acervo está pronto para locação." />}
                />
              </section>
            )}
          </>
        )}
      </div>

      <InspectionModal garment={inspecting} onClose={() => setInspecting(null)} />
      <CloseMaintenanceModal order={closing} onClose={() => setClosing(null)} />
      <ReleaseModal garment={releasing} onClose={() => setReleasing(null)} />
    </div>
  )
}
