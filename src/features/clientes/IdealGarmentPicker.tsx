import { useState, type CSSProperties } from 'react'
import { useGarment, useGarmentSearch, useIdealMeasurements } from '@/data/hooks'
import { LENGTH_LABEL } from '@/data/labels'
import type { Garment, IdealMeasurements } from '@/data/types'
import { Button, Icon, SearchInput, Silhouette } from '@/ui'

/** Quantas peças a busca do modelo ideal mostra de cada vez. */
export const PICKER_LIMIT = 8

export type IdealGarmentPickerProps = {
  /** Peça escolhida (id) ou nada. */
  value: string | null
  onChange(garmentId: string | null): void
  /** "Usar medidas desta peça": medidas sugeridas da peça, para o formulário preencher o perfil corporal. */
  onUseMeasurements(m: IdealMeasurements, garment: Garment): void
  /** Medidas já aplicadas a partir da peça atual (mostra a confirmação). */
  applied?: boolean
}

const sizeLine = (g: Garment) => `tam. ${g.labelSize} (${g.sizeEquiv})`

/**
 * Modelo ideal: a peça do acervo que vestiu perfeitamente na cliente. Busca pelo acervo (mesma busca da tela de
 * Acervo, via `searchGarments`), cards pequenos com silhueta/código/nome/tamanho; escolhida, mostra o card da
 * peça e "Usar medidas desta peça" (`idealMeasurements`).
 */
export function IdealGarmentPicker({ value, onChange, onUseMeasurements, applied }: IdealGarmentPickerProps) {
  const chosen = useGarment(value ?? undefined)
  const ideal = useIdealMeasurements(value ?? undefined)

  if (value) {
    const g = chosen.data
    return (
      <section className="ig-chosen" aria-label="Peça escolhida">
        {g ? (
          <>
            <span className="ig-ph" style={{ '--tint': g.colorHex } as CSSProperties}>
              <GarmentThumb g={g} />
            </span>
            <span className="ig-info">
              <span className="mono ig-code">{g.code}</span>
              <span className="ig-nm">{g.name}</span>
              <span className="ig-ln">
                <i className="gc-sw" style={{ '--tint': g.colorHex } as CSSProperties} aria-hidden="true" />
                {g.colorPrimary} · {sizeLine(g)} · {LENGTH_LABEL[g.length]}
              </span>
              {applied && (
                <span className="ig-applied" role="status">
                  <Icon name="check" size={13} /> Medidas preenchidas a partir desta peça
                </span>
              )}
            </span>
            <span className="ig-actions">
              <Button variant="primary" size="sm" icon="regua" disabled={!ideal.data} onClick={() => ideal.data && onUseMeasurements(ideal.data, g)}>
                Usar medidas desta peça
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Trocar peça
              </Button>
            </span>
          </>
        ) : chosen.data === null ? (
          <span className="ig-missing">
            Peça não encontrada no acervo.{' '}
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Escolher outra
            </Button>
          </span>
        ) : (
          <span className="ig-loading" aria-hidden="true" />
        )}
      </section>
    )
  }
  return <GarmentSearch onPick={(g) => onChange(g.id)} />
}

function GarmentThumb({ g }: { g: Garment }) {
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  return cover ? <img src={cover.url} alt="" /> : <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />
}

function GarmentSearch({ onPick }: { onPick(g: Garment): void }) {
  const [q, setQ] = useState('')
  const search = useGarmentSearch({ q: q || undefined }, { limit: PICKER_LIMIT, offset: 0 })
  const items = search.data?.items ?? []
  const total = search.data?.total ?? 0
  return (
    <div className="ig-search">
      <SearchInput value={q} onChange={(v) => setQ(v.trim())} label="Buscar peça do acervo" placeholder="Código, nome, cor ou tecido da peça que vestiu bem nela…" />
      {search.data && items.length === 0 ? (
        <p className="ig-empty muted">Nenhuma peça encontrada para “{q}”.</p>
      ) : (
        <ul className="ig-grid" aria-label="Peças do acervo" aria-busy={!search.data}>
          {(search.data ? items : Array.from({ length: 4 }, () => null)).map((g, i) =>
            g ? (
              <li key={g.id}>
                <button type="button" className="ig-card" onClick={() => onPick(g)} aria-label={`${g.code} · ${g.name} · ${sizeLine(g)}`}>
                  <span className="ig-ph" style={{ '--tint': g.colorHex } as CSSProperties}>
                    <GarmentThumb g={g} />
                  </span>
                  <span className="ig-card-m">
                    <span className="mono ig-code">{g.code}</span>
                    <span className="ig-nm">{g.name}</span>
                    <span className="ig-sz">{sizeLine(g)}</span>
                  </span>
                </button>
              </li>
            ) : (
              <li key={i} className="ig-card ig-skel" aria-hidden="true" />
            ),
          )}
        </ul>
      )}
      {total > items.length && <p className="ig-more muted tiny">Mostrando {items.length} de {total} — refine a busca para achar a peça.</p>}
    </div>
  )
}
