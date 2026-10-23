import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { GARMENT_STATE } from '@/data/labels'
import type { Garment } from '@/data/types'
import { brl } from '@/lib/format'
import { Badge, Silhouette } from '@/ui'

export type GarmentCardProps = {
  garment: Garment
  /** Destino do card (já com o prefixo do app/prévia). */
  to: string
}

/**
 * Card da galeria (protótipo `UI.gcard`): foto de capa ou silhueta na cor da peça sobre um painel
 * levemente tingido, pill de estado curto, código mono, nome, `cor · tam.` e preço da locação sem centavos.
 */
export function GarmentCard({ garment: g, to }: GarmentCardProps) {
  const st = GARMENT_STATE[g.state]
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  return (
    <Link to={to} className="gcard" style={{ '--tint': g.colorHex || '#8C8C8C' } as CSSProperties}>
      <span className="gc-ph">
        {cover ? (
          <img src={cover.url} alt="" loading="lazy" />
        ) : (
          <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />
        )}
        <span className="gc-pill">
          <Badge tone={st.tone}>
            <span aria-hidden="true">{st.short}</span>
            <span className="sr-only">{st.label}</span>
          </Badge>
        </span>
      </span>
      <span className="gc-meta">
        <span className="gc-code mono">{g.code}</span>
        <span className="gc-nm">{g.name}</span>
        <span className="gc-ln">
          <i className="gc-sw" aria-hidden="true" />
          {g.colorPrimary} · tam. {g.labelSize}
        </span>
        <span className="gc-pr">{brl(g.rentalPrice, { cents: false })}</span>
      </span>
    </Link>
  )
}
