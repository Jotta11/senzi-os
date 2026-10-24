import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
import { addDays, todayISO } from '@/lib/format'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { MonthGrid } from './CalendarPane'
import { previewRoutes } from '@/preview/previewRoutes'

// a fonte usa o mesmo "hoje" da tela (datas padrão do bloqueio, calendário)
const TODAY = todayISO()
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderPreview(path: string, source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}

const verAtendimento = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Atendimento' }))
const tabs = () => within(screen.getByRole('tablist', { name: 'Ficha da peça' })).getAllByRole('tab').map((t) => t.textContent)

beforeEach(() => localStorage.clear())

describe('Ficha da peça', () => {
  it('cabeçalho com código · categoria · marca; admin vê 5 abas, atendimento 4 (sem Financeiro)', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107')
    expect(await screen.findByRole('heading', { level: 1, name: 'Vestido Verona' })).toBeInTheDocument()
    expect(screen.getByText('SZ-0107 · Vestido longo · PatBO')).toBeInTheDocument()
    expect(tabs()).toEqual(['Calendário', 'Fotos', 'Histórico', 'Financeiro', 'Caimento e medidas'])
    expect(screen.getByRole('button', { name: 'Bloquear' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()

    await verAtendimento(user)
    expect(tabs()).toEqual(['Calendário', 'Fotos', 'Histórico', 'Caimento e medidas'])
    // ruling: atendimento tem acervo.block e acervo.edit
    expect(screen.getByRole('button', { name: 'Bloquear' })).toBeInTheDocument()
  })

  it('cartão lateral: preço, próximo compromisso e ficha técnica', async () => {
    renderPreview('/preview/acervo/sz-0107')
    const side = await screen.findByRole('complementary', { name: 'Resumo da peça' })
    expect(within(side).getByText('R$ 890')).toBeInTheDocument()
    expect(within(side).getByText(/Próximo compromisso/)).toBeInTheDocument()
    expect(within(side).getByText('38 (M)')).toBeInTheDocument()
    expect(await within(side).findByText('3 dias de higienização')).toBeInTheDocument()
  })

  it('faixa de números: admin vê locações, receita, resultado e payback; atendimento só disponibilidade', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107')
    expect(await screen.findByRole('link', { name: /Reservar/ })).toBeInTheDocument()
    const band = () => document.querySelector('.gp-kpis') as HTMLElement
    await waitFor(() => expect(band().getAttribute('aria-busy')).toBeNull())
    const labels = () => within(band()).getAllByRole('term').map((t) => t.textContent)
    expect(labels()).toEqual(['Locações', 'Receita', 'Resultado', 'Payback'])
    expect(within(band()).getByText(/^média R\$/)).toBeInTheDocument()

    await verAtendimento(user)
    expect(labels()).toEqual(['Dias livres', 'Próximo compromisso', 'Higienização'])
    expect(within(band()).queryByText(/R\$/)).toBeNull()
  })

  it('?aba=medidas abre a aba de caimento; Financeiro só com acervo.cost', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/acervo/sz-0107?aba=medidas')
    expect(await screen.findByRole('heading', { name: 'Caimento observado' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Medidas da peça' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Financeiro' }))
    expect(router.state.location.search).toBe('?aba=financeiro')
    expect(await screen.findByRole('heading', { name: 'Economia da peça' })).toBeInTheDocument()
    expect(screen.getByText('Receita acumulada')).toBeInTheDocument()
  })

  it('Financeiro de peça sem locações: payback "—" e nota de receita/despesas', async () => {
    renderPreview('/preview/acervo/sz-0268?aba=financeiro') // Turim: nunca alugada no mundo fictício
    expect(await screen.findByText('Receita e despesas aparecem quando reservas e manutenções estiverem ativas.')).toBeInTheDocument()
    expect(screen.queryByText(/0,0×/)).toBeNull()
  })

  it('id inexistente → "Peça não encontrada"', async () => {
    renderPreview('/preview/acervo/sz-9999')
    expect(await screen.findByText('Peça não encontrada')).toBeInTheDocument()
    expect(screen.getByText('Pode ter sido removida do acervo.')).toBeInTheDocument()
  })

  it('editar caimento atualiza o card', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107?aba=medidas')
    const card = (await screen.findByRole('heading', { name: 'Caimento observado' })).closest('section')!
    await user.click(within(card).getByRole('button', { name: 'Atualizar' }))
    const dialog = screen.getByRole('dialog', { name: 'Caimento observado' })
    await user.selectOptions(within(dialog).getByLabelText('Como veste'), 'maior')
    const bust = within(dialog).getByLabelText('Busto confortável até (cm)')
    await user.clear(bust)
    await user.type(bust, '400')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialog).findByText('Informe um valor entre 0 e 300 cm.')).toBeInTheDocument()
    await user.clear(bust)
    await user.type(bust, '96')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(card).getByText(/Veste maior que a etiqueta/)).toBeInTheDocument()
    expect(within(card).getByText('96 cm')).toBeInTheDocument()
  })

  it('medidas: sobra de barra acima de 20 cm mostra erro no campo e não grava', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'updateMeasurement')
    renderPreview('/preview/acervo/sz-0107?aba=medidas', source)
    const card = (await screen.findByRole('heading', { name: 'Medidas da peça' })).closest('section')!
    await user.click(within(card).getByRole('button', { name: 'Atualizar' }))
    const dialog = screen.getByRole('dialog', { name: 'Medidas da peça' })
    const hem = within(dialog).getByLabelText('Sobra de barra (cm)')
    await user.clear(hem)
    await user.type(hem, '25')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialog).findByText('Informe um valor entre 0 e 20 cm.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('bloquear período sobreposto mostra "A peça já tem compromisso nesse período."', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107')
    await user.click(await screen.findByRole('button', { name: 'Bloquear' }))
    const dialog = screen.getByRole('dialog', { name: 'Bloquear peça' })
    expect(within(dialog).getByLabelText('De')).toHaveValue(TODAY)
    expect(within(dialog).getByLabelText('Até')).toHaveValue(addDays(TODAY, 3))
    await user.clear(within(dialog).getByLabelText('De'))
    await user.type(within(dialog).getByLabelText('De'), addDays(TODAY, 7)) // locação do Verona: hoje+6 a hoje+9
    await user.clear(within(dialog).getByLabelText('Até'))
    await user.type(within(dialog).getByLabelText('Até'), addDays(TODAY, 8))
    await user.click(within(dialog).getByRole('button', { name: 'Bloquear' }))
    expect(await within(dialog).findByText('A peça já tem compromisso nesse período.')).toBeInTheDocument()
  })

  it('remover bloqueio manual some da tabela de compromissos', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107')
    const table = await screen.findByRole('table', { name: 'Compromissos futuros' })
    expect(within(table).getByText('Separada para prova de noiva')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: /Remover/ }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Compromissos futuros' })).queryByText('Separada para prova de noiva')).toBeNull())
    expect(within(screen.getByRole('table', { name: 'Compromissos futuros' })).getByText('Higienização pós-uso')).toBeInTheDocument()
    // a locação do Verona (hoje+6 a hoje+9) continua na agenda da peça
    expect(within(screen.getByRole('table', { name: 'Compromissos futuros' })).getAllByRole('cell', { name: 'Locação' }).length).toBeGreaterThan(0)
  })

  it('enviar foto mostra miniatura; arquivo que não é imagem mostra erro', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderPreview('/preview/acervo/sz-0107?aba=fotos')
    const input = await screen.findByLabelText('Enviar fotos')
    await user.upload(input, new File(['x'], 'nota.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText('Envie apenas imagens (JPG, PNG, WEBP…).')).toBeInTheDocument()
    await user.upload(input, new File(['x'], 'frente.jpg', { type: 'image/jpeg' }))
    const grid = await screen.findByRole('list', { name: 'Fotos da peça' })
    expect(within(grid).getAllByRole('img')).toHaveLength(1)
    expect(within(grid).getByText('Capa')).toBeInTheDocument()
    // a capa vai para o cartão lateral
    expect(within(screen.getByRole('complementary', { name: 'Resumo da peça' })).getByRole('img', { name: /Vestido Verona/ }).tagName).toBe('IMG')
  })

  it('no máximo 10 fotos por peça', async () => {
    const user = userEvent.setup()
    renderPreview('/preview/acervo/sz-0107?aba=fotos')
    const input = await screen.findByLabelText('Enviar fotos')
    const files = Array.from({ length: 11 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }))
    await user.upload(input, files)
    expect(await screen.findByText('Limite de 10 fotos por peça.')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Fotos da peça' })).getAllByRole('listitem')).toHaveLength(10))
  })

  it('atendimento edita a peça sem ver campos de custo', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'updateGarment')
    renderPreview('/preview/acervo/sz-0107', source)
    await screen.findByRole('heading', { level: 1, name: 'Vestido Verona' })
    await verAtendimento(user)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar peça' })
    expect(within(dialog).queryByLabelText('Custo de aquisição (R$)')).toBeNull()
    expect(within(dialog).queryByLabelText('Valor de referência (R$)')).toBeNull()
    const nome = within(dialog).getByLabelText('Nome / modelo *')
    await user.clear(nome)
    await user.type(nome, 'Vestido Verona II')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Vestido Verona II' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
    const patch = spy.mock.calls[0]![1]
    expect(patch).not.toHaveProperty('acquisitionCost')
    expect(patch).not.toHaveProperty('retailReference')
  })
})

describe('Calendário — semana começa na segunda', () => {
  const cells = (c: HTMLElement) => [...c.querySelectorAll('.gp-cal > div')].slice(7)
  it('cabeçalho seg…dom; 1º/10/2026 (quinta) na 4ª coluna; 1º/11/2026 (domingo) na 7ª', () => {
    const { container } = render(<MonthGrid month={{ y: 2026, m: 9 }} blocks={[]} today="2026-10-23" />)
    const dows = [...container.querySelectorAll('.gp-cal > .dow')].map((d) => d.textContent)
    expect(dows).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'])
    const out = cells(container)
    expect(out.findIndex((d) => d.textContent?.startsWith('1'))).toBe(3)
    expect(out.slice(0, 3).every((d) => d.classList.contains('pad'))).toBe(true)

    const nov = render(<MonthGrid month={{ y: 2026, m: 10 }} blocks={[]} today="2026-10-23" />).container
    expect(cells(nov).findIndex((d) => d.textContent?.startsWith('1'))).toBe(6)
  })
})

describe('Nova peça', () => {
  it('?nova=1 abre o formulário; sem preço mostra "Informe o valor da locação." sem gravar', async () => {
    const user = userEvent.setup()
    const source = newSource()
    const spy = vi.spyOn(source, 'createGarment')
    const { router } = renderPreview('/preview/acervo?nova=1', source)
    const dialog = await screen.findByRole('dialog', { name: 'Nova peça' })
    expect(within(dialog).getByText('O código é gerado automaticamente na sequência do acervo')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Custo de aquisição (R$)')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome / modelo *'), 'Vestido Lucca')
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar peça' }))
    expect(await within(dialog).findByText('Informe o valor da locação.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.search).toBe('')
  })

  it('"Nova peça" na lista abre o modal; peça válida navega para a nova ficha SZ-0297', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/acervo')
    await user.click(await screen.findByRole('button', { name: 'Nova peça' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova peça' })
    await user.type(within(dialog).getByLabelText('Nome / modelo *'), 'Vestido Lucca')
    await user.type(within(dialog).getByLabelText('Valor da locação (R$) *'), '650')
    await user.type(within(dialog).getByLabelText('Cor'), 'Azul petróleo')
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar peça' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/preview/acervo/sz-0297'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Vestido Lucca' })).toBeInTheDocument()
    expect(screen.getByText(/^SZ-0297 · /)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('voltar depois de cadastrar não reabre o formulário "Nova peça"', async () => {
    const user = userEvent.setup()
    const { router } = renderPreview('/preview/acervo')
    await user.click(await screen.findByRole('button', { name: 'Nova peça' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova peça' })
    await user.type(within(dialog).getByLabelText('Nome / modelo *'), 'Vestido Lucca')
    await user.type(within(dialog).getByLabelText('Valor da locação (R$) *'), '650')
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar peça' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/preview/acervo/sz-0297'))
    await router.navigate(-1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/preview/acervo'))
    expect(router.state.location.search).toBe('')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('Lista — payback', () => {
  it('peça sem locações mostra "—" no Payback (não "0,0×")', async () => {
    renderPreview('/preview/acervo?view=lista&q=turim')
    const table = await screen.findByRole('table', { name: 'Peças do acervo' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2))
    await waitFor(() => expect(within(table).getAllByRole('row')[1]!.textContent).toMatch(/R\$\s0/))
    expect(table.textContent).not.toMatch(/0,0×/)
  })
})
