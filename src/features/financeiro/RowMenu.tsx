import { buttonClass } from '@/ui'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

export type RowMenuItem = { label: string; ariaLabel?: string; onSelect(): void }

/**
 * Menu "⋯" de ações secundárias da linha: botão com `aria-haspopup="menu"`, itens `menuitem`, Esc, clique fora,
 * rolagem e redimensionamento fecham. Posição fixa (a tabela rola e cortaria um menu absoluto).
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const open = pos !== null
  const close = () => setPos(null)

  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (items.length === 0) return null
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={buttonClass('secondary', 'sm', 'fx-more')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (open) return close()
          const r = btn.current!.getBoundingClientRect()
          setPos({ position: 'fixed', top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
        }}
      >
        ⋯
      </button>
      {open && (
        <div ref={menu} id={id} role="menu" className="fx-menu" style={pos}>
          {items.map((i) => (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              aria-label={i.ariaLabel}
              onClick={() => {
                close()
                i.onSelect()
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
