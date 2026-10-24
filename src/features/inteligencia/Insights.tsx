import { Fragment, type ReactNode } from 'react'
import type { IntelInsight } from '@/data/types'
import { Card, Icon, type IconName } from '@/ui'
import { scrollToId, SECTIONS, sectionOf } from './intelShared'

/** Texto do insight: só `<b>` vira negrito; o resto é texto puro (nunca HTML injetado). */
function rich(html: string): ReactNode {
  return html.split(/(<b>.*?<\/b>)/g).map((part, i) =>
    part.startsWith('<b>') ? <b key={i}>{part.slice(3, -4)}</b> : <Fragment key={i}>{part}</Fragment>,
  )
}

/**
 * "Leitura do período" (antigo bloco "Inteligência de acervo"): frases acionáveis com ícone em tom e linha "porquê",
 * agrupadas pela seção de origem (na ordem das seções; dentro de cada uma, a ordem de geração). Cada frase leva ao card.
 */
export function Insights({ insights }: { insights: IntelInsight[] }) {
  const groups = SECTIONS.map((s) => ({ s, items: insights.filter((i) => i.group === s.group) })).filter((g) => g.items.length > 0)
  return (
    <Card
      id="leitura"
      className="in-read"
      title="Leitura do período"
      meta={<span className="muted tiny">inteligência de acervo · o que os dados operacionais dizem sobre a próxima compra</span>}
    >
      {groups.length === 0 ? (
        <p className="muted in-pad">Sem leituras para este período. Mude o período ou a categoria para ver mais.</p>
      ) : (
        <div className="in-read-grid">
          {groups.map(({ s, items }) => (
            <div key={s.group} className="in-read-g">
              <p className="in-read-h">{s.title}</p>
              <ul className="in-read-list">
                {items.map((i, k) => {
                  const target = i.ref ?? sectionOf(i.group).id
                  return (
                    <li key={`${i.id}-${k}`} className="in-ins">
                      <span className={`in-ins-ic ${i.tone}`} aria-hidden="true">
                        <Icon name={i.icon as IconName} size={15} />
                      </span>
                      <div className="in-ins-b">
                        <p className="in-ins-t">{rich(i.html)}</p>
                        <p className="in-ins-w">{i.why}</p>
                        <a
                          href={`#${target}`}
                          className="in-ins-go"
                          onClick={(e) => {
                            e.preventDefault()
                            scrollToId(target)
                          }}
                        >
                          Ver em {s.short} <Icon name="seta" size={12} />
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
