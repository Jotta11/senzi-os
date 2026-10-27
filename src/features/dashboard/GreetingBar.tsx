import { useEffect, useState, type ReactNode } from 'react'
import { useCurrentUserName } from '@/auth/useCurrentUserName'
import { longDate } from '@/domain/dates'
import { Icon } from '@/ui'

/** "Bom dia" das 5h às 12h, "Boa tarde" até 18h, "Boa noite" depois. */
function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia'
  return hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

/** Barra de boas-vindas do Dashboard: saudação pela hora, primeiro nome, data do painel e relógio. */
export function GreetingBar({ today, children }: { today: string; children?: ReactNode }) {
  const now = useNow()
  const name = useCurrentUserName()?.trim().split(/\s+/)[0]
  const hour = now.getHours()
  const day = longDate(today)
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <header className="dash-hello">
      <span className="dash-hello-icon" aria-hidden="true">
        <Icon name={hour >= 6 && hour < 18 ? 'sol' : 'lua'} size={22} />
      </span>
      <div className="dash-hello-text">
        <h1>
          {greeting(hour)}
          {name && `, ${name}`}
        </h1>
        <p>
          <span>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
          <span className="dash-hello-sep" aria-hidden="true">·</span>
          <span className="dash-hello-dot" aria-hidden="true" />
          <time dateTime={now.toISOString()}>{time}</time>
        </p>
      </div>
      {children && <div className="dash-actions">{children}</div>}
    </header>
  )
}
