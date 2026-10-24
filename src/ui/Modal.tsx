import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export type ModalProps = {
  open: boolean
  onClose(): void
  title: ReactNode
  /** Linha de apoio sob o título (ex.: "SZ-0107 · Vestido Verona"). Vira a descrição acessível do diálogo. */
  description?: ReactNode
  children: ReactNode
  /** Ações no rodapé (ex.: Cancelar / Salvar). */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Onde pôr o foco ao abrir (padrão: primeiro campo/botão do corpo; senão, o botão Fechar). */
  initialFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Modais abertos, do mais antigo ao mais recente: só o do topo responde ao teclado. */
const stack: HTMLElement[] = []
let savedOverflow: string | null = null

/**
 * Diálogo modal acessível: `role="dialog"` + `aria-modal`, título como nome, foco inicial no primeiro
 * controle do corpo, Tab/Shift+Tab presos dentro, Escape e clique no fundo fecham, foco volta a quem abriu.
 * O teclado é ouvido no documento enquanto aberto (clicar num texto do modal não solta o Escape/Tab) e a
 * rolagem da página fica travada.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', initialFocusRef }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open || !panel.current) return
    const el = panel.current
    const opener = document.activeElement as HTMLElement | null
    const target = initialFocusRef?.current ?? body.current?.querySelector<HTMLElement>(FOCUSABLE) ?? el.querySelector<HTMLElement>(FOCUSABLE)
    ;(target ?? el).focus()

    stack.push(el)
    if (stack.length === 1) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== el) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) {
        e.preventDefault()
        el.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement as HTMLElement | null
      const inside = !!active && active !== el && el.contains(active) && items.includes(active)
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const i = stack.indexOf(el)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length === 0) {
        document.body.style.overflow = savedOverflow ?? ''
        savedOverflow = null
      }
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current()
      }}
    >
      <div
        ref={panel}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <header className="modal-h">
          <div className="modal-tt">
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descId} className="modal-sub">
                {description}
              </p>
            )}
          </div>
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
