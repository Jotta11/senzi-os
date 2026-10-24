import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { useRecommendations } from '@/data/hooks'
import { brl } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Icon, Silhouette } from '@/ui'
import './customer.css'

export const RECS_EMPTY = 'Cadastre medidas ou preferências para receber sugestões.'

/**
 * "Sugestões para ela": até 8 peças do acervo com foto (ou silhueta na cor), código, nome, preço e os motivos.
 * As mutações da cliente (medidas, favoritos, cadastro) invalidam a consulta, então a lista se recalcula sozinha.
 */
export function Recommendations({ customerId }: { customerId: string }) {
  const recs = useRecommendations(customerId, 8)
  const href = useAppHref()
  const items = recs.data ?? []

  return (
    <section className="card" aria-labelledby="cp-recs-t">
      <div className="card-h">
        <h3 id="cp-recs-t">Sugestões para ela</h3>
        <span className="muted tiny cp-h-note">pelo tamanho, pelas cores e pelas peças de que ela gostou</span>
      </div>
      <div className="card-b">
        {!recs.data ? (
          <ul className="rc-grid" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="rc-card rc-skel" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="cp-empty-line">
            <Icon name="raio" size={14} />
            {RECS_EMPTY}
          </p>
        ) : (
          <ul className="rc-grid">
            {items.map(({ garment: g, reasons }) => {
              const cover = g.photos.find((p) => p.isCover) ?? g.photos[0]
              return (
                <li key={g.id}>
                  <Link to={href(`/acervo/${g.id}`)} className="rc-card" style={{ '--tint': g.colorHex || '#8C8C8C' } as CSSProperties}>
                    <span className="rc-ph">
                      {cover ? (
                        <img src={cover.url} alt="" loading="lazy" />
                      ) : (
                        <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />
                      )}
                    </span>
                    <span className="rc-meta">
                      <span className="rc-top">
                        <span className="rc-code mono">{g.code}</span>
                        <span className="rc-pr">{brl(g.rentalPrice, { cents: false })}</span>
                      </span>
                      <span className="rc-nm">{g.name}</span>
                      <span className="rc-why">
                        {reasons.map((r) => (
                          <span key={r}>{r}</span>
                        ))}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
