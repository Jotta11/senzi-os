export type ChipOption<T extends string> = { value: T; label: string; count?: number }

export type ChipsProps<T extends string> = {
  /** Nome acessível do grupo. */
  label: string
  options: ChipOption<T>[]
  value: T
  onChange(value: T): void
}

/** Filtro de escolha única em pílulas; a atual tem `aria-pressed="true"`. */
export function Chips<T extends string>({ label, options, value, onChange }: ChipsProps<T>) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="chip-n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
