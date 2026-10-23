import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type TabItem = {
  key: string
  label: ReactNode
  /** Conteúdo do painel; função = só renderiza quando a aba está ativa (é o caso sempre — só o painel ativo é montado). */
  content: ReactNode | (() => ReactNode)
}

export type TabsProps = {
  /** Nome acessível da lista de abas. */
  label: string
  tabs: TabItem[]
  /** Controlado (opcional). Sem `selected`, a primeira aba começa ativa. */
  selected?: string
  onSelect?(key: string): void
  className?: string
}

/**
 * Abas acessíveis (padrão WAI-ARIA): setas ←/→, Home e End movem a seleção e o foco;
 * só a aba ativa entra na ordem do Tab; só o painel ativo é renderizado.
 */
export function Tabs({ label, tabs, selected, onSelect, className }: TabsProps) {
  const baseId = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [inner, setInner] = useState<string | null>(null)
  const currentKey = selected ?? inner
  const current = tabs.find((t) => t.key === currentKey) ?? tabs[0]
  if (!current) return null

  const select = (key: string) => {
    if (selected === undefined) setInner(key)
    onSelect?.(key)
  }

  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.indexOf(current!)
    const next =
      e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
      : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
      : e.key === 'Home' ? tabs[0]
      : e.key === 'End' ? tabs[tabs.length - 1]
      : undefined
    if (!next) return
    e.preventDefault()
    select(next.key)
    tabRefs.current[next.key]?.focus()
  }

  return (
    <>
      <div className={['tabs', className].filter(Boolean).join(' ')} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const active = t.key === current.key
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(t.key)}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-${current.key}`} aria-labelledby={`${baseId}-tab-${current.key}`} tabIndex={0} className="tabs-panel">
        {typeof current.content === 'function' ? current.content() : current.content}
      </div>
    </>
  )
}
