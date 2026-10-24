import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCustomer, useGarment, useSetFavorite, useSetNotePinned } from '@/data/hooks'
import { CHANNEL_LABEL, GARMENT_STATE, LEAD_SOURCE_LABEL, LENGTH_LABEL } from '@/data/labels'
import type { Customer, CustomerFavorite, CustomerMeasurement } from '@/data/types'
import { ageFrom, brl, dateBR, hideCPF, maskCPF, maskPhone, onlyDigits } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Badge, Button, EmptyState, Icon, Silhouette, Tabs, type TabItem } from '@/ui'
import { CustomerForm } from './CustomerForm'
import { initials } from './initials'
import { MeasureModal } from './MeasureModal'
import { NoteModal } from './NoteModal'
import { Recommendations } from './Recommendations'
import '../acervo/acervo.css'
import '../acervo/garment.css'
import './clientes.css'
import './customer.css'

type TabKey = 'memoria' | 'medidas' | 'favoritos'
type Dialog = 'note' | 'edit' | 'measure' | null

const dash = (s: string | null | undefined) => (s && s.trim() ? s : '—')
const cm = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cm`)
const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s
const list = (xs: string[]) => (xs.length ? xs.join(', ') : '—')
const money = (n: number) => brl(n, { cents: false })

/**
 * Ficha da cliente (protótipo `customerDetail`): cabeçalho `código · cliente desde`, cartão lateral com contato,
 * "Lembre-se ao atender" (observações fixadas), números, "Perfil Senzi", "Sugestões para ela" e as abas
 * Memória de atendimento, Medidas e Favoritos. A aba ativa fica na URL (`?aba=`).
 * Dinheiro só com `financeiro.view`; CPF completo só com `cliente.edit`.
 */
export function CustomerPage() {
  const { id } = useParams()
  const q = useCustomer(id)
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
            <Link to={href('/clientes')} className="gp-back">
              <Icon name="chevronL" size={13} /> Clientes
            </Link>
          </div>
        </header>
        <div className="ac-body">
          <section className="card">
            <EmptyState
              icon="clientes"
              title="Cliente não encontrada"
              description="O cadastro pode ter sido removido ou o link está incompleto."
              action={
                <Link to={href('/clientes')} className="btn">
                  Voltar às clientes
                </Link>
              }
            />
          </section>
        </div>
      </div>
    )
  }
  return <Ficha customer={q.data} />
}

function Ficha({ customer: c }: { customer: Customer }) {
  const { can } = usePermissions()
  const canEdit = can('cliente.edit')
  const canNote = can('cliente.note')
  const canMoney = can('financeiro.view')
  const href = useAppHref()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)

  const tabs: TabItem[] = [
    {
      key: 'memoria',
      label: <TabLabel n={c.interactions.length}>Memória de atendimento</TabLabel>,
      content: () => <MemoryPane customer={c} canNote={canNote} onAdd={() => setDialog('note')} />,
    },
    {
      key: 'medidas',
      label: <TabLabel n={c.measurements.length}>Medidas</TabLabel>,
      content: () => <MeasuresPane customer={c} canEdit={canEdit} onUpdate={() => setDialog('measure')} />,
    },
    {
      key: 'favoritos',
      label: <TabLabel n={c.favorites.length}>Favoritos</TabLabel>,
      content: () => <FavoritesPane customer={c} canEdit={canEdit} />,
    },
  ]
  const aba = params.get('aba')
  const selected = tabs.some((t) => t.key === aba) ? (aba as TabKey) : 'memoria'

  function selectTab(key: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (key === 'memoria') next.delete('aba')
        else next.set('aba', key)
        return next
      },
      { replace: true },
    )
  }

  const pinned = c.interactions.filter((i) => i.pinned)
  const ticket = c.stats.rentals ? c.stats.spent / c.stats.rentals : null
  const last = c.interactions[0]

  return (
    <div className="ac-page gp-page cp-page">
      <header className="ac-head gp-head">
        <div className="ac-title">
          <Link to={href('/clientes')} className="gp-back">
            <Icon name="chevronL" size={13} /> Clientes
          </Link>
          <h1 className="display">{c.fullName}</h1>
          <p className="ac-sub cp-sub">
            <span className="mono">{c.code}</span> · cliente desde {dateBR(c.createdAt)}
            {c.vip ? ' · VIP' : ''}
          </p>
        </div>
        <div className="ac-actions">
          {canNote && (
            <Button icon="editar" onClick={() => setDialog('note')}>
              Observação
            </Button>
          )}
          {canEdit && (
            <Button icon="clientes" onClick={() => setDialog('edit')}>
              Editar
            </Button>
          )}
        </div>
      </header>

      <div className="ac-body">
        <div className="gp-profile cp-profile">
          <div className="cp-side">
            <SideCard customer={c} canEdit={canEdit} />
            {pinned.length > 0 && (
              <section className="card cp-remember" aria-labelledby="cp-remember-t">
                <div className="card-h">
                  <Icon name="sino" size={14} />
                  <h3 id="cp-remember-t">Lembre-se ao atender</h3>
                </div>
                <ul className="cp-remember-b">
                  {pinned.map((i) => (
                    <li key={i.id}>
                      <p>{i.content}</p>
                      <span className="tiny muted">
                        {firstName(i.authorName)} · {dateBR(i.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="gp-main cp-main">
            <dl className="cp-tiles" aria-label="Números da cliente">
              <Tile label="Locações" value={String(c.stats.rentals)} sub={c.stats.rentals ? (c.stats.rentals === 1 ? 'locação realizada' : 'locações realizadas') : 'ainda sem locação'} />
              {canMoney && <Tile label="Total gasto" value={money(c.stats.spent)} sub="em locações realizadas" />}
              {canMoney && <Tile label="Ticket médio" value={ticket == null ? '—' : money(ticket)} sub={ticket == null ? 'ainda sem locação' : 'por locação'} />}
              <Tile
                label="Último contato"
                value={last ? dateBR(last.at).slice(0, 5) : '—'}
                sub={`${c.interactions.length} ${c.interactions.length === 1 ? 'registro' : 'registros'}`}
              />
            </dl>

            <ProfileCard customer={c} canMoney={canMoney} ticket={ticket} />
            <Recommendations customerId={c.id} />
            <Tabs label="Ficha da cliente" tabs={tabs} selected={selected} onSelect={selectTab} className="gp-tabs" />
          </div>
        </div>
      </div>

      <NoteModal open={dialog === 'note'} onClose={close} customer={c} />
      <MeasureModal open={dialog === 'measure'} onClose={close} customer={c} />
      {canEdit && <CustomerForm open={dialog === 'edit'} onClose={close} customer={c} />}
    </div>
  )
}

function TabLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <>
      {children}{' '}
      <span className="cp-tab-n" aria-hidden="true">
        {n}
      </span>
      <span className="sr-only">({n})</span>
    </>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd>
        <b className="display">{value}</b>
        <span className="tiny muted">{sub}</span>
      </dd>
    </div>
  )
}

/* ------------------------------------------------------------ cartão lateral */

function SideCard({ customer: c, canEdit }: { customer: Customer; canEdit: boolean }) {
  const href = useAppHref()
  const ideal = useGarment(c.idealGarmentId ?? undefined)
  const m = c.measurements[0]
  const age = ageFrom(c.birthDate)
  const place = [c.city, c.state, age != null ? `${age} anos` : null].filter(Boolean).join(' · ')
  const rentals = c.stats.rentals
  const phone = onlyDigits(c.phone)

  const rows: [string, ReactNode][] = [
    [
      'WhatsApp',
      phone ? (
        <a href={`https://wa.me/55${phone}`} target="_blank" rel="noopener noreferrer" className="cp-wa">
          {maskPhone(phone)}
          <span className="sr-only"> (abre o WhatsApp em nova aba)</span>
        </a>
      ) : (
        '—'
      ),
    ],
    ['Instagram', dash(c.instagram)],
    ['E-mail', c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'],
    ['Nascimento', c.birthDate ? dateBR(c.birthDate) : '—'],
    ['CPF', <span className="mono cp-cpf">{canEdit ? maskCPF(c.cpf) : hideCPF(c.cpf)}</span>],
    ['Origem', c.leadSource ? LEAD_SOURCE_LABEL[c.leadSource] : '—'],
    ['Tamanho', <b>{m?.usualSize ?? '—'}</b>],
    [
      'Modelo ideal',
      !c.idealGarmentId ? (
        '—'
      ) : ideal.data ? (
        <Link to={href(`/acervo/${ideal.data.id}`)}>
          {ideal.data.name} <span className="mono cp-code-sm">{ideal.data.code}</span>
        </Link>
      ) : ideal.isPending ? (
        '…'
      ) : (
        '—'
      ),
    ],
  ]

  return (
    <aside className="card cp-card" aria-label="Resumo da cliente">
      <div className="cp-who">
        <span className="cp-avatar" aria-hidden="true">
          {initials(c.fullName)}
        </span>
        <div className="cp-who-t">
          <span className="cp-who-n">{c.fullName}</span>
          {place && <span className="tiny muted">{place}</span>}
          <span className="cp-pills">
            {c.vip && <Badge tone="wine">VIP</Badge>}
            {rentals >= 2 ? <Badge tone="green">Recorrente</Badge> : <Badge tone="stone">{rentals === 1 ? '1ª locação' : 'Sem locação'}</Badge>}
          </span>
        </div>
      </div>
      <dl className="gp-kv cp-kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {c.stats.nextEvent && (
        <div className="note info">
          <Icon name="agenda" size={15} />
          <span>
            <b>Próximo evento:</b> {dateBR(c.stats.nextEvent)}
          </span>
        </div>
      )}
    </aside>
  )
}

/* ----------------------------------------------------------- perfil senzi */

function lengthsOf(c: Customer, m: CustomerMeasurement | undefined): string {
  const ls = c.preferences.preferredLengths.length ? c.preferences.preferredLengths : m?.preferredLength ? [m.preferredLength] : []
  return list(ls.map((l) => LENGTH_LABEL[l]))
}

function ProfileCard({ customer: c, canMoney, ticket }: { customer: Customer; canMoney: boolean; ticket: number | null }) {
  const m = c.measurements[0]
  const p = c.preferences
  const trio = m && (m.bustCm != null || m.waistCm != null || m.hipCm != null) ? [m.bustCm, m.waistCm, m.hipCm].map((n) => n ?? '—').join(' / ') : '—'
  const cols: [string, ReactNode][][] = [
    [
      ['Tamanho usual', <b>{m?.usualSize ?? '—'}</b>],
      ['Medidas', trio],
      ['Altura', cm(m?.heightCm)],
      ['Comprimento', lengthsOf(c, m)],
    ],
    [
      ['Cores que ama', list(p.preferredColors)],
      ['Cores que evita', list(p.avoidedColors)],
      ['Manga', dash(p.sleeve)],
      ['Decote', dash(p.neckline)],
    ],
    [
      ['Locações', String(c.stats.rentals)],
      ...(canMoney
        ? ([
            ['Ticket médio', ticket == null ? '—' : money(ticket)],
            ['Total gasto', money(c.stats.spent)],
            ['Orçamento', ticket == null ? '—' : `até ${money(ticket)}`],
          ] as [string, ReactNode][])
        : []),
      ['Próximo evento', c.stats.nextEvent ? dateBR(c.stats.nextEvent) : '—'],
    ],
  ]
  return (
    <section className="card" aria-labelledby="cp-profile-t">
      <div className="card-h">
        <h3 id="cp-profile-t">Perfil Senzi</h3>
        <span className="muted tiny cp-h-note">tudo o que a equipe sabe sobre ela, em uma tela</span>
      </div>
      <div className="card-b cp-profile-b">
        <div className="cp-cols">
          {cols.map((rows, i) => (
            <dl key={i} className="gp-kv cp-kv-p">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
        {c.favorites.length > 0 && (
          <div>
            <div className="eyebrow cp-eyebrow">Peças favoritas</div>
            <div className="chips">
              {c.favorites.map((f) => (
                <FavChip key={f.garmentId} garmentId={f.garmentId} />
              ))}
            </div>
          </div>
        )}
        {c.notes && (
          <div className="note info">
            <Icon name="doc" size={15} />
            <span>
              <b>Observações do cadastro.</b> {c.notes}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function FavChip({ garmentId }: { garmentId: string }) {
  const g = useGarment(garmentId)
  const href = useAppHref()
  if (!g.data) return null
  return (
    <Link to={href(`/acervo/${g.data.id}`)} className="chip cp-fav-chip">
      <Icon name="coracao" size={12} />
      {g.data.name} <span className="mono cp-code-sm">{g.data.code}</span>
    </Link>
  )
}

/* -------------------------------------------------- memória de atendimento */

function MemoryPane({ customer: c, canNote, onAdd }: { customer: Customer; canNote: boolean; onAdd(): void }) {
  const pin = useSetNotePinned(c.id)
  return (
    <section className="card">
      <div className="card-h">
        <h3>Memória de atendimento</h3>
        <span className="muted tiny cp-h-note">o que qualquer atendente precisa saber antes de receber esta cliente</span>
        {canNote && (
          <div className="actions">
            <Button size="sm" icon="plus" onClick={onAdd}>
              Registrar
            </Button>
          </div>
        )}
      </div>
      <div className="card-b">
        {c.interactions.length === 0 ? (
          <EmptyState icon="editar" title="Nenhuma observação ainda" description="Registre aqui o que a equipe aprendeu sobre esta cliente." />
        ) : (
          <ol className="gp-tline cp-tline">
            {c.interactions.map((i) => (
              <li key={i.id} className={i.pinned ? 'ev is-pinned' : 'ev'}>
                <span className="dt">{dateBR(i.at)}</span>
                <span className="ln" aria-hidden="true">
                  <i />
                </span>
                <span className="bd">
                  <span className="t2">{i.content}</span>
                  <span className="n2">
                    {firstName(i.authorName)} · {CHANNEL_LABEL[i.channel]}
                    {i.pinned && (
                      <>
                        {' · '}
                        <b className="cp-pinned">fixada</b>
                      </>
                    )}
                    {canNote && (
                      <button type="button" className="cp-link-btn" disabled={pin.isPending} onClick={() => pin.mutate({ noteId: i.id, pinned: !i.pinned })}>
                        {i.pinned ? 'Desafixar' : 'Fixar'}
                      </button>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ medidas */

function MeasuresPane({ customer: c, canEdit, onUpdate }: { customer: Customer; canEdit: boolean; onUpdate(): void }) {
  const m = c.measurements[0]
  const p = c.preferences
  const cells: [string, string][] = [
    ['Tamanho usual', m?.usualSize ?? '—'],
    ['Busto', cm(m?.bustCm)],
    ['Cintura', cm(m?.waistCm)],
    ['Quadril', cm(m?.hipCm)],
    ['Altura', cm(m?.heightCm)],
    ['Ombro', cm(m?.shoulderCm)],
    ['Comprimento', m?.preferredLength ? LENGTH_LABEL[m.preferredLength] : '—'],
    ['Calçado', dash(m?.shoeSize)],
  ]
  return (
    <section className="card">
      <div className="card-h">
        <h3>Perfil corporal</h3>
        <span className="muted tiny cp-h-note">{m ? `medido em ${dateBR(m.measuredAt)}` : 'sem medidas registradas'}</span>
        {canEdit && (
          <div className="actions">
            <Button size="sm" icon="regua" onClick={onUpdate}>
              Atualizar
            </Button>
          </div>
        )}
      </div>
      <div className="card-b cp-stack">
        <dl className="gp-measures">
          {cells.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={v === '—' ? 'muted' : undefined}>{v}</dd>
            </div>
          ))}
        </dl>

        {c.measurements.length > 0 && (
          <div>
            <div className="spread cp-sec-h">
              <span className="eyebrow">Histórico de medidas</span>
              <span className="tiny muted">nenhuma versão é sobrescrita</span>
            </div>
            <div className="dt-wrap gp-tbl">
              <table className="dt cp-hist">
                <caption className="sr-only">Histórico de medidas</caption>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tamanho</th>
                    <th className="al-right">Busto</th>
                    <th className="al-right">Cintura</th>
                    <th className="al-right">Quadril</th>
                    <th className="al-right">Altura</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {c.measurements.map((v, idx) => (
                    <tr key={`${v.measuredAt}-${idx}`}>
                      <td className="mono cp-hist-d">
                        {dateBR(v.measuredAt)}
                        {idx === 0 && <span className="cp-current">atual</span>}
                      </td>
                      <td>{v.usualSize ?? '—'}</td>
                      <td className="al-right">{v.bustCm ?? '—'}</td>
                      <td className="al-right">{v.waistCm ?? '—'}</td>
                      <td className="al-right">{v.hipCm ?? '—'}</td>
                      <td className="al-right">{v.heightCm ?? '—'}</td>
                      <td className="cp-hist-o">
                        {v.source === 'modelo_ideal' ? 'Modelo ideal' : 'Fita métrica'}
                        {(v.measuredBy || v.notes) && (
                          <span className="tiny muted">{[v.measuredBy && firstName(v.measuredBy), v.notes].filter(Boolean).join(' · ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <div className="eyebrow cp-eyebrow">Preferências declaradas</div>
          <div className="gp-two">
            <dl className="gp-kv cp-kv-p">
              <div>
                <dt>Cores preferidas</dt>
                <dd>{list(p.preferredColors)}</dd>
              </div>
              <div>
                <dt>Cores evitadas</dt>
                <dd>{list(p.avoidedColors)}</dd>
              </div>
              <div>
                <dt>Comprimentos</dt>
                <dd>{list(p.preferredLengths.map((l) => LENGTH_LABEL[l]))}</dd>
              </div>
            </dl>
            <dl className="gp-kv cp-kv-p">
              <div>
                <dt>Manga</dt>
                <dd>{dash(p.sleeve)}</dd>
              </div>
              <div>
                <dt>Decote</dt>
                <dd>{dash(p.neckline)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- favoritos */

function FavoritesPane({ customer: c, canEdit }: { customer: Customer; canEdit: boolean }) {
  return (
    <section className="card">
      <div className="card-h">
        <h3>Favoritos</h3>
        <span className="muted tiny cp-h-note">peças que ela amou, mesmo sem ter levado</span>
      </div>
      <div className="card-b">
        {c.favorites.length === 0 ? (
          <EmptyState icon="coracao" title="Nenhum favorito ainda" description="Os favoritos são marcados durante as provas." />
        ) : (
          <ul className="cp-favs">
            {c.favorites.map((f) => (
              <li key={f.garmentId}>
                <FavoriteCard customerId={c.id} fav={f} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function FavoriteCard({ customerId, fav, canEdit }: { customerId: string; fav: CustomerFavorite; canEdit: boolean }) {
  const g = useGarment(fav.garmentId)
  const href = useAppHref()
  const setFav = useSetFavorite(customerId)
  if (!g.data) return <article className="gcard gc-skel cp-fav" aria-hidden="true" />
  const st = GARMENT_STATE[g.data.state]
  const cover = g.data.photos.find((p) => p.isCover) ?? g.data.photos[0]
  return (
    <article className="gcard cp-fav" style={{ '--tint': g.data.colorHex || '#8C8C8C' } as CSSProperties}>
      <Link to={href(`/acervo/${g.data.id}`)} className="cp-fav-link">
        <span className="gc-ph">
          {cover ? (
            <img src={cover.url} alt="" loading="lazy" />
          ) : (
            <Silhouette categorySlug={g.data.categorySlug} style={g.data.style} length={g.data.length} colorHex={g.data.colorHex} />
          )}
          <span className="gc-pill">
            <Badge tone={st.tone}>
              <span aria-hidden="true">{st.short}</span>
              <span className="sr-only">{st.label}</span>
            </Badge>
          </span>
        </span>
        <span className="gc-meta">
          <span className="gc-code mono">{g.data.code}</span>
          <span className="gc-nm">{g.data.name}</span>
          <span className="gc-ln">
            <i className="gc-sw" aria-hidden="true" />
            {g.data.colorPrimary} · tam. {g.data.labelSize}
          </span>
          <span className="gc-pr">{money(g.data.rentalPrice)}</span>
        </span>
      </Link>
      <div className="cp-fav-f">
        <span className="tiny muted">
          {fav.source === 'prova' ? 'marcada na prova' : 'marcada no atendimento'} · {dateBR(fav.at)}
        </span>
        {fav.note && <span className="cp-fav-q">“{fav.note}”</span>}
        {canEdit && (
          <Button
            size="sm"
            variant="ghost"
            icon="x"
            className="cp-fav-rm"
            disabled={setFav.isPending}
            aria-label={`Remover ${g.data.name} dos favoritos`}
            onClick={() => setFav.mutate({ garmentId: fav.garmentId, on: false })}
          >
            Remover
          </Button>
        )}
      </div>
    </article>
  )
}
