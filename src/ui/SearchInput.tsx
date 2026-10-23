import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

export type SearchInputProps = {
  /** Valor confirmado (ex.: o que está na URL). Mudanças externas atualizam o campo. */
  value: string
  /** Chamado com o texto depois de `delay` ms sem digitar. */
  onChange(value: string): void
  /** Nome acessível (visualmente oculto). */
  label: string
  placeholder?: string
  delay?: number
}

/** Campo de busca com debounce (padrão 260 ms). */
export function SearchInput({ value, onChange, label, placeholder, delay = 260 }: SearchInputProps) {
  const id = useId()
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  const cb = useRef(onChange)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    cb.current = onChange
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  // valor externo mudou (ex.: voltar no histórico): mostra o novo
  if (value !== synced) {
    setSynced(value)
    setText(value)
  }

  function change(next: string) {
    setText(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => cb.current(next), delay)
  }

  return (
    <div className="search-input">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="busca" size={15} />
      <input id={id} type="search" value={text} placeholder={placeholder} onChange={(e) => change(e.target.value)} autoComplete="off" />
    </div>
  )
}
