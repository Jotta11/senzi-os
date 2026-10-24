import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { vi } from 'vitest'
import type { Perm } from '@/auth/permissions'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { previewRoutes } from '@/preview/previewRoutes'
import { AppPathContext } from '@/shell/appPath'
import { CustomerPage } from './CustomerPage'

const newSource = () => createMockSource({ latencyMs: 0, today: '2026-10-23' })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

/** Pela árvore real da prévia (rota registrada em previewRoutes). */
function renderPreview(path: string, source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}

function Peca() {
  return <p>Peça {useParams().id}</p>
}

/** Só a ficha, com permissões revogáveis. */
function renderPage({ id = 'cl-0001', revoke, source = newSource() }: { id?: string; revoke?: Perm[]; source?: DataSource } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/preview/clientes/:id', element: <CustomerPage /> },
      { path: '/preview/acervo/:id', element: <Peca /> },
    ],
    { initialEntries: [`/preview/clientes/${id}`] },
  )
  render(
    <QueryClientProvider client={newClient()}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider initialRole="admin" revoke={revoke}>
          <AppPathContext.Provider value="/preview">
            <RouterProvider router={router} />
          </AppPathContext.Provider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
  return { router, source }
}

beforeEach(() => {
  localStorage.clear()
  // Relógio fixo (só Date): a idade na ficha não depende de quando a suíte roda.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('Ficha da cliente', () => {
  it('cabeçalho, cartão lateral com idade, telefone mascarado e WhatsApp', async () => {
    renderPreview('/preview/clientes/cl-0001')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mariana Fontes Ribeiro' })).toBeInTheDocument()
    const sub = screen.getByText((_, el) => el?.tagName === 'P' && /^CL-0001 · cliente desde \d{2}\/\d{2}\/\d{4}( · VIP)?$/.test(el.textContent ?? ''))
    expect(sub).toBeInTheDocument()
    const side = screen.getByRole('complementary', { name: 'Resumo da cliente' })
    expect(within(side).getByText('Palmas · TO · 32 anos')).toBeInTheDocument()
    const wa = within(side).getByRole('link', { name: /\(63\) 99612-4478/ })
    expect(wa).toHaveAttribute('href', 'https://wa.me/5563996124478')
    expect(wa).toHaveAttribute('target', '_blank')
    expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(side).getByText('529.982.247-25')).toBeInTheDocument()
    expect(await within(side).findByRole('link', { name: /Vestido Verona/ })).toHaveAttribute('href', '/preview/acervo/sz-0107')
    expect(screen.getByRole('heading', { name: 'Perfil Senzi' })).toBeInTheDocument()
    expect(screen.getAllByText('Total gasto').length).toBeGreaterThan(0)
  })

  it('sem cliente.edit o CPF aparece parcialmente oculto; sem financeiro.view não há dinheiro', async () => {
    renderPage({ revoke: ['cliente.edit', 'financeiro.view'] })
    const side = await screen.findByRole('complementary', { name: 'Resumo da cliente' })
    expect(within(side).getByText('***.982.247-**')).toBeInTheDocument()
    expect(screen.queryByText('Total gasto')).toBeNull()
    expect(screen.queryByText('Ticket médio')).toBeNull()
    expect(screen.queryByText('Orçamento')).toBeNull()
    // preço de locação das sugestões é público; dinheiro da cliente não aparece no cartão, números nem perfil
    expect(within(side).queryByText(/R\$/)).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Perfil Senzi' })).queryByText(/R\$/)).toBeNull()
    expect(within(screen.getByLabelText('Números da cliente')).queryByText(/R\$/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('observação vazia mostra "Escreva a observação." sem chamar a fonte', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'addNote')
    renderPage({ source })
    await user.click(await screen.findByRole('button', { name: 'Observação' }))
    const dialog = screen.getByRole('dialog', { name: 'Registrar observação' })
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }))
    expect(within(dialog).getByText('Escreva a observação.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('observação fixada aparece em "Lembre-se ao atender" e na memória', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'addNote')
    renderPage({ source })
    await user.click(await screen.findByRole('button', { name: 'Observação' }))
    const dialog = screen.getByRole('dialog', { name: 'Registrar observação' })
    await user.type(within(dialog).getByLabelText('O que a equipe precisa lembrar'), 'Alérgica a lã.')
    await user.selectOptions(within(dialog).getByLabelText('Canal'), 'whatsapp')
    await user.click(within(dialog).getByLabelText('Fixar no topo da ficha'))
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spy).toHaveBeenCalledWith('cl-0001', 'Alérgica a lã.', 'whatsapp', true)
    const remember = screen.getByRole('region', { name: 'Lembre-se ao atender' })
    expect(within(remember).getByText('Alérgica a lã.')).toBeInTheDocument()
    const memoria = screen.getByRole('tabpanel')
    expect(within(memoria).getByText('Alérgica a lã.')).toBeInTheDocument()
  })

  it('desafixar tira a observação de "Lembre-se ao atender"', async () => {
    const user = userEvent.setup()
    renderPage()
    const remember = await screen.findByRole('region', { name: 'Lembre-se ao atender' })
    expect(within(remember).getByText(/Trabalha até 18h30/)).toBeInTheDocument()
    const memoria = screen.getByRole('tabpanel')
    const item = within(memoria).getByText(/Trabalha até 18h30/).closest('li')!
    await user.click(within(item).getByRole('button', { name: 'Desafixar' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Lembre-se ao atender' })).queryByText(/Trabalha até 18h30/)).toBeNull())
  })

  it('atualizar medidas cria nova versão: histórico ganha uma linha e a atual muda', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'addMeasurement')
    renderPage({ source })
    await user.click(await screen.findByRole('tab', { name: /Medidas/ }))
    const table = await screen.findByRole('table', { name: 'Histórico de medidas' })
    const before = within(table).getAllByRole('row').length - 1
    expect(before).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Atualizar' }))
    const dialog = screen.getByRole('dialog', { name: 'Atualizar medidas' })
    const waist = within(dialog).getByLabelText('Cintura (cm)')
    expect(waist).toHaveValue(68)
    await user.clear(waist)
    await user.type(waist, '999')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar medidas' }))
    expect(within(dialog).getByText('Informe um valor entre 0 e 300 cm.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
    await user.clear(waist)
    await user.type(waist, '70')
    await user.type(within(dialog).getByLabelText('Observação'), 'Medida na prova')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar medidas' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spy).toHaveBeenCalledWith('cl-0001', expect.objectContaining({ waistCm: 70, bustCm: 88, usualSize: 'M', notes: 'Medida na prova' }))
    const after = await screen.findByRole('table', { name: 'Histórico de medidas' })
    await waitFor(() => expect(within(after).getAllByRole('row').length - 1).toBe(3))
    expect(within(after).getByText(/Medida na prova/)).toBeInTheDocument()
  })

  it('sugestões mostram motivos e linkam para /preview/acervo/:id', async () => {
    const source = newSource()
    const recs = await source.recommend('cl-0001', 8)
    expect(recs.length).toBeGreaterThan(0)
    renderPage({ source })
    const box = await screen.findByRole('region', { name: 'Sugestões para ela' })
    const first = recs[0]!
    const link = await within(box).findByRole('link', { name: new RegExp(first.garment.name) })
    expect(link).toHaveAttribute('href', `/preview/acervo/${first.garment.id}`)
    expect(within(link).getByText(first.reasons[0]!)).toBeInTheDocument()
    expect(within(box).getAllByRole('link').length).toBe(Math.min(8, recs.length))
  })

  it('sem medidas nem preferências: texto de sugestões vazio', async () => {
    const source = newSource()
    vi.spyOn(source, 'recommend').mockResolvedValue([])
    renderPage({ source })
    const box = await screen.findByRole('region', { name: 'Sugestões para ela' })
    expect(await within(box).findByText('Cadastre medidas ou preferências para receber sugestões.')).toBeInTheDocument()
  })

  it('erro ao carregar sugestões mostra mensagem com "Tentar de novo" (sem esqueleto eterno)', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'recommend').mockRejectedValueOnce(new Error('falhou'))
    renderPage({ source })
    const box = await screen.findByRole('region', { name: 'Sugestões para ela' })
    expect(await within(box).findByText('Não foi possível carregar as sugestões.')).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(box).findAllByRole('link')).not.toHaveLength(0)
    expect(within(box).queryByText('Não foi possível carregar as sugestões.')).toBeNull()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('remover favorito some da aba Favoritos', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'setFavorite')
    renderPage({ source })
    await user.click(await screen.findByRole('tab', { name: /Favoritos/ }))
    const panel = screen.getByRole('tabpanel')
    expect(await within(panel).findByText('Vestido Firenze')).toBeInTheDocument()
    const card = within(panel).getByText('Vestido Firenze').closest('article')!
    await user.click(within(card).getByRole('button', { name: /Remover/ }))
    expect(spy).toHaveBeenCalledWith('cl-0001', expect.any(String), false)
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).queryByText('Vestido Firenze')).toBeNull())
    expect(within(screen.getByRole('tabpanel')).getByText('Vestido Verona')).toBeInTheDocument()
  })

  it('sem cliente.edit não há "Remover" nos favoritos nem "Atualizar" nas medidas', async () => {
    const user = userEvent.setup()
    renderPage({ revoke: ['cliente.edit'] })
    await user.click(await screen.findByRole('tab', { name: /Favoritos/ }))
    expect(await within(screen.getByRole('tabpanel')).findByText('Vestido Verona')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
    await user.click(screen.getByRole('tab', { name: /Medidas/ }))
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull()
  })

  it('?aba=medidas abre a aba de medidas e clicar em outra aba atualiza a URL', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/clientes/cl-0001?aba=medidas')
    expect(await screen.findByRole('heading', { name: 'Perfil corporal' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Favoritos/ }))
    expect(router.state.location.search).toBe('?aba=favoritos')
  })

  it('Editar abre o cadastro em modo edição', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(screen.getByRole('dialog', { name: 'Editar cliente' })).toBeInTheDocument()
  })

  it('id inexistente → "Cliente não encontrada"', async () => {
    renderPreview('/preview/clientes/cl-9999')
    expect(await screen.findByText('Cliente não encontrada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar às clientes' })).toHaveAttribute('href', '/preview/clientes')
  })
})
