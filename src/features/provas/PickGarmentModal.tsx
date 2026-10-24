import { useMemo, useState } from 'react'
import { useGarmentSearch } from '@/data/hooks'
import { useFittingMutation } from '@/data/hooks-agenda'
import { GARMENT_STATE } from '@/data/labels'
import type { FittingDetail, Garment } from '@/data/types'
import { brl } from '@/lib/format'
import { Badge, Button, Icon, Modal, SearchInput, Silhouette } from '@/ui'

export type PickGarmentModalProps = { open: boolean; onClose(): void; detail: FittingDetail }

/**
 * Separar peça para a prova. A peça não fica bloqueada (prova não ocupa calendário): qualquer estado aparece.
 * Sem busca e com tamanho usual da cliente, filtra por esse tamanho; com busca, procura em todo o acervo.
 */
export function PickGarmentModal({ open, onClose, detail }: PickGarmentModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Separar peça para a prova"
      description={`${detail.session.code} · a peça não fica bloqueada — prova não ocupa calendário`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Concluir
        </Button>
      }
    >
      {open && <Picker detail={detail} />}
    </Modal>
  )
}

function Picker({ detail }: { detail: FittingDetail }) {
  const mutation = useFittingMutation(detail.session.id)
  const [q, setQ] = useState('')
  const usual = detail.customer.measurements[0]?.usualSize ?? null
  const term = q.trim()
  const size = !term && usual ? usual : null
  const search = useGarmentSearch({ q: term, size }, { limit: 60, offset: 0 })
  const taken = useMemo(() => new Set(detail.items.map((i) => i.garmentId)), [detail.items])
  const rows = useMemo(
    () =>
      (search.data?.items ?? [])
        .filter((g) => !taken.has(g.id))
        .sort((a, b) => a.code.localeCompare(b.code))
        .slice(0, 40),
    [search.data, taken],
  )
  const hint = term ? 'busca livre' : usual ? `filtrado pelo tamanho ${usual} da cliente` : 'todo o acervo'

  return (
    <div className="pv-form">
      <SearchInput value="" onChange={setQ} label="Buscar peça" placeholder="Buscar por código, nome ou cor…" />
      <p className="tiny muted">{hint}</p>
      {mutation.isError && (
        <div className="note red" role="alert">
          <Icon name="alerta" size={15} />
          <span>Não foi possível separar a peça. Tente de novo.</span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="pv-pick-empty">{search.isFetching ? 'Buscando…' : 'Nada encontrado.'}</p>
      ) : (
        <ul className="pv-pick" aria-label="Peças do acervo">
          {rows.map((g) => (
            <li key={g.id}>
              <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: 'add', garmentId: g.id })}>
                <Thumb garment={g} />
                <span className="pv-pick-t">
                  <b>
                    {g.name} <span className="mono tiny muted">{g.code}</span>
                  </b>
                  <span className="tiny muted">
                    {g.colorPrimary} · tam. {g.labelSize} · {brl(g.rentalPrice, { cents: false })}
                  </span>
                </span>
                <Badge tone={GARMENT_STATE[g.state].tone}>{GARMENT_STATE[g.state].label}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Miniatura da peça: foto de capa ou silhueta na cor dela. */
export function Thumb({ garment: g }: { garment: Garment }) {
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  return (
    <span className="pv-thumb" aria-hidden="true">
      {cover ? <img src={cover.url} alt="" loading="lazy" /> : <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />}
    </span>
  )
}
