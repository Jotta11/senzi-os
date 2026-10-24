import { useState } from 'react'
import { usePermissions } from '@/auth/usePermissions'
import { useReleaseBlock } from '@/data/hooks'
import { BLOCK_KIND } from '@/data/labels'
import type { BlockKind, Garment, GarmentBlock } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { addDays, dateBR, todayISO } from '@/lib/format'
import { Badge, Button, DataTable, Icon, type Column } from '@/ui'

/** Rótulo curto dentro da célula do calendário (protótipo `SZ.BLOCK_KIND[k].tag`). */
const BLOCK_TAG: Record<BlockKind, string> = {
  locacao: 'LOC',
  higienizacao: 'HIG',
  inspecao: 'INSP',
  ajuste: 'AJU',
  manutencao: 'MAN',
  bloqueio_manual: 'BLQ',
  editorial: 'EDIT',
}

const STRIP_DAYS = 45
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })

type Month = { y: number; m: number } // m 0–11

const monthOf = (iso: string): Month => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 })
const shift = ({ y, m }: Month, n: number): Month => {
  const t = y * 12 + m + n
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const blockOn = (blocks: GarmentBlock[], day: string) => blocks.find((b) => b.from <= day && day <= b.to)

function MonthGrid({ month, blocks, today }: { month: Month; blocks: GarmentBlock[]; today: string }) {
  const first = new Date(Date.UTC(month.y, month.m, 1))
  const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate()
  const pad = first.getUTCDay()
  const name = monthName.format(first)
  return (
    <div className="gp-month">
      <div className="eyebrow gp-month-t">
        {name} {month.y}
      </div>
      <div className="gp-cal">
        {DOW.map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <div key={`p${i}`} className="d pad" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = iso(month.y, month.m, i + 1)
          const b = blockOn(blocks, day)
          const tone = b ? BLOCK_KIND[b.kind].tone : day < today ? undefined : 'green'
          return (
            <div key={day} className={day === today ? 'd today' : 'd'} data-tone={tone} title={`${dateBR(day)} — ${b ? BLOCK_KIND[b.kind].label : day < today ? 'Passado' : 'Disponível'}`}>
              <span className="n">{i + 1}</span>
              {b && <span className="tag">{BLOCK_TAG[b.kind]}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Calendário da peça (protótipo `calendarPane`): faixa "Próximos 45 dias", dois meses navegáveis, legenda e a
 * tabela "Compromissos futuros" — com "Remover" para bloqueio manual (`acervo.block`).
 */
export function CalendarPane({ garment: g }: { garment: Garment }) {
  const { can } = usePermissions()
  const today = todayISO()
  const [anchor, setAnchor] = useState<Month>(() => monthOf(today))
  const release = useReleaseBlock(g.id)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const day = addDays(today, i)
    const b = blockOn(g.blocks, day)
    return { day, tone: b ? BLOCK_KIND[b.kind].tone : 'green', label: b ? BLOCK_KIND[b.kind].label : 'Disponível' }
  })
  const busy = strip.filter((s) => s.label !== 'Disponível').length
  const used = [...new Set(g.blocks.map((b) => b.kind))]
  const future = g.blocks.filter((b) => b.to >= today).sort((a, b) => a.from.localeCompare(b.from))

  const columns: Column<GarmentBlock>[] = [
    { key: 'period', header: 'Período', className: 'mono gp-td-period', render: (b) => `${dateBR(b.from)} – ${dateBR(b.to)}` },
    { key: 'kind', header: 'Tipo', render: (b) => <Badge tone={BLOCK_KIND[b.kind].tone}>{BLOCK_KIND[b.kind].label}</Badge> },
    { key: 'ref', header: 'Referência', className: 'gp-td-ref', render: (b) => b.note || '—' },
    {
      key: 'act',
      header: <span className="sr-only">Ações</span>,
      align: 'right',
      render: (b) =>
        b.kind === 'bloqueio_manual' && can('acervo.block') ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remover bloqueio de ${dateBR(b.from)} a ${dateBR(b.to)}`}
            disabled={release.isPending}
            onClick={() => {
              setReleaseError(null)
              release.mutate(b.id, { onError: (e) => setReleaseError(errorMessage(e)) })
            }}
          >
            Remover
          </Button>
        ) : null,
    },
  ]

  return (
    <section className="card">
      <div className="card-h">
        <h3>Calendário da peça</h3>
        <span className="muted tiny gp-h-note">a disponibilidade é lida daqui, não de um campo de status</span>
        <div className="actions">
          <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => setAnchor((a) => shift(a, -1))}>
            <Icon name="chevronL" size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => setAnchor((a) => shift(a, 1))}>
            <Icon name="chevron" size={15} />
          </button>
        </div>
      </div>
      <div className="card-b gp-cal-b">
        <div>
          <div className="spread gp-strip-h">
            <span className="eyebrow">Próximos 45 dias</span>
            <span className="tiny muted">{busy === 0 ? 'livre em todo o período' : `${STRIP_DAYS - busy} de ${STRIP_DAYS} dias livres`}</span>
          </div>
          <div className="gp-strip" aria-hidden="true">
            {strip.map((s) => (
              <span key={s.day} className="s" data-tone={s.tone} title={`${dateBR(s.day)} — ${s.label}`} />
            ))}
          </div>
          <div className="spread gp-strip-f" aria-hidden="true">
            <span className="tiny muted">{dateBR(strip[0]!.day).slice(0, 5)}</span>
            <span className="tiny muted">{dateBR(strip[STRIP_DAYS - 1]!.day).slice(0, 5)}</span>
          </div>
        </div>

        <div className="gp-months" aria-hidden="true">
          <MonthGrid month={anchor} blocks={g.blocks} today={today} />
          <MonthGrid month={shift(anchor, 1)} blocks={g.blocks} today={today} />
        </div>

        <div className="gp-legend" aria-hidden="true">
          <span>
            <i data-tone="green" />
            Disponível
          </span>
          {used.map((k) => (
            <span key={k}>
              <i data-tone={BLOCK_KIND[k].tone} />
              {BLOCK_KIND[k].label}
            </span>
          ))}
        </div>

        <div>
          <div className="eyebrow gp-sec-t">Compromissos futuros</div>
          {releaseError && (
            <div className="note red" role="alert">
              {releaseError}
            </div>
          )}
          {future.length ? (
            <div className="gp-tbl">
              <DataTable caption="Compromissos futuros" columns={columns} rows={future} rowKey={(b) => b.id} />
            </div>
          ) : (
            <p className="muted gp-none">Nenhum compromisso futuro — a peça está livre para reservas.</p>
          )}
        </div>
      </div>
    </section>
  )
}
