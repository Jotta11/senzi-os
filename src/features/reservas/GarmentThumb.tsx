import type { Garment } from '@/data/types'
import { Silhouette } from '@/ui'

/** Miniatura da peça: foto de capa ou silhueta na cor dela (ficha, retirada e impressões). */
export function GarmentThumb({ garment: g, small, className }: { garment: Garment; small?: boolean; className?: string }) {
  const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
  return (
    <span className={['rd-thumb', small && 'sm', className].filter(Boolean).join(' ')} aria-hidden="true">
      {cover ? <img src={cover.url} alt="" loading="lazy" /> : <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />}
    </span>
  )
}
