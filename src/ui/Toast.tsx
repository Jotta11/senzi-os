import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { ToastContext, type ToastInput } from './toastContext'
import './toast.css'

type Item = ToastInput & { id: number }

const DURATION = 4000
/** Pilha de avisos (canto inferior direito; largura total no celular). Some sozinho em ~4 s ou no botão Fechar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])
  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current
      setItems((xs) => [...xs.slice(-3), { ...t, id }])
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION))
    },
    [dismiss],
  )
  useEffect(() => {
    const map = timers.current
    return () => map.forEach(clearTimeout)
  }, [])
  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-label="Avisos">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? 'ok'}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Icon name={t.tone === 'error' ? 'alerta' : 'check'} size={16} />
            <div className="toast-t">
              <b>{t.title}</b>
              {t.description && <span>{t.description}</span>}
            </div>
            <button type="button" className="toast-x" aria-label="Fechar aviso" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
