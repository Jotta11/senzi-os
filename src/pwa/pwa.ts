import { useSyncExternalStore } from 'react'

/** Evento do Chrome/Edge/Android que permite abrir o "Instalar app" pelo nosso botão. */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export type PwaState = {
  /** Navegador ofereceu instalação (Chrome/Edge/Android). */
  canInstall: boolean
  /** iPhone/iPad no Safari, fora do app instalado: instalação só pelo menu Compartilhar. */
  iosHint: boolean
  /** Já roda como app instalado (tela cheia, sem barra do navegador). */
  standalone: boolean
  /** Há uma versão nova baixada esperando para entrar. */
  updateReady: boolean
}

let state: PwaState = { canInstall: false, iosHint: false, standalone: false, updateReady: false }
let installEvent: InstallPromptEvent | null = null
let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
}

function isIos() {
  const ua = navigator.userAgent
  // iPadOS se apresenta como Mac; o toque denuncia.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

let started = false

/** Liga os ouvintes de instalação e registra o service worker (só no build de produção). Idempotente. */
export function initPwa() {
  if (started || typeof window === 'undefined') return
  started = true
  const standalone = isStandalone()
  set({ standalone, iosHint: isIos() && !standalone })

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    set({ canInstall: false, iosHint: false })
  })

  if (import.meta.env.PROD && 'serviceWorker' in navigator) void registerServiceWorker()
}

async function registerServiceWorker() {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    const track = (sw: ServiceWorker | null) => {
      if (!sw) return
      const ready = () => {
        // Só é "atualização" se já havia uma versão controlando a página (a primeira instalação não avisa).
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          waiting = sw
          set({ updateReady: true })
        }
      }
      ready()
      sw.addEventListener('statechange', ready)
    }
    track(reg.waiting)
    reg.addEventListener('updatefound', () => track(reg.installing))
    // App aberto por horas no balcão: procura versão nova ao voltar para a aba e a cada hora.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => {})
    })
    setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000)
  } catch {
    // Sem service worker o sistema funciona igual, só não abre offline.
  }
}

/** Abre o diálogo nativo de instalação. Devolve `true` se a pessoa aceitou. */
export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  const ev = installEvent
  installEvent = null
  set({ canInstall: false })
  await ev.prompt()
  const { outcome } = await ev.userChoice
  return outcome === 'accepted'
}

/** Ativa a versão nova e recarrega quando ela assumir. */
export function applyUpdate() {
  if (!waiting) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

/** Deixa de mostrar o aviso de atualização (a versão nova entra na próxima abertura). */
export function dismissUpdate() {
  set({ updateReady: false })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Só para testes: volta ao estado inicial e aplica um estado simulado. */
export function __setPwaStateForTests(patch: Partial<PwaState>, event?: InstallPromptEvent | null) {
  if (event !== undefined) installEvent = event
  state = { canInstall: false, iosHint: false, standalone: false, updateReady: false, ...patch }
  listeners.forEach((l) => l())
}
