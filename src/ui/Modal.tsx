import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export type ModalProps = {
  open: boolean
  onClose(): void
  title: ReactNode
  children: ReactNode
  /** Ações no rodapé (ex.: Cancelar / Salvar). */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Onde pôr o foco ao abrir (padrão: primeiro campo/botão do corpo; senão, o botão Fechar). */
  initialFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Diálogo modal acessível: `role="dialog"` + `aria-modal`, título como nome, foco inicial no primeiro
 * controle do corpo, Tab/Shift+Tab presos dentro, Escape e clique no fundo fecham, foco volta a quem abriu.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md', initialFocusRef }: ModalProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const target = initialFocusRef?.current ?? body.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
    return () => {
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeRef.current()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current()
      }}
    >
      <div ref={panel} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <header className="modal-h">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => closeRef.current()}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <div ref={body} className="modal-b">
          {children}
        </div>
        {footer && <footer className="modal-f">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
