import { Link } from 'react-router'
import './financeiro.css'

/* Gráficos próprios (SVG/CSS, sem dependências), reutilizados pelo Financeiro, Dashboard e Inteligência.
   Cranberry/Vivo e Areia por token; cada valor também existe como texto (lista só para leitor de tela). */

type Fmt = (n: number) => string

export type LinePoint = { label: string; value: number }
export type LineChartProps = {
  points: LinePoint[]
  ariaLabel: string
  format: Fmt
  /** Segunda série opcional (mesmos rótulos), em tom suave. */
  secondary?: { name: string; points: LinePoint[] }
  /** Nome da série principal (aparece na legenda quando há `secondary`). */
  name?: string
}

const pos = (i: number, n: number) => (n <= 1 ? 50 : 3 + (i / (n - 1)) * 94)

/** Gráfico de linha: curva sobre grade leve, ponto atual destacado, rótulos embaixo. A altura é fixa (200px). */
export function LineChart({ points, ariaLabel, format, secondary, name = 'Recebido' }: LineChartProps) {
  const all = [...points, ...(secondary?.points ?? [])].map((p) => p.value)
  const max = Math.max(1, ...all)
  const y = (v: number) => 92 - (Math.max(0, v) / max) * 84
  const path = (pts: LinePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${pos(i, pts.length).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ')
  const last = points.length - 1
  return (
    <figure className="fx-line" aria-label={ariaLabel}>
      <div className="fx-line-plot" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {[8, 36, 64, 92].map((g) => (
            <line key={g} x1="0" x2="100" y1={g} y2={g} className="fx-grid" />
          ))}
          {points.length > 1 && <path d={`${path(points)} L${pos(last, points.length)} 92 L${pos(0, points.length)} 92 Z`} className="fx-area" />}
          {secondary && <path d={path(secondary.points)} className="fx-l2" />}
          <path d={path(points)} className="fx-l1" />
        </svg>
        {points.map((p, i) => (
          <span key={p.label + i} className={i === last ? 'fx-dot now' : 'fx-dot'} style={{ left: `${pos(i, points.length)}%`, top: `${y(p.value)}%` }} title={`${p.label}: ${format(p.value)}`} />
        ))}
        {points.length > 0 && (
          <span className="fx-now-v" style={{ left: `${pos(last, points.length)}%`, top: `${y(points[last]!.value)}%` }}>
            {format(points[last]!.value)}
          </span>
        )}
      </div>
      <div className="fx-line-x" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.label + i} style={{ left: `${pos(i, points.length)}%` }}>
            {p.label}
          </span>
        ))}
      </div>
      {secondary && (
        <p className="fx-legend" aria-hidden="true">
          <span className="fx-key k1" /> {name} <span className="fx-key k2" /> {secondary.name}
        </p>
      )}
      <ul className="sr-only">
        {points.map((p, i) => (
          <li key={p.label + i}>
            {p.label}: {format(p.value)}
            {secondary?.points[i] ? ` · ${secondary.name}: ${format(secondary.points[i]!.value)}` : ''}
          </li>
        ))}
      </ul>
    </figure>
  )
}

export type BarRow = { label: string; value: number; note?: string; color?: string; href?: string }
export type BarListProps = { rows: BarRow[]; format: Fmt; ariaLabel?: string }

/** Barras horizontais ordenadas como vierem: rótulo, barra proporcional ao maior, nota e valor. `href` vira link no rótulo. */
export function BarList({ rows, format, ariaLabel }: BarListProps) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="fx-bars" aria-label={ariaLabel}>
      {rows.map((r, i) => (
        <li key={r.label + i}>
          <span className="fx-bar-l">{r.href ? <Link to={r.href}>{r.label}</Link> : r.label}</span>
          <span className="fx-bar-t" aria-hidden="true">
            <span style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color ?? `var(--bar-${(i % 4) + 1})` }} />
          </span>
          <span className="fx-bar-v">
            <b>{format(r.value)}</b>
            {r.note && <small>{r.note}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export type ColumnDatum = { label: string; value: number; color?: string }
export type ColumnChartProps = { columns: ColumnDatum[]; ariaLabel: string; format: Fmt }

/** Colunas verticais (estilo das barras do painel): a última destacada em Vivo, valor acima e rótulo abaixo. */
export function ColumnChart({ columns, ariaLabel, format }: ColumnChartProps) {
  const max = Math.max(1, ...columns.map((c) => c.value))
  return (
    <figure className="fx-cols" aria-label={ariaLabel} style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))` }}>
      {columns.map((c, i) => (
        <div key={c.label + i} className={i === columns.length - 1 ? 'fx-col now' : 'fx-col'} aria-hidden="true" title={`${c.label}: ${format(c.value)}`}>
          <span className="fx-col-v">{format(c.value)}</span>
          <span className="fx-col-f" style={{ height: `${Math.max(2, (c.value / max) * 100)}%`, ...(c.color ? { background: c.color } : {}) }} />
          <span className="fx-col-m">{c.label}</span>
        </div>
      ))}
      <ul className="sr-only">
        {columns.map((c, i) => (
          <li key={c.label + i}>
            {c.label}: {format(c.value)}
          </li>
        ))}
      </ul>
    </figure>
  )
}
