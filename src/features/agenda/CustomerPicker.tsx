import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { useCustomer, useCustomers } from '@/data/hooks'
import { Icon } from '@/ui'
import './customerPicker.css'

export type CustomerPickerProps = {
  /** Id da cliente escolhida (ou `null`). */
  value: string | null
  onChange(id: string | null): void
  /** Mostra "Cadastrar nova cliente" no fim da lista. */
  allowCreate?: boolean
  onCreateRequest?(): void
  label?: string
  error?: string
  /** Id do campo (para o foco depois de um erro). */
  id?: string
}

const CREATE = '__create__'

/**
 * Busca de cliente reutilizável (combobox + listbox): digita nome, telefone, CPF ou código; ↑/↓ navegam,
 * Enter escolhe (e nunca envia o formulário em volta), Esc fecha a lista. A lista só abre ao digitar ou com ↓ (nunca ao focar). Escolhida a cliente, o campo mostra o
 * nome; digitar de novo limpa a escolha.
 */
export function CustomerPicker({ value, onChange, allowCreate = false, onCreateRequest, label = 'Cliente', error, id }: CustomerPickerProps) {
  const auto = useId()
  const inputId = id ?? `${auto}-in`
  const listId = `${auto}-list`
  /** Texto digitado; `null` = não está digitando (mostra o nome da escolhida). */
  const [text, setText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const selected = useCustomer(value ?? undefined)
  const query = text ?? ''
  const found = useCustomers(query, query ? 'nome' : 'recentes', { limit: 8, offset: 0 })
  const items = found.data?.items ?? []
  const options = [...items.map((c) => ({ key: c.id, label: c.fullName, sub: `${c.code} · ${c.city ?? c.phone}` })), ...(allowCreate ? [{ key: CREATE, label: 'Cadastrar nova cliente', sub: '' }] : [])]
  const shown = text ?? (value ? (selected.data?.fullName ?? '') : '')
  const activeIdx = Math.min(active, Math.max(0, options.length - 1))

  // Esc fecha só a lista (a escuta na janela, em captura, vem antes da do Modal)
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  function choose(key: string) {
    if (key === CREATE) {
      setOpen(false)
      onCreateRequest?.()
      return
    }
    setText(null)
    setOpen(false)
    onChange(key)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault() // nunca envia o formulário em volta
      const o = options[activeIdx]
      if (open && o) choose(o.key)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const n = options.length
      if (n) setActive((activeIdx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    }
  }

  const optId = (i: number) => `${listId}-${i}`
  return (
    <div className={['field', 'cp', error && 'has-error'].filter(Boolean).join(' ')}>
      <label htmlFor={inputId}>{label}</label>
      <div className="cp-box">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && options.length ? optId(activeIdx) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
          placeholder="Buscar por nome, telefone ou código"
          value={shown}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
            if (value) onChange(null)
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setText(null)
          }}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button type="button" className="cp-clear" aria-label="Limpar cliente" onClick={() => { onChange(null); setText(null) }}>
            <Icon name="x" size={13} />
          </button>
        )}
        {open && (
          <ul id={listId} role="listbox" aria-label="Clientes" className="cp-list">
            {options.map((o, i) => (
              <li
                key={o.key}
                id={optId(i)}
                role="option"
                aria-selected={i === activeIdx}
                className={['cp-opt', o.key === CREATE && 'cp-create'].filter(Boolean).join(' ')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.key)}
              >
                {o.key === CREATE && <Icon name="usuarioMais" size={14} />}
                <span className="cp-name">{o.label}</span>
                {o.sub && <span className="cp-sub">{o.sub}</span>}
              </li>
            ))}
            {options.length === 0 && (
              <li className="cp-empty" role="presentation">
                {found.isFetching ? 'Buscando…' : 'Nenhuma cliente encontrada.'}
              </li>
            )}
          </ul>
        )}
      </div>
      {error && (
        <span className="error" id={`${inputId}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
