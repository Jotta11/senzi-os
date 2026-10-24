/* Visuais novos da Inteligência (CSS/SVG próprios, sem dependências): dispersão pressão × ocupação, funil de prova
   e barra dividida. Como os gráficos do Financeiro, cada valor também existe como texto. */
import { num1, OCC_SHORT, OCC_WARN, occZone, pct1 } from './intelShared'

export type ScatterPoint = { key: string; pressure: number; occupancy: number }

/** Dispersão: ocupação no eixo X, pressão no eixo Y; faixas verticais de atenção (> 14%) e falta de acervo (> 25%). */
export function PressureScatter({ points, ariaLabel }: { points: ScatterPoint[]; ariaLabel: string }) {
  const xmax = Math.max(0.3, ...points.map((p) => p.occupancy * 1.15))
  const ymax = Math.max(1, ...points.map((p) => p.pressure * 1.15))
  const x = (v: number) => (v / xmax) * 100
  const y = (v: number) => 100 - (v / ymax) * 100
  const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1].filter((t) => t <= xmax)
  return (
    <figure className="in-scatter" aria-label={ariaLabel}>
      <div className="in-sc-plot" aria-hidden="true">
        <span className="in-sc-band warn" style={{ left: `${x(OCC_WARN)}%`, width: `${x(Math.min(OCC_SHORT, xmax)) - x(OCC_WARN)}%` }} />
        {OCC_SHORT < xmax && <span className="in-sc-band short" style={{ left: `${x(OCC_SHORT)}%`, right: 0 }} />}
        <span className="in-sc-corner">comprar mais ↗</span>
        {[0.25, 0.5, 0.75].map((f) => (
          <span key={f} className="in-sc-y" style={{ top: `${100 - f * 100}%` }}>
            {num1(ymax * f)}×
          </span>
        ))}
        {points.map((p) => {
          const zone = occZone(p.occupancy)
          return (
            <span key={p.key} className="in-sc-pt" style={{ left: `${x(p.occupancy)}%`, top: `${y(p.pressure)}%`, ...(zone ? { background: zone.color } : {}) }} title={`${p.key}: ${num1(p.pressure)}× · ${pct1(p.occupancy)}`}>
              <b>{p.key}</b>
            </span>
          )
        })}
      </div>
      <div className="in-sc-x" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${x(t)}%` }}>
            {Math.round(t * 100)}%
          </span>
        ))}
      </div>
      <figcaption className="in-sc-cap">
        <span>↑ pressão (procuras por peça) · → ocupação</span>
        <span className="in-sc-legend">
          <i className="k warn" /> atenção &gt; 14% <i className="k short" /> falta acervo &gt; 25%
        </span>
      </figcaption>
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.key}>
            {p.key}: pressão {num1(p.pressure)}×, ocupação {pct1(p.occupancy)}
            {occZone(p.occupancy) ? ` (${occZone(p.occupancy)!.label})` : ''}
          </li>
        ))}
      </ul>
    </figure>
  )
}

export type FunnelStep = { label: string; value: number; note?: string }

/** Funil horizontal: cada etapa proporcional à primeira, com % sobre a etapa anterior. */
export function Funnel({ steps, ariaLabel }: { steps: FunnelStep[]; ariaLabel: string }) {
  const first = Math.max(1, steps[0]?.value ?? 0)
  return (
    <ol className="in-funnel" aria-label={ariaLabel}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.value : null
        return (
          <li key={s.label}>
            <span className="in-fn-l">{s.label}</span>
            <span className="in-fn-t" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (s.value / first) * 100)}%` }} className={`s${i + 1}`} />
            </span>
            <span className="in-fn-v">
              <b className="display">{s.value}</b>
              <small>{prev != null ? `${prev > 0 ? Math.round((s.value / prev) * 100) : 0}% da etapa anterior` : (s.note ?? '')}</small>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export type SplitPart = { label: string; value: number; detail: string }

/** Barra dividida em duas partes (ex.: receita de recorrentes × de uma locação só), com legenda em texto. */
export function SplitBar({ parts, format, ariaLabel }: { parts: [SplitPart, SplitPart]; format: (n: number) => string; ariaLabel: string }) {
  const total = Math.max(1, parts[0].value + parts[1].value)
  const share = (v: number) => Math.round((v / total) * 100)
  return (
    <figure className="in-split" aria-label={ariaLabel}>
      <div className="in-split-bar" aria-hidden="true">
        {parts.map((p, i) => (
          <span key={p.label} className={`p${i + 1}`} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <dl className="in-split-legend">
        {parts.map((p, i) => (
          <div key={p.label}>
            <dt>
              <i className={`k p${i + 1}`} aria-hidden="true" /> {p.label}
            </dt>
            <dd>
              <b className="display">{format(p.value)}</b> <span className="muted">· {share(p.value)}% · {p.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  )
}
