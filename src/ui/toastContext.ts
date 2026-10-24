import { createContext, useContext } from 'react'

export type ToastInput = { title: string; description?: string; tone?: 'ok' | 'error' | 'info' }

export const ToastContext = createContext<(t: ToastInput) => void>(() => {})

/** `toast({ title, description?, tone? })` — aviso breve no canto da tela. Fora do `ToastProvider` não faz nada. */
export const useToast = () => useContext(ToastContext)
