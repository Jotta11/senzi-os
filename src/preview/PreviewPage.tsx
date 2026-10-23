import { useEffect, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Sidebar } from '@/shell/Sidebar'
import { Badge, Button, Card, Icon, buttonClass, type IconName, type Tone } from '@/ui'
import './preview.css'

/* =====================================================================
   Prévia visual estática (dados fictícios) — dashboard + agenda.
   Serve para aprovar cores e layout antes de construir as telas reais.
   ===================================================================== */

const HOJE = 23 // sexta-feira, 23/10/2026
const MES = 'outubro de 2026'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const NAV: { to: string; icon: IconName; label: string; count?: number }[] = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/agenda', icon: 'agenda', label: 'Agenda', count: 6 },
  { to: '/reservas', icon: 'reservas', label: 'Reservas', count: 18 },
  { to: '/acervo', icon: 'acervo', label: 'Acervo', count: 142 },
  { to: '/clientes', icon: 'clientes', label: 'Clientes', count: 311 },
  { to: '/operacao', icon: 'operacao', label: 'Operação', count: 7 },
  { to: '/financeiro', icon: 'financeiro', label: 'Financeiro' },
  { to: '/inteligencia', icon: 'inteligencia', label: 'Inteligência' },
  { to: '/config', icon: 'config', label: 'Configurações' },
]

const ALERTAS: { tone: Tone; icon: IconName; title: string; detail: string; to: string }[] = [
  { tone: 'red', icon: 'alerta', title: 'Devolução atrasada', detail: 'Marina Albuquerque · SZ-0417 · 2 dias', to: '/reservas' },
  { tone: 'amber', icon: 'moeda', title: 'Saldo pendente na retirada', detail: 'Helena Prado · retira amanhã · R$ 640', to: '/reservas' },
  { tone: 'amber', icon: 'gota', title: '3 peças aguardando inspeção', detail: 'Devolvidas ontem, ainda fora do acervo', to: '/operacao' },
  { tone: 'stone', icon: 'presente', title: 'Aniversário hoje', detail: 'Beatriz Lemos · cliente desde 2024', to: '/clientes' },
]

type Kind = 'prova' | 'retirada' | 'devolucao' | 'evento' | 'servico' | 'interno'
const KIND: Record<Kind, { label: string; tone: Tone }> = {
  prova: { label: 'Prova', tone: 'indigo' },
  retirada: { label: 'Retirada', tone: 'wine' },
  devolucao: { label: 'Devolução', tone: 'teal' },
  evento: { label: 'Evento', tone: 'amber' },
  servico: { label: 'Serviço', tone: 'ochre' },
  interno: { label: 'Interno', tone: 'stone' },
}

type Compromisso = { time: string; kind: Kind; who: string; note?: string }

const HOJE_LISTA: Compromisso[] = [
  { time: '09:30', kind: 'prova', who: 'Larissa Monteiro', note: 'SZ-0233, SZ-0381 · madrinha' },
  { time: '11:00', kind: 'retirada', who: 'Helena Prado', note: 'SZ-0102 · saldo R$ 640' },
  { time: '13:00', kind: 'interno', who: 'Reunião de equipe', note: 'Planejamento da temporada de formaturas' },
  { time: '15:00', kind: 'devolucao', who: 'Camila Duarte', note: 'SZ-0298' },
  { time: '17:30', kind: 'prova', who: 'Sofia Ribeiro', note: 'Noiva civil · 3 peças separadas' },
]

const SEMANA: { dia: string; data: string; n: number; itens: Compromisso[] }[] = [
  { dia: 'Segunda', data: '19/10/2026', n: 19, itens: [
    { time: '10:00', kind: 'prova', who: 'Ana Clara Souza' },
    { time: '16:00', kind: 'devolucao', who: 'Juliana Freitas' },
  ] },
  { dia: 'Terça', data: '20/10/2026', n: 20, itens: [
    { time: '09:00', kind: 'servico', who: 'Ajuste · SZ-0233' },
    { time: '14:30', kind: 'retirada', who: 'Paula Menezes' },
  ] },
  { dia: 'Quarta', data: '21/10/2026', n: 21, itens: [{ time: '11:00', kind: 'prova', who: 'Renata Castro' }] },
  { dia: 'Quinta', data: '22/10/2026', n: 22, itens: [
    { time: '10:30', kind: 'devolucao', who: 'Marina Albuquerque' },
    { time: '18:00', kind: 'interno', who: 'Fotos do acervo novo' },
  ] },
  { dia: 'Sexta', data: '23/10/2026', n: 23, itens: HOJE_LISTA },
  { dia: 'Sábado', data: '24/10/2026', n: 24, itens: [
    { time: '10:00', kind: 'retirada', who: 'Helena Prado' },
    { time: '19:00', kind: 'evento', who: 'Casamento · Larissa M.' },
  ] },
  { dia: 'Domingo', data: '25/10/2026', n: 25, itens: [] },
]

const COM_COMPROMISSO = new Set([2, 5, 6, 9, 13, 14, 16, 19, 20, 21, 22, 23, 24, 27, 28, 30])

const FATURAMENTO = [
  { m: 'abr', v: 18400 }, { m: 'mai', v: 22100 }, { m: 'jun', v: 19800 }, { m: 'jul', v: 16300 },
  { m: 'ago', v: 24700 }, { m: 'set', v: 27900 }, { m: 'out', v: 21350 },
]

const CICLO: { label: string; tone: Tone; q: number }[] = [
  { label: 'Inspeção', tone: 'amber', q: 3 },
  { label: 'Higienização', tone: 'teal', q: 2 },
  { label: 'Ajuste', tone: 'ochre', q: 1 },
  { label: 'Manutenção', tone: 'red', q: 1 },
  { label: 'Bloqueado', tone: 'stone', q: 0 },
]

const STATUS: { tone: Tone; label: string }[] = [
  { tone: 'green', label: 'Disponível' },
  { tone: 'wine', label: 'Reservado' },
  { tone: 'amber', label: 'Pagamento pendente' },
  { tone: 'indigo', label: 'Prova agendada' },
  { tone: 'teal', label: 'Higienização' },
  { tone: 'ochre', label: 'Em ajuste' },
  { tone: 'stone', label: 'Rascunho' },
  { tone: 'red', label: 'Atrasada' },
]

/* ------------------------------------------------------------------ */

export function PreviewPage() {
  return (
    <div className="sb-app">
      <Rail />
      <main className="pv-main">
        <header className="pv-topbar">
          <div>
            <p className="eyebrow">Prévia visual · dados fictícios</p>
            <h1 className="display">Hoje</h1>
            <p className="pv-sub">Sexta-feira, 23/10/2026</p>
          </div>
          <div className="pv-actions">
            <Button icon="prova">Agendar prova</Button>
            <Button icon="clientes">Nova cliente</Button>
            <Button variant="primary" icon="plus">Nova reserva</Button>
          </div>
        </header>

        <div className="pv-view">
          <Alertas />

          <section className="pv-agenda-block" aria-label="Agenda de hoje e calendário">
            <AgendaHoje />
            <MiniCalendario />
          </section>

          <div className="pv-grid-2">
            <Faturamento />
            <CicloOperacional />
          </div>

          <AgendaSemana />

          <Card title="Tons de status" meta={<span className="muted tiny">sempre com rótulo de texto</span>}>
            <div className="pv-badges">
              {STATUS.map((s) => (
                <Badge key={s.tone} tone={s.tone}>
                  {s.label}
                </Badge>
              ))}
            </div>
            <div className="pv-buttons">
              <Button variant="primary">Primário</Button>
              <Button>Secundário</Button>
              <Button variant="ghost">Discreto</Button>
              <Button variant="danger" icon="lixo">Cancelar reserva</Button>
              <a href="#tons">Link de texto</a>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}

function Rail() {
  return (
    <Sidebar
      search
      activePath="/"
      items={NAV}
      footer={
        <>
          <span className="sb-av" aria-hidden="true">JS</span>
          <span className="sb-who">
            <b>Júlia Senzi</b>
            <span>Administrador</span>
          </span>
        </>
      }
    />
  )
}

function Alertas() {
  return (
    <section className="pv-alerts" aria-labelledby="pv-alertas-t">
      <div className="pv-section-h">
        <h2 id="pv-alertas-t">Alertas</h2>
        <Badge tone="red">1 crítico</Badge>
        <span className="muted tiny">{ALERTAS.length} pendências</span>
      </div>
      <div className="pv-alert-row">
        {ALERTAS.map((a) => (
          <Link key={a.title} to={a.to} className={`pv-alert tone-${a.tone}`}>
            <span className="pv-alert-ic">
              <Icon name={a.icon} size={15} />
            </span>
            <span className="pv-alert-tx">
              <b>{a.title}</b>
              <span>{a.detail}</span>
            </span>
            <Icon name="chevron" size={14} className="pv-alert-go" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function AgendaHoje() {
  return (
    <Card
      title="Agenda de hoje"
      meta={<span className="muted tiny">{HOJE_LISTA.length} compromissos</span>}
      actions={
        <Link to="/agenda" className={buttonClass('ghost', 'sm')}>
          Ver semana <Icon name="seta" size={13} />
        </Link>
      }
      flush
    >
      <ul className="pv-ag-list">
        {HOJE_LISTA.map((c) => {
          const k = KIND[c.kind]
          const interno = c.kind === 'interno'
          return (
            <li key={c.time} className={interno ? 'pv-ag-item is-internal' : 'pv-ag-item'} data-internal={interno || undefined}>
              <span className="pv-hh mono">{c.time}</span>
              <span>
                <span className="pv-ttl">{interno ? c.who : `${k.label} — ${c.who}`}</span>
                {c.note && <span className="pv-sub2">{c.note}</span>}
              </span>
              <Badge tone={k.tone}>{k.label}</Badge>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function MiniCalendario() {
  // outubro/2026 começa numa quinta → 3 casas vazias (semana começa na segunda)
  const pad = 3
  const total = 31
  const cells: (number | null)[] = [...Array(pad).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const semanas = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const dows = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

  return (
    <Card
      className="pv-cal-card"
      title={<span className="display pv-cal-title">Outubro</span>}
      meta={<span className="muted tiny">2026</span>}
      actions={
        <>
          <button type="button" className="icon-btn" aria-label="Mês anterior">
            <Icon name="chevronL" size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="Próximo mês">
            <Icon name="chevron" size={15} />
          </button>
        </>
      }
    >
      <table role="grid" aria-label={`Calendário de ${MES}`} className="pv-cal">
        <thead>
          <tr>
            {dows.map((d) => (
              <th key={d} scope="col" abbr={d}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((sem, i) => (
            <tr key={i}>
              {sem.map((d, j) =>
                d == null ? (
                  <td key={j} />
                ) : (
                  <td key={j} aria-selected={d === HOJE ? true : undefined}>
                    <Link
                      to={`/agenda?dia=2026-10-${String(d).padStart(2, '0')}`}
                      className={['pv-cal-d', d === HOJE && 'today', d < HOJE && 'past'].filter(Boolean).join(' ')}
                      aria-label={`${String(d).padStart(2, '0')}/10/2026${COM_COMPROMISSO.has(d) ? ', com compromissos' : ''}`}
                    >
                      {d}
                      {COM_COMPROMISSO.has(d) && <i aria-hidden="true" />}
                    </Link>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pv-cal-legend muted tiny">
        <i aria-hidden="true" /> dia com compromissos · clique para abrir a agenda
      </p>
    </Card>
  )
}

function Faturamento() {
  const max = Math.max(...FATURAMENTO.map((f) => f.v))
  const total = 21350
  return (
    <Card
      title="Faturamento recebido"
      meta={<span className="muted tiny">7 meses · corrente parcial</span>}
      actions={
        <Link to="/financeiro" className={buttonClass('secondary', 'sm')}>
          Ver financeiro completo <Icon name="seta" size={13} />
        </Link>
      }
    >
      <div className="pv-kpis">
        <div>
          <div className="eyebrow">Este mês</div>
          <div className="display pv-kpi">{brl(total)}</div>
        </div>
        <div>
          <div className="eyebrow">Ticket médio</div>
          <div className="display pv-kpi">{brl(712)}</div>
        </div>
        <div>
          <div className="eyebrow">Locações</div>
          <div className="display pv-kpi">30</div>
        </div>
      </div>
      <figure className="pv-bars" aria-label="Faturamento recebido por mês">
        {FATURAMENTO.map((f, i) => (
          <div key={f.m} className={i === FATURAMENTO.length - 1 ? 'pv-bar current' : 'pv-bar'}>
            <span className="pv-bar-v">{(f.v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil</span>
            <span className="pv-bar-fill" style={{ height: `${(f.v / max) * 100}%` }} />
            <span className="pv-bar-m">{f.m}</span>
          </div>
        ))}
      </figure>
    </Card>
  )
}

function CicloOperacional() {
  return (
    <Card
      title="Ciclo operacional"
      actions={
        <Link to="/operacao" className={buttonClass('secondary', 'sm')}>
          Ver operação <Icon name="seta" size={13} />
        </Link>
      }
    >
      <div className="pv-ciclo">
        <div className="note amber">
          <Icon name="alerta" size={15} />
          <span>
            <b>3 peças aguardando inspeção.</b> Enquanto não forem inspecionadas, não voltam ao acervo.
          </span>
        </div>
        <ul className="pv-ciclo-list">
          {CICLO.map((c) => (
            <li key={c.label} className="spread">
              <Badge tone={c.tone}>{c.label}</Badge>
              <span className="num pv-strong">{c.q}</span>
            </li>
          ))}
        </ul>
        <hr className="sep" />
        <div className="spread">
          <span className="muted">Comprometidas com reservas futuras</span>
          <span className="num pv-strong">24</span>
        </div>
        <div className="spread">
          <span className="muted">Fora da loja agora</span>
          <span className="num pv-strong">9</span>
        </div>
        <div className="spread">
          <span className="muted">Taxa de ocupação do acervo</span>
          <span className="num pv-strong">23%</span>
        </div>
      </div>
    </Card>
  )
}

function AgendaSemana() {
  const scroller = useRef<HTMLDivElement>(null)
  const VISIVEIS = 4

  // abre com hoje centralizado (na medida do possível) na faixa
  useEffect(() => {
    const el = scroller.current
    const hoje = el?.querySelector<HTMLElement>('[data-today="true"]')
    if (!el || !hoje) return
    el.scrollLeft = hoje.offsetLeft - el.offsetLeft - (el.clientWidth - hoje.offsetWidth) / 2
  }, [])

  const passo = (dir: -1 | 1) => {
    const el = scroller.current
    const col = el?.querySelector<HTMLElement>('[data-testid="agenda-day"]')
    if (el && col) el.scrollBy({ left: dir * (col.offsetWidth + 12), behavior: 'smooth' })
  }

  return (
    <section className="pv-week" aria-labelledby="pv-semana-t">
      <div className="pv-section-h">
        <h2 id="pv-semana-t">Agenda da semana</h2>
        <span className="muted tiny">19/10/2026 – 25/10/2026</span>
        <div className="pv-week-nav">
          <button type="button" className="icon-btn" aria-label="Dia anterior" onClick={() => passo(-1)}>
            <Icon name="chevronL" size={16} />
          </button>
          <Button size="sm">Hoje</Button>
          <button type="button" className="icon-btn" aria-label="Próximo dia" onClick={() => passo(1)}>
            <Icon name="chevron" size={16} />
          </button>
          <Button size="sm" variant="primary" icon="plus">
            Novo compromisso
          </Button>
        </div>
      </div>
      <div
        ref={scroller}
        className="ag-strip"
        data-visible-days={VISIVEIS}
        style={{ '--visible-days': VISIVEIS } as CSSProperties}
        tabIndex={0}
        aria-label="Dias da semana, role para os lados"
      >
        {SEMANA.map((d) => {
          const hoje = d.n === HOJE
          return (
            <article
              key={d.data}
              className={hoje ? 'ag-day today' : 'ag-day'}
              data-testid="agenda-day"
              data-today={hoje || undefined}
              aria-label={`${d.dia}, ${d.data}`}
            >
              <header className="ag-day-h">
                <div>
                  <div className="eyebrow">{d.dia}</div>
                  <div className="display ag-day-n">{d.data.slice(0, 5)}</div>
                </div>
                {hoje && <Badge tone="wine">hoje</Badge>}
              </header>
              <div className="ag-day-b">
                {d.itens.length === 0 && <p className="muted tiny">Sem compromissos</p>}
                {d.itens.map((c) => {
                  const k = KIND[c.kind]
                  const interno = c.kind === 'interno'
                  return (
                    <div
                      key={c.time + c.who}
                      className={interno ? 'ag-ev is-internal' : 'ag-ev'}
                      data-internal={interno || undefined}
                      style={interno ? undefined : ({ '--ev-tone': `var(--t-${k.tone})` } as CSSProperties)}
                    >
                      <div className="mono tiny muted">{c.time}</div>
                      <div className="ag-ev-k">{k.label}</div>
                      <div className="tiny ag-ev-who">{c.who}</div>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
