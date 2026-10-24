import { PERIOD_LABEL, type ListRange } from './period'

/** Seletor segmentado de período (30 dias | 90 dias | 12 meses | Tudo). */
export function PeriodSeg<T extends ListRange>({ value, onChange, allowAll = false }: { value: T; onChange(p: T): void; allowAll?: boolean }) {
  const opts = (allowAll ? ['30', '90', '365', 'tudo'] : ['30', '90', '365']) as T[]
  return (
    <div className="ac-seg" role="group" aria-label="Período">
      {opts.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
          {PERIOD_LABEL[o]}
        </button>
      ))}
    </div>
  )
}
