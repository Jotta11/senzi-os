import { useState } from 'react'
import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCustomerFittings, useFittingStats, useGarmentFittings } from '@/data/hooks-agenda'
import { FIT_OUTCOME, FITTING_STATE } from '@/data/labels-ops'
import type { FittingHistoryRow, Garment } from '@/data/types'
import { dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, EmptyState } from '@/ui'
import { pct, plural } from './fittingFormat'
import { ScheduleFittingModal } from './ScheduleFittingModal'
import './provas.css'

/** Aba Provas da ficha da cliente: sessões (mais recente primeiro) com as peças e o resultado de cada uma. */
export function CustomerFittingsPane({ customerId }: { customerId: string }) {
  const { can } = usePermissions()
  const q = useCustomerFittings(customerId, can('prova.view'))
  const [scheduling, setScheduling] = useState(false)
  const rows = q.data ?? []
  return (
    <section className="card">
      <div className="card-h">
        <h3>Provas</h3>
        <span className="muted tiny">o que ela experimentou e o que achou</span>
        {can('prova.manage') && (
          <div className="actions">
            <Button size="sm" icon="plus" onClick={() => setScheduling(true)}>
              Agendar
            </Button>
          </div>
        )}
      </div>
      {q.isPending ? (
        <p className="pv-loading" role="status">
          Carregando provas…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon="agenda" title="Nenhuma prova ainda" description="Agende uma prova para registrar o que ela experimentou." />
      ) : (
        <ul className="pv-sessions" aria-label="Provas da cliente">
          {rows.map((r) => (
            <SessionItem key={r.id} row={r} />
          ))}
        </ul>
      )}
      <ScheduleFittingModal open={scheduling} onClose={() => setScheduling(false)} customerId={customerId} />
    </section>
  )
}

/** Uma sessão do histórico: código (link), data · evento, situação e as peças com o resultado (nota no tooltip). */
function SessionItem({ row: r, only }: { row: FittingHistoryRow; only?: boolean }) {
  const href = useAppHref()
  const { can } = usePermissions()
  const st = FITTING_STATE[r.state]
  const items = r.items.filter((i) => only || i.outcome !== 'nao_provou')
  return (
    <li className="pv-session">
      <div className="pv-session-h">
        <Link to={href(`/provas/${r.id}`)} className="mono pv-code">
          {r.code}
        </Link>
        <span className="muted">
          {dateBR(r.scheduledAt.slice(0, 10))}
          {r.eventType ? ` · ${r.eventType}` : ''}
          {only ? ` · ${r.customerName}` : ''}
        </span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {items.length > 0 && (
        <div className="pv-chips">
          {items.map((i) => {
            const text = only ? FIT_OUTCOME[i.outcome].label : `${i.garmentName} — ${FIT_OUTCOME[i.outcome].label}`
            return can('acervo.view') && !only ? (
              <Link key={i.garmentId} to={href(`/acervo/${i.garmentId}`)} className="chip" title={i.note ?? undefined}>
                {text}
              </Link>
            ) : (
              <span key={i.garmentId} className="chip" title={i.note ?? undefined}>
                {text}
                {i.note && <span className="tiny muted"> · “{i.note}”</span>}
              </span>
            )
          })}
        </div>
      )}
      {r.outcomeNotes && <p className="tiny muted">{r.outcomeNotes}</p>}
    </li>
  )
}

/** Aba Provas da ficha da peça: conversão (`fittingStatsOf`) e os últimos comentários das clientes. */
export function GarmentFittingsPane({ garment }: { garment: Garment }) {
  const q = useFittingStats(garment.id)
  const hist = useGarmentFittings(garment.id)
  const s = q.data
  return (
    <section className="card">
      <div className="card-h">
        <h3>Provas</h3>
        <span className="muted tiny">como a peça se sai quando é provada</span>
      </div>
      <div className="card-b pv-form">
        {!s ? (
          <p className="pv-loading" role="status">
            Carregando provas…
          </p>
        ) : s.fittings === 0 && (hist.data ?? []).length === 0 ? (
          <EmptyState icon="agenda" title="Nenhuma prova registrada" description="Quando a peça for separada numa prova, o resultado aparece aqui." />
        ) : (
          (
            <>
              <dl className="pv-stats">
                <Stat label="Provas" value={String(s.fittings)} />
                <Stat label="Viraram reserva" value={String(s.converted)} />
                <Stat label="Conversão" value={s.rate == null ? '—' : pct(s.rate)} />
                <Stat label="Favoritas" value={String(s.favorites)} />
                <Stat label="Descartes" value={String(s.discards)} />
                <Stat label="Ajustes" value={String(s.alterations)} />
              </dl>
              {s.rate != null && s.rate < 0.3 && s.fittings >= 4 && (
                <div className="note amber">
                  <span>
                    <b>Muito provada, pouco alugada.</b> Só {plural(s.converted, 'prova virou', 'provas viraram')} reserva em {s.fittings}.
                  </span>
                </div>
              )}
              {s.reasons.length > 0 && (
                <div>
                  <div className="eyebrow">O que as clientes disseram</div>
                  <ul className="pv-said">
                    {s.reasons.map((r, idx) => (
                      <li key={idx}>
                        <span className="tiny muted">{FIT_OUTCOME[r.outcome].label}</span>
                        <span className="mk" aria-hidden="true" />
                        <span className="t2">“{r.note}”</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(hist.data ?? []).length > 0 && (
                <div>
                  <div className="eyebrow">Sessões em que entrou</div>
                  <ul className="pv-sessions pv-sessions-in" aria-label="Provas da peça">
                    {hist.data!.map((r) => (
                      <SessionItem key={r.id} row={r} only />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )
        )}
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
