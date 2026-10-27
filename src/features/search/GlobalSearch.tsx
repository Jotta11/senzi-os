import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useCustomers, useGarmentSearch } from '@/data/hooks'
import { useReservations } from '@/data/hooks-reservas'
import { GARMENT_STATE } from '@/data/labels'
import { RESERVATION_STATE } from '@/data/labels-ops'
import { normalize, onlyDigits } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Icon, Modal, type IconName } from '@/ui'
import './search.css'

const PER_GROUP = 5
const ALL_RESERVATIONS = { limit: 1000, offset: 0 }

type Hit = { key: string; group: string; icon: IconName; title: string; sub: string; to: string }

/**
 * Busca global: clientes (nome, telefone, código), peças (código, nome, cor) e reservas (código, cliente, peça).
 * Cada grupo só aparece para quem pode ver a área. ↑↓ navegam, Enter abre.
 */
export function GlobalSearch({ onClose }: { onClose(): void }) {
  const { can } = usePermissions()
  const href = useAppHref()
  const navigate = useNavigate()
  const listId = useId()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 200)
    return () => clearTimeout(t)
  }, [text])

  const searching = q.length >= 2
  const customers = useCustomers(searching && can('cliente.view') ? q : '', 'nome', { limit: PER_GROUP, offset: 0 })
  const garments = useGarmentSearch({ q: searching && can('acervo.view') ? q : '' }, { limit: PER_GROUP, offset: 0 })
  const reservations = useReservations('todas', ALL_RESERVATIONS)

  const hits = useMemo<Hit[]>(() => {
    if (!searching) return []
    const out: Hit[] = []
    if (can('cliente.view'))
      for (const c of customers.data?.items ?? [])
        out.push({ key: `c-${c.id}`, group: 'Clientes', icon: 'clientes', title: c.fullName, sub: [c.code, c.phone, c.city].filter(Boolean).join(' · '), to: `/clientes/${c.id}` })
    if (can('acervo.view'))
      for (const g of garments.data?.items ?? [])
        out.push({ key: `g-${g.id}`, group: 'Peças', icon: 'acervo', title: g.name, sub: `${g.code} · ${g.colorPrimary} · ${GARMENT_STATE[g.state].label}`, to: `/acervo/${g.id}` })
    if (can('reserva.view')) {
      const term = normalize(q)
      const digits = onlyDigits(q)
      const rows = (reservations.data?.items ?? []).filter((r) => {
        const hay = normalize([r.code, r.customerName, r.eventType, ...r.garments.flatMap((g) => [g.code, g.shortName])].join(' '))
        return hay.includes(term) || (digits.length >= 3 && onlyDigits(r.code).includes(digits))
      })
      for (const r of rows.slice(0, PER_GROUP))
        out.push({
          key: `r-${r.id}`,
          group: 'Reservas',
          icon: 'reservas',
          title: `${r.code} · ${r.customerName}`,
          sub: `${RESERVATION_STATE[r.state].label} · ${r.garments.map((g) => g.code).join(', ')}`,
          to: `/reservas/${r.id}`,
        })
    }
    return out
  }, [searching, q, can, customers.data, garments.data, reservations.data])

  const idx = Math.min(active, Math.max(0, hits.length - 1))
  const loading = searching && (customers.isFetching || garments.isFetching || reservations.isPending)

  function go(h: Hit) {
    onClose()
    navigate(href(h.to))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && hits.length) {
      e.preventDefault()
      setActive((idx + 1) % hits.length)
    } else if (e.key === 'ArrowUp' && hits.length) {
      e.preventDefault()
      setActive((idx - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter' && hits[idx]) {
      e.preventDefault()
      go(hits[idx])
    }
  }

  const optId = (i: number) => `${listId}-${i}`

  return (
    <Modal open onClose={onClose} size="md" title="Buscar" description="Clientes, peças e reservas">
      <div className="gs">
        <label className="gs-input">
          <Icon name="busca" size={16} />
          <input
            type="search"
            aria-label="Buscar clientes, peças e reservas"
            placeholder="Nome, telefone, código da peça ou da reserva…"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={hits.length ? optId(idx) : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        <ul id={listId} role="listbox" aria-label="Resultados" className="gs-list">
          {hits.map((h, i) => (
            <li key={h.key} role="presentation">
              {(i === 0 || hits[i - 1]!.group !== h.group) && <span className="eyebrow gs-group">{h.group}</span>}
              <div
                id={optId(i)}
                role="option"
                aria-selected={i === idx}
                className="gs-opt"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
              >
                <Icon name={h.icon} size={15} />
                <span className="gs-txt">
                  <b>{h.title}</b>
                  <span className="tiny muted">{h.sub}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        {!searching ? (
          <p className="tiny muted gs-empty">Digite pelo menos 2 letras. Atalho: ⌘K (Ctrl+K no Windows).</p>
        ) : loading && !hits.length ? (
          <p className="tiny muted gs-empty">Buscando…</p>
        ) : !hits.length ? (
          <p className="tiny muted gs-empty">Nada encontrado para “{q}”.</p>
        ) : null}
      </div>
    </Modal>
  )
}
