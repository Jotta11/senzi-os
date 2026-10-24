import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { ToastContext, type ToastInput } from './toastContext'
import './toast.css'

type Item = ToastInput & { id: number }

const DURATION = 4000
const MAX = 4

/**
 * Relógios dos avisos: cada um some depois de `DURATION`; enquanto o ponteiro ou o foco está num aviso,
 * todos congelam (guardam o tempo restante) e retomam ao sair.
 */
function createTimers(expire: (id: number) => void) {
  type Timer = { handle?: ReturnType<typeof setTimeout>; left: number; startedAt: number }
  const map = new Map<number, Timer>()
  const hold = { hover: false, focus: false }
  const paused = () => hold.hover || hold.focus
  const run = (id: number, t: Timer) => {
    t.startedAt = Date.now()
    t.handle = setTimeout(() => {
      map.delete(id)
      expire(id)
    }, t.left)
  }
  const resumeAll = () => map.forEach((t, id) => run(id, t))
  return {
    add(id: number) {
      const t: Timer = { left: DURATION, startedAt: 0 }
      map.set(id, t)
      if (!paused()) run(id, t)
    },
    remove(id: number) {
      clearTimeout(map.get(id)?.handle)
      map.delete(id)
      // O aviso fechado pode ter levado o ponteiro/foco consigo (sem mouseleave/blur): os outros voltam a correr.
      if (paused()) {
        hold.hover = false
        hold.focus = false
        resumeAll()
      }
    },
    hold(k: 'hover' | 'focus', on: boolean) {
      const was = paused()
      hold[k] = on
      if (was === paused()) return
      if (!paused()) return resumeAll()
      map.forEach((t) => {
        clearTimeout(t.handle)
        t.left = Math.max(0, t.left - (Date.now() - t.startedAt))
      })
    },
    clear() {
      map.forEach((t) => clearTimeout(t.handle))
      map.clear()
    },
  }
}

/**
 * Pilha de avisos (canto inferior direito; largura total no celular). Duas regiões vivas sempre no DOM — avisos em
 * `polite`, erros em `assertive` — para o leitor de tela anunciar também o primeiro aviso. Some sozinho em ~4 s
 * (pausa enquanto o ponteiro ou o foco está num aviso) ou no botão Fechar.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const [api] = useState(() => {
    let seq = 0
    const drop = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id))
    const timers = createTimers(drop)
    const toast = (t: ToastInput) => {
      const id = ++seq
      setItems((xs) => [...xs.slice(-(MAX - 1)), { ...t, id }])
      timers.add(id)
    }
    const dismiss = (id: number) => {
      timers.remove(id)
      drop(id)
    }
    return { toast, dismiss, timers }
  })
  useEffect(() => () => api.timers.clear(), [api])

  const render = (t: Item) => (
    <div
      key={t.id}
      className={`toast ${t.tone ?? 'ok'}`}
      onMouseEnter={() => api.timers.hold('hover', true)}
      onMouseLeave={() => api.timers.hold('hover', false)}
      onFocus={() => api.timers.hold('focus', true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) api.timers.hold('focus', false)
      }}
    >
      <Icon name={t.tone === 'error' ? 'alerta' : 'check'} size={16} />
      <div className="toast-t">
        <b>{t.title}</b>
        {t.description && <span>{t.description}</span>}
      </div>
      <button type="button" className="toast-x" aria-label="Fechar aviso" onClick={() => api.dismiss(t.id)}>
        <Icon name="x" size={13} />
      </button>
    </div>
  )

  return (
    <ToastContext.Provider value={api.toast}>
      {children}
      <div className="toasts">
        <div className="toast-region" role="status" aria-live="polite" aria-label="Avisos">
          {items.filter((t) => t.tone !== 'error').map(render)}
        </div>
        <div className="toast-region" role="alert" aria-live="assertive" aria-label="Erros">
          {items.filter((t) => t.tone === 'error').map(render)}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
