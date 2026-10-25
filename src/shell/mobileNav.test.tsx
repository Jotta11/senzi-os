import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar, type SidebarItem } from './Sidebar'

const ITEMS: SidebarItem[] = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/agenda', icon: 'agenda', label: 'Agenda' },
  { to: '/provas', icon: 'prova', label: 'Provas' },
  { to: '/reservas', icon: 'reservas', label: 'Reservas' },
  { to: '/acervo', icon: 'acervo', label: 'Acervo' },
  { to: '/clientes', icon: 'clientes', label: 'Clientes' },
  { to: '/financeiro', icon: 'financeiro', label: 'Financeiro' },
]

/** Simula a largura de celular: `matchMedia` responde à query do celular. */
function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function setup(path = '/', items = ITEMS) {
  const router = createMemoryRouter(
    [{ path: '*', element: <><Sidebar items={items} footer={<span>Ana Souza</span>} /><main>conteúdo</main></> }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

const tabs = () => screen.getByRole('navigation', { name: 'Atalhos' })
const drawer = () => document.getElementById('sb-rail')!

afterEach(() => vi.unstubAllGlobals())

describe('navegação no celular', () => {
  beforeEach(() => phone(true))

  it('barra de abas: Início, Agenda, Reservas, Clientes e Mais', () => {
    setup()
    const t = within(tabs())
    expect(t.getAllByRole('link').map((l) => l.textContent)).toEqual(['Início', 'Agenda', 'Reservas', 'Clientes'])
    expect(t.getByRole('button', { name: 'Mais' })).toBeInTheDocument()
    expect(t.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
  })

  it('sem permissão para um atalho preferido, completa com o próximo item da sidebar', () => {
    setup('/', ITEMS.filter((n) => n.to !== '/agenda'))
    expect(within(tabs()).getAllByRole('link').map((l) => l.textContent)).toEqual(['Início', 'Reservas', 'Clientes', 'Provas'])
  })

  it('tela fora dos atalhos acende o Mais', () => {
    setup('/financeiro')
    expect(within(tabs()).getByRole('button', { name: 'Mais' })).toHaveAttribute('data-on', 'true')
    expect(within(tabs()).queryByRole('link', { current: 'page' })).toBeNull()
  })

  it('gaveta fechada fica inerte; o menu abre, foca o primeiro link e Escape fecha devolvendo o foco', async () => {
    setup('/reservas')
    expect(drawer()).toHaveAttribute('inert')
    const menu = screen.getByRole('button', { name: 'Abrir menu' })
    await userEvent.click(menu)
    expect(drawer()).not.toHaveAttribute('inert')
    expect(drawer()).toHaveAttribute('data-open', 'true')
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(within(drawer()).getByRole('link', { name: 'Dashboard' })).toHaveFocus()
    expect(within(drawer()).getByText('Ana Souza')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(drawer()).toHaveAttribute('inert')
    expect(menu).toHaveFocus()
  })

  it('escolher um destino na gaveta fecha a gaveta e navega', async () => {
    setup('/')
    await userEvent.click(within(tabs()).getByRole('button', { name: 'Mais' }))
    await userEvent.click(within(drawer()).getByRole('link', { name: 'Acervo' }))
    expect(drawer()).toHaveAttribute('inert')
    expect(within(drawer()).getByRole('link', { name: 'Acervo' })).toHaveAttribute('aria-current', 'page')
  })

  it('botão Fechar menu fecha a gaveta', async () => {
    setup('/')
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar menu' }))
    expect(drawer()).toHaveAttribute('inert')
  })
})

describe('navegação no computador', () => {
  it('sem barra do topo, sem abas e sidebar sempre acessível', () => {
    phone(false)
    setup('/')
    expect(screen.queryByRole('navigation', { name: 'Atalhos' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).toBeNull()
    expect(drawer()).not.toHaveAttribute('inert')
  })
})
