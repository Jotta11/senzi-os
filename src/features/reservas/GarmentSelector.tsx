import { useMemo, useState } from 'react'
import { useGarmentSearch } from '@/data/hooks'
import { useAlternatives, useAvailability } from '@/data/hooks-reservas'
import type { AvailabilityResult, Garment, SizeEquiv } from '@/data/types'
import { brl, dateBR } from '@/lib/format'
import { Icon, SearchInput, Silhouette } from '@/ui'

export type GarmentSelectorProps = {
  /** Peças escolhidas (objetos completos, na ordem em que entraram). */
  selected: Garment[]
  onToggle(g: Garment): void
  /** Troca uma peça escolhida por uma alternativa. */
  onSwap(fromId: string, to: Garment): void
  pickup: string
  returnDue: string
  /** Tamanho usual da cliente: filtra a lista quando não há busca. */
  customerSize?: SizeEquiv | null
  /** Rascunho em edição: o próprio rascunho não conta como conflito. */
  ignoreReservationId?: string
}

const d2 = (iso: string) => dateBR(iso).slice(0, 5)
const span = (from: string, to: string) => `${d2(from)} – ${d2(to)}`
/** Impede confirmar: peça baixada/inexistente ou bloco ativo (outro rascunho é só aviso). */
const hard = (a: AvailabilityResult) => !!a.reason || a.conflicts.some((c) => !c.draft)

/**
 * Busca de peças com pílulas de disponibilidade no período e faixa âmbar com alternativas para as escolhidas em
 * conflito. Conflito é aviso: a peça pode ser escolhida mesmo assim. Reaproveitado por "Adicionar peça".
 */
export function GarmentSelector({ selected, onToggle, onSwap, pickup, returnDue, customerSize = null, ignoreReservationId }: GarmentSelectorProps) {
  const [q, setQ] = useState('')
  const term = q.trim()
  const size = !term && customerSize ? customerSize : null
  const search = useGarmentSearch({ q: term, size }, { limit: 80, offset: 0 })
  const chosen = useMemo(() => new Set(selected.map((g) => g.id)), [selected])

  const candidates = useMemo(() => {
    const found = (search.data?.items ?? []).filter((g) => !chosen.has(g.id))
    return [...selected, ...found.slice(0, 40)]
  }, [search.data, selected, chosen])
  const avail = useAvailability(
    candidates.map((g) => g.id),
    pickup,
    returnDue,
    ignoreReservationId,
  )
  const byId = useMemo(() => new Map((avail.data ?? []).map((a) => [a.garmentId, a])), [avail.data])
  const rows = useMemo(() => {
    const free = (g: Garment) => (byId.get(g.id) && !hard(byId.get(g.id)!) && !byId.get(g.id)!.conflicts.length ? 0 : 1)
    return [...candidates].sort((a, b) => free(a) - free(b) || a.code.localeCompare(b.code))
  }, [candidates, byId])

  const hint = term ? 'busca livre' : size ? `filtrado pelo tamanho ${size} da cliente` : 'todas as peças'
  const warned = selected.filter((g) => {
    const a = byId.get(g.id)
    return a && (a.reason || a.conflicts.length)
  })

  return (
    <div className="rs-sel">
      <div className="rs-sel-h">
        <span className="eyebrow">Peças</span>
        <span className="tiny muted">{hint}</span>
      </div>
      <SearchInput value="" onChange={setQ} label="Buscar peça" placeholder="Buscar peça por código, nome ou cor… (limpe para voltar ao tamanho da cliente)" delay={280} />

      {rows.length === 0 ? (
        <p className="rs-sel-empty" role="status">
          {search.isPending || search.isFetching ? 'Buscando…' : 'Nenhuma peça corresponde à busca.'}
        </p>
      ) : (
        <ul className="rs-sel-list" aria-label="Peças do acervo">
          {rows.map((g) => {
            const on = chosen.has(g.id)
            return (
              <li key={g.id}>
                <button type="button" className="rs-sel-row" aria-pressed={on} onClick={() => onToggle(g)}>
                  <Thumb garment={g} />
                  <span className="rs-sel-t">
                    <b>
                      {g.name} <span className="mono tiny muted">{g.code}</span>
                    </b>
                    <span className="tiny muted">
                      {g.colorPrimary} · tam. {g.labelSize} · {brl(g.rentalPrice, { cents: false })}
                    </span>
                  </span>
                  <Pill a={byId.get(g.id)} />
                  {on && <Icon name="check" size={15} className="rs-sel-check" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {warned.map((g) => (
        <ConflictBand key={g.id} garment={g} availability={byId.get(g.id)!} pickup={pickup} returnDue={returnDue} onSwap={(to) => onSwap(g.id, to)} />
      ))}
    </div>
  )
}

function Pill({ a }: { a: AvailabilityResult | undefined }) {
  if (!a) return <span className="rs-pill" aria-hidden="true" />
  if (a.reason) return <span className="rs-pill red">{a.reason}</span>
  const first = a.conflicts.find((c) => !c.draft)
  if (first) return <span className="rs-pill red">{`${first.label} ${span(first.from, first.to)}`}</span>
  const draft = a.conflicts[0]
  if (draft) return <span className="rs-pill amber">{`rascunho ${draft.reservationCode ?? ''} ${span(draft.from, draft.to)}`.replace('  ', ' ')}</span>
  return <span className="rs-pill green">livre no período</span>
}

/** Faixa âmbar: o que bloqueia a peça, a janela pedida e alternativas semelhantes livres (links que trocam a peça). */
function ConflictBand({ garment, availability: a, pickup, returnDue, onSwap }: { garment: Garment; availability: AvailabilityResult; pickup: string; returnDue: string; onSwap(g: Garment): void }) {
  const alts = useAlternatives(garment.id, pickup, returnDue)
  const list = (alts.data ?? []).slice(0, 4)
  const title = hard(a) ? 'não está disponível.' : 'tem outro rascunho no período.'
  const n = a.window.cleaningDays
  return (
    <div className="note amber rs-band" role="alert">
      <Icon name="alerta" size={15} />
      <div>
        <p>
          <b>
            {garment.name} ({garment.code}) {title}
          </b>{' '}
          {a.reason ??
            a.conflicts.map((c) => `${c.label} de ${span(c.from, c.to)}${c.reservationCode ? ` — reserva ${c.reservationCode}` : ''}.`).join(' ')}{' '}
          {`A janela pedida vai de ${d2(a.window.from)} a ${d2(a.window.to)}, já incluindo ${n} ${n === 1 ? 'dia' : 'dias'} de higienização.`}
        </p>
        <p className="rs-alts">
          {list.length ? (
            <>
              <b>Alternativas semelhantes livres:</b>{' '}
              {list.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ' · '}
                  <button type="button" className="rs-alt" onClick={() => onSwap(g)}>
                    {g.name} ({g.code})
                  </button>
                </span>
              ))}
            </>
          ) : alts.isPending ? (
            'Procurando alternativas…'
          ) : (
            'Não há peça semelhante livre nesse período.'
          )}
        </p>
      </div>
    </div>
  )
}

/** Miniatura da peça: foto de capa ou silhueta na cor dela. */
function Thumb({ garment: g }: { garment: Garment }) {
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  return (
    <span className="rs-thumb" aria-hidden="true">
      {cover ? <img src={cover.url} alt="" loading="lazy" /> : <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />}
    </span>
  )
}
