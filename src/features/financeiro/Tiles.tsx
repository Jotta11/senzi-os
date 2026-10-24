export type Tile = { label: string; value: string; desc: string; tone?: 'alert' | 'neg' }

/** Faixa de números do Financeiro (lista acessível; tom só como reforço do texto). */
export function Tiles({ tiles, label }: { tiles: Tile[]; label: string }) {
  return (
    <div className="fx-tiles" role="list" aria-label={label}>
      {tiles.map((t) => (
        <div key={t.label} role="listitem" className={t.tone}>
          <span className="fx-tile-l">{t.label}</span>
          <b className="display">{t.value}</b>
          <span className="fx-tile-d">{t.desc}</span>
        </div>
      ))}
    </div>
  )
}
