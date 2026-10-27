import { useSyncExternalStore } from 'react'
import { STORE_TZ, todayISO } from './format'

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: STORE_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

/** Milissegundos até a próxima meia-noite no fuso da loja (+1 s de folga). */
export function msUntilStoreMidnight(now: Date = new Date()): number {
  const p = Object.fromEntries(clockFmt.formatToParts(now).map((x) => [x.type, Number(x.value)]))
  const elapsed = ((p.hour ?? 0) * 3600 + (p.minute ?? 0) * 60 + (p.second ?? 0)) * 1000 + now.getMilliseconds()
  return Math.max(1000, 86_400_000 - elapsed + 1000)
}

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>
  const arm = () => {
    timer = setTimeout(() => {
      onChange()
      arm()
    }, msUntilStoreMidnight())
  }
  arm()
  // App reaberto depois de o aparelho dormir: o timer pode ter atrasado; confere o dia ao voltar a ficar visível.
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * "Hoje" das telas: `aaaa-mm-dd` no fuso da loja (America/Araguaina), pelo relógio do aparelho — o mesmo dia que
 * `public.store_today()` no banco. Diferente de chamar `todayISO()` no render, troca sozinho à meia-noite da loja
 * (tela aberta de um dia para o outro). Valores iniciais de formulário podem seguir com `todayISO()`.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, todayISO, todayISO)
}
