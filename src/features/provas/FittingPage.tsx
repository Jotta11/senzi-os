import { useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/auth/usePermissions'
import { useSetFavorite } from '@/data/hooks'
import { agendaKeys, useFitting, useFittingMutation } from '@/data/hooks-agenda'
import { LENGTH_LABEL } from '@/data/labels'
import { FIT_OUTCOME, FITTING_STATE } from '@/data/labels-ops'
import type { FittingDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl, dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, buttonClass, Card, EmptyState, Icon, useToast } from '@/ui'
import { initials } from '../clientes/initials'
import { CloseFittingModal } from './CloseFittingModal'
import { FittingItemRow } from './FittingItemRow'
import { FittingNoteModal } from './FittingNoteModal'
import { plural, weekdayLong } from './fittingFormat'
import { PickGarmentModal } from './PickGarmentModal'
import '../acervo/acervo.css'
import '../acervo/garment.css'
import './provas.css'

type Item = FittingDetail['items'][number]
type Dialog = 'pick' | 'close' | null
const OPEN = ['agendada', 'em_curso']
const dash = (s: string | null | undefined) => (s && s.trim() ? s : '—')

/** Ficha da prova (`/provas/:id`): avisos por estado, barra lateral da cliente e as peças separadas com resultado. */
export function FittingPage() {
  const { id } = useParams()
  const q = useFitting(id)
  const href = useAppHref()
  if (q.isPending) {
    return (
      <div className="ac-page gp-page" aria-busy="true">
        <div className="gp-skel">
          <i />
          <i />
        </div>
      </div>
    )
  }
  if (!q.data) {
    return (
      <div className="ac-page gp-page">
        <header className="ac-head gp-head">
          <div className="ac-title">
            <Link to={href('/provas')} className="gp-back">
              <Icon name="chevronL" size={13} /> Provas
            </Link>
            <h1 className="display">Prova não encontrada</h1>
          </div>
        </header>
        <div className="ac-body">
          <Card>
            <EmptyState title="Prova não encontrada" description="Pode ter sido removida ou o link está incompleto." />
          </Card>
        </div>
      </div>
    )
  }
  return <Ficha detail={q.data} />
}

function Ficha({ detail }: { detail: FittingDetail }) {
  const { session: s, customer: c, items } = detail
  const { can } = usePermissions()
  const href = useAppHref()
  const qc = useQueryClient()
  const mutation = useFittingMutation(s.id)
  const setFav = useSetFavorite(c.id)
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [noteItem, setNoteItem] = useState<Item | null>(null)

  const open = OPEN.includes(s.state)
  const manage = open && can('prova.manage')
  const canPick = manage && can('acervo.view')
  const fail = (x: unknown) => toast({ title: 'Não foi possível salvar', description: errorMessage(x), tone: 'error' })
  const approved = items.filter((i) => FIT_OUTCOME[i.outcome].positive === true).length
  const withNotes = items.filter((i) => i.note)
  const date = s.scheduledAt.slice(0, 10)

  const toggleFav = (i: Item) =>
    setFav.mutate(
      { garmentId: i.garmentId, on: !i.favorite },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: agendaKeys.fitting(s.id) })
          toast({ title: i.favorite ? 'Removida dos favoritos' : 'Marcada como favorita', description: `${i.garment.code} · ${i.garment.name}` })
        },
        onError: fail,
      },
    )

  return (
    <div className="ac-page gp-page">
      <header className="ac-head gp-head">
        <div className="ac-title">
          <Link to={href('/provas')} className="gp-back">
            <Icon name="chevronL" size={13} /> Provas
          </Link>
          <h1 className="display">Prova {s.code}</h1>
          <p className="ac-sub pv-sub">
            {c.fullName} · {weekdayLong(date)} às {s.scheduledAt.slice(11, 16)}
          </p>
        </div>
        <div className="ac-actions">
          {manage && approved > 0 && can('reserva.create') && (
            <Link to={href(`/reservas?nova=1&prova=${s.id}`)} className={buttonClass('primary')}>
              <Icon name="plus" size={15} /> Gerar reserva
            </Link>
          )}
          {canPick && (
            <Button icon="acervo" onClick={() => setDialog('pick')}>
              Separar peça
            </Button>
          )}
          {manage && (
            <Button icon="check" onClick={() => setDialog('close')}>
              Encerrar prova
            </Button>
          )}
          {detail.reservation && can('reserva.view') && (
            <Link to={href(`/reservas/${detail.reservation.id}`)} className="btn">
              {detail.reservation.code}
            </Link>
          )}
        </div>
      </header>

      <div className="ac-body">
        <div className="pv-layout">
          <Side detail={detail} />
          <div className="pv-main">
            <Banner detail={detail} />
            <section className="card">
              <div className="card-h">
                <h3>Peças separadas</h3>
                <span className="muted tiny">
                  {plural(items.length, 'peça', 'peças')} · {plural(approved, 'aprovada', 'aprovadas')}
                </span>
                {canPick && (
                  <div className="actions">
                    <Button size="sm" icon="plus" onClick={() => setDialog('pick')}>
                      Separar
                    </Button>
                  </div>
                )}
              </div>
              {items.length === 0 ? (
                <EmptyState icon="acervo" title="Nenhuma peça separada" description="Separe as peças que a cliente vai experimentar." />
              ) : (
                <ul className="pv-items" aria-label="Peças separadas">
                  {items.map((i) => (
                    <FittingItemRow
                      key={i.garmentId}
                      item={i}
                      editable={manage}
                      busy={mutation.isPending}
                      onOutcome={(outcome) => mutation.mutate({ type: 'outcome', garmentId: i.garmentId, outcome, needsAlteration: outcome === 'precisa_ajuste' }, { onError: fail })}
                      onNote={() => setNoteItem(i)}
                      onRemove={() => mutation.mutate({ type: 'remove', garmentId: i.garmentId }, { onError: fail })}
                      onToggleFavorite={() => toggleFav(i)}
                    />
                  ))}
                </ul>
              )}
            </section>

            {withNotes.length > 0 && (
              <section className="card">
                <div className="card-h">
                  <h3>O que a cliente disse</h3>
                  <span className="muted tiny">alimenta a inteligência de compra</span>
                </div>
                <div className="card-b">
                  <ul className="pv-said">
                    {withNotes.map((i) => {
                      const o = FIT_OUTCOME[i.outcome]
                      return (
                        <li key={i.garmentId} style={{ '--mk': `var(--t-${o.tone})` } as CSSProperties}>
                          <span className="mono tiny muted">{i.garment.code}</span>
                          <span className="mk" aria-hidden="true" />
                          <span>
                            <span className="t2">{i.note}</span>
                            <span className="n2">
                              {i.garment.name} · {o.label}
                              {i.needsAlteration ? ' · precisa ajuste' : ''}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <PickGarmentModal open={dialog === 'pick'} onClose={() => setDialog(null)} detail={detail} />
      <CloseFittingModal open={dialog === 'close'} onClose={() => setDialog(null)} detail={detail} />
      <FittingNoteModal open={!!noteItem} onClose={() => setNoteItem(null)} code={s.code} fittingId={s.id} item={noteItem && (items.find((i) => i.garmentId === noteItem.garmentId) ?? null)} />
    </div>
  )
}

function Banner({ detail }: { detail: FittingDetail }) {
  const { session: s, reservation: r } = detail
  const href = useAppHref()
  const { can } = usePermissions()
  if (s.state === 'convertida' && r) {
    return (
      <div className="note green">
        <Icon name="check" size={15} />
        <span>
          <b>Prova convertida em reserva.</b>{' '}
          {can('reserva.view') ? <Link to={href(`/reservas/${r.id}`)}>{r.code}</Link> : r.code} — {r.customerName}, evento em {r.eventDate ? dateBR(r.eventDate) : '—'}.
        </span>
      </div>
    )
  }
  if (s.state === 'perdida') {
    return (
      <div className="note info">
        <Icon name="doc" size={15} />
        <span>
          <b>Prova encerrada sem conversão.</b> {s.outcomeNotes || 'Sem motivo registrado.'}
        </span>
      </div>
    )
  }
  if (s.state === 'no_show') {
    return (
      <div className="note red">
        <Icon name="alerta" size={15} />
        <span>
          <b>Cliente não compareceu.</b> {s.outcomeNotes}
        </span>
      </div>
    )
  }
  return null
}

function Side({ detail }: { detail: FittingDetail }) {
  const { session: s, customer: c } = detail
  const href = useAppHref()
  const { can } = usePermissions()
  const st = FITTING_STATE[s.state]
  const m = c.measurements[0]
  const p = c.preferences
  const trio = m && (m.bustCm != null || m.waistCm != null || m.hipCm != null) ? [m.bustCm, m.waistCm, m.hipCm].map((n) => n ?? '—').join(' / ') : '—'
  const place = [c.city, `tamanho ${m?.usualSize ?? '—'}`].filter(Boolean).join(' · ')
  const fit = [...p.preferredLengths.map((l) => LENGTH_LABEL[l]), p.sleeve ? `manga ${p.sleeve.toLocaleLowerCase('pt-BR')}` : null].filter(Boolean).join(', ')
  const pinned = c.interactions.filter((i) => i.pinned).slice(0, 2)
  const rows: [string, string][] = [
    ['Atendente', dash(detail.attendantName)],
    ['Evento', dash(s.eventType)],
    ['Data do evento', s.eventDate ? dateBR(s.eventDate) : '—'],
    ['Orçamento', s.budget ? `até ${brl(s.budget, { cents: false })}` : 'não informado'],
    ['Medidas', trio],
  ]
  return (
    <aside className="card pv-side" aria-label="Resumo da prova">
      <div className="pv-side-row">
        <span>Situação</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="pv-who">
        <span className="pv-avatar" aria-hidden="true">
          {initials(c.fullName)}
        </span>
        <div className="pv-who-t">
          {can('cliente.view') ? <Link to={href(`/clientes/${c.id}`)}>{c.fullName}</Link> : <b>{c.fullName}</b>}
          <span className="tiny muted">{place}</span>
        </div>
      </div>
      <dl className="gp-kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {(p.preferredColors.length > 0 || p.avoidedColors.length > 0) && (
        <div className="note info">
          <Icon name="coracao" size={15} />
          <span>
            {p.preferredColors.length > 0 && `Prefere ${p.preferredColors.join(', ').toLocaleLowerCase('pt-BR')}`}
            {p.preferredColors.length > 0 && p.avoidedColors.length > 0 && '; '}
            {p.avoidedColors.length > 0 && `evita ${p.avoidedColors.join(', ').toLocaleLowerCase('pt-BR')}`}.{fit && ` Modelagem ${fit}.`}
          </span>
        </div>
      )}
      {pinned.length > 0 && (
        <ul className="pv-pinned" aria-label="Observações fixadas da cliente">
          {pinned.map((i) => (
            <li key={i.id}>{i.content}</li>
          ))}
        </ul>
      )}
      {s.notes && (
        <div className="note info">
          <Icon name="editar" size={15} />
          <span>{s.notes}</span>
        </div>
      )}
    </aside>
  )
}
