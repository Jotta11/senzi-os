import { useId } from 'react'
import { SHAPES, SHEEN, shapeFor } from './silhouetteShapes'

/* Porta de `SZ.silhouette`/`SZ.shapeFor` do protótipo: sem foto, cada peça vira uma silhueta vetorial
   na COR REAL cadastrada — a interface é quase monocromática e quem colore a tela é o acervo. */

export type SilhouetteProps = {
  categorySlug: string
  style?: string | null
  length: string
  colorHex: string
  /** Largura em px (altura = 4/3). Sem `size`, ocupa a largura do contêiner. */
  size?: number
  /** Nome acessível (ex.: "Vestido Verona — Verde esmeralda"). Sem label, é decorativa. */
  label?: string
  /** Código da peça escrito no rodapé (opcional). */
  code?: string
  className?: string
}

export function Silhouette({ categorySlug, style, length, colorHex, size, label, code, className }: SilhouetteProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const shape = shapeFor(categorySlug, style, length)
  const col = colorHex || '#8C8C8C'
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg
      viewBox="0 0 120 160"
      preserveAspectRatio="xMidYMid meet"
      className={['silhouette', className].filter(Boolean).join(' ')}
      width={size}
      height={size ? Math.round((size * 4) / 3) : undefined}
      data-shape={shape}
      {...a11y}
    >
      <defs>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--surface-2)" />
          <stop offset="1" stopColor="var(--papel)" />
        </linearGradient>
        <linearGradient id={`${uid}f`} x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={col} stopOpacity={1} />
          <stop offset="1" stopColor={col} stopOpacity={0.82} />
        </linearGradient>
      </defs>
      <rect width="120" height="160" fill={`url(#${uid}b)`} />
      <ellipse cx="60" cy="150" rx="34" ry="4.5" fill="rgba(0,0,0,.07)" />
      <path d="M60,22 a5,5 0 1 1 0.1,0" fill="none" stroke="var(--areia-2)" strokeWidth="1.4" />
      <path d="M60,27 L60,31 M47,34 L60,29 L73,34" fill="none" stroke="var(--areia-2)" strokeWidth="1.4" strokeLinecap="round" />
      <path d={SHAPES[shape]} fill={`url(#${uid}f)`} />
      <path d={SHEEN[shape]} fill="rgba(255,255,255,.17)" />
      <path d={SHAPES[shape]} fill="none" stroke="rgba(0,0,0,.16)" strokeWidth="0.8" />
      {code && (
        <text x="60" y="157" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="6.5" fill="var(--nevoa)">
          {code}
        </text>
      )}
    </svg>
  )
}
