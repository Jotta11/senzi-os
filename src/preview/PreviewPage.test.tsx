import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PreviewPage } from './PreviewPage'

function renderPreview() {
  return render(
    <MemoryRouter initialEntries={['/preview']}>
      <PreviewPage />
    </MemoryRouter>,
  )
}

describe('PreviewPage', () => {
  it('mostra sidebar, alertas, agenda de 4 dias e mini calendário', () => {
    renderPreview()

    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByText('Alertas')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: /calendário/i })).toBeInTheDocument()

    // faixa da agenda: rolagem horizontal com 4 dias visíveis
    const scroller = document.querySelector<HTMLElement>('[data-visible-days]')
    expect(scroller).not.toBeNull()
    expect(scroller!.dataset.visibleDays).toBe('4')
    expect(scroller!.style.getPropertyValue('--visible-days')).toBe('4')

    const dias = within(scroller!).getAllByTestId('agenda-day')
    expect(dias).toHaveLength(7)
    expect(dias[0]).toHaveTextContent(/segunda/i)
    expect(dias[6]).toHaveTextContent(/domingo/i)
  })

  it('a coluna do dia ocupa 1/4 da largura da faixa, com snap', () => {
    const css = readFileSync(resolve(__dirname, 'preview.css'), 'utf8')
    const faixa = /\.ag-strip\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(faixa).toMatch(/overflow-x:\s*auto/)
    expect(faixa).toMatch(/scroll-snap-type:\s*x\s+mandatory/)
    const coluna = /\.ag-day\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(coluna).toMatch(/var\(--visible-days\)/)
    expect(coluna).toMatch(/scroll-snap-align:\s*start/)
  })

  it('sidebar mantém nome acessível em todos os itens (inclusive no trilho de ícones)', () => {
    renderPreview()
    const nav = screen.getByRole('navigation', { name: /navegação principal/i })
    for (const label of ['Dashboard', 'Agenda', 'Reservas', 'Acervo', 'Clientes', 'Operação', 'Financeiro', 'Inteligência', 'Configurações']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /buscar/i })).toBeInTheDocument()

    // nos breakpoints compactos, rótulos somem só visualmente — nunca com display:none
    const css = readFileSync(resolve(__dirname, '../shell/shell.css'), 'utf8')
    let vistos = 0
    for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
      if (/\.sb-nav-label|\.sb-search span/.test(m[1])) {
        vistos++
        expect(m[2]).not.toMatch(/display:\s*none/)
      }
    }
    expect(vistos).toBeGreaterThan(0)
  })

  it('tem os atalhos de Faturamento e Ciclo operacional', () => {
    renderPreview()
    expect(screen.getByRole('link', { name: /ver financeiro completo/i })).toHaveAttribute('href', '/financeiro')
    expect(screen.getByRole('link', { name: /ver operação/i })).toHaveAttribute('href', '/operacao')
  })

  it('mostra um compromisso Interno com estilo distinto', () => {
    renderPreview()
    const internos = document.querySelectorAll('[data-internal="true"]')
    expect(internos.length).toBeGreaterThan(0)
    expect(internos[0]).toHaveTextContent(/interno/i)
  })

  it('exibe badges de todos os tons de status', () => {
    renderPreview()
    for (const tom of ['green', 'wine', 'amber', 'indigo', 'teal', 'ochre', 'stone', 'red']) {
      expect(document.querySelector(`.badge.${tom}`)).not.toBeNull()
    }
  })
})
