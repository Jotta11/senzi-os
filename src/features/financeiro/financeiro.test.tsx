import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import type { DataSource } from '@/data/source'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { previewRoutes } from '@/preview/previewRoutes'
import { BarList, ColumnChart, LineChart } from './charts'

const TODAY = '2026-10-24'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })

function renderPreview(path: string, source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}
const nav = () => within(screen.getByRole('navigation', { name: /navegação principal/i }))
const ATENDIMENTO = '?como=atendimento'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T15:00:00Z') })
})
afterEach(() => vi.useRealTimers())

describe('Financeiro — submenu e perfis', () => {
  it('Administrador vê os 4 subitens na sidebar e as abas no topo', async () => {
    renderPreview('/preview/financeiro')
    expect(await screen.findByRole('heading', { level: 1, name: 'Financeiro' })).toBeInTheDocument()
    for (const n of ['Visão geral', 'Contas a Receber', 'Contas a Pagar', 'Categorias']) {
      expect(nav().getByRole('link', { name: n })).toBeInTheDocument()
    }
    expect(nav().getByRole('link', { name: 'Financeiro' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Seções do Financeiro' })).toBeInTheDocument()
  })

  it('subitem ativo recebe o destaque quando a rota é uma subpágina; fora do Financeiro não há subitens', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/receber')
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas a Receber' })).toBeInTheDocument()
    expect(nav().getByRole('link', { name: 'Contas a Receber' })).toHaveAttribute('aria-current', 'page')
    expect(nav().getByRole('link', { name: 'Financeiro' })).not.toHaveAttribute('aria-current')
    await user.click(nav().getByRole('link', { name: 'Operação' }))
    expect(nav().queryByRole('link', { name: 'Contas a Pagar' })).toBeNull()
  })

  it('Atendimento vê a Visão geral reduzida: sem Pago, Resultado, Custo, Margem, Investido, subitens nem abas', async () => {
    renderPreview(`/preview/financeiro${ATENDIMENTO}`)
    expect(await screen.findByText('Recebido')).toBeInTheDocument()
    const tiles = within(screen.getByRole('list', { name: 'Resumo financeiro' }))
    expect(tiles.getByText('A receber')).toBeInTheDocument()
    expect(tiles.getByText('Caução em custódia')).toBeInTheDocument()
    for (const t of ['Pago', 'Resultado', 'Custo operacional', 'Margem operacional', 'Investido em acervo']) expect(screen.queryByText(t)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Formas de pagamento' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Últimos lançamentos' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'Contas a Pagar' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Seções do Financeiro' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Ver contas a pagar' })).toBeNull()
    expect(screen.queryByText('Vencendo nos próximos 7 dias')).toBeNull()
  })

  it('Atendimento em /financeiro/pagar vê o acesso restrito', async () => {
    renderPreview(`/preview/financeiro/pagar${ATENDIMENTO}`)
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
    expect(screen.queryByText('Nova despesa')).toBeNull()
  })
})

describe('Financeiro — Visão geral', () => {
  it('trocar o período muda o subtítulo e fica na URL', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { router } = renderPreview('/preview/financeiro')
    expect(await screen.findByText(/recebidos nos últimos 90 dias · R\$\s[\d.]+ a receber/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '30 dias' }))
    expect(await screen.findByText(/recebidos nos últimos 30 dias/)).toBeInTheDocument()
    expect(router.state.location.search).toBe('?periodo=30')
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Administrador vê os 8 tiles, o gráfico mensal e a lista dos próximos 7 dias', async () => {
    renderPreview('/preview/financeiro')
    const tiles = within(await screen.findByRole('list', { name: 'Resumo financeiro' }))
    for (const t of ['Recebido', 'A receber', 'Caução em custódia', 'Pago', 'Resultado', 'Custo operacional', 'Margem operacional', 'Investido em acervo']) {
      expect(tiles.getByText(t)).toBeInTheDocument()
    }
    expect(screen.getByRole('figure', { name: 'Faturamento recebido por mês, últimos 12 meses' })).toBeInTheDocument()
    expect(await screen.findByText('Vencendo nos próximos 7 dias')).toBeInTheDocument()
    expect(await screen.findByText('Aluguel do espaço para ensaio fotográfico')).toBeInTheDocument()
  })
})

describe('Financeiro — Contas a Receber', () => {
  it('parcela de reserva abre "Lançar pagamento" com tipo e valor da parcela', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/receber')
    const table = await screen.findByRole('table', { name: 'Contas a receber' })
    const row = within(table).getAllByRole('row').find((r) => /Saldo · RS-/.test(r.textContent ?? ''))!
    await user.click(within(row).getByRole('button', { name: /Registrar pagamento/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Lançar pagamento' })
    expect(within(dlg).getByLabelText('Tipo')).toHaveValue('saldo')
    expect(Number((within(dlg).getByLabelText('Valor (R$)') as HTMLInputElement).value)).toBeGreaterThan(0)
  })

  it('lançamento avulso: receber dá baixa e sai de "Em aberto"', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/receber')
    const table = await screen.findByRole('table', { name: 'Contas a receber' })
    await user.click(within(table).getByRole('button', { name: 'Receber · Consultoria de styling — evento corporativo' }))
    const dlg = await screen.findByRole('dialog', { name: 'Receber' })
    await user.click(within(dlg).getByRole('button', { name: 'Confirmar recebimento' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Recebimento registrado')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Consultoria de styling — evento corporativo')).toBeNull())
  })

  it('Novo lançamento sem descrição mostra o erro no campo', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/receber')
    await user.click(await screen.findByRole('button', { name: 'Novo lançamento' }))
    const dlg = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText('Informe a descrição.')).toBeInTheDocument()
    expect(within(dlg).getByText('Escolha a categoria.')).toBeInTheDocument()
  })
})

describe('Financeiro — Contas a Pagar', () => {
  it('"Nova despesa" sem descrição mostra "Informe a descrição." no campo', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/pagar')
    await user.click(await screen.findByRole('button', { name: 'Nova despesa' }))
    const dlg = await screen.findByRole('dialog', { name: 'Nova despesa' })
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText('Informe a descrição.')).toBeInTheDocument()
    expect(within(dlg).getByLabelText('Descrição')).toHaveAttribute('aria-invalid', 'true')
  })

  it('pagar a conta vencida a tira da aba "Vencidas"', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/pagar')
    await user.click(await screen.findByRole('button', { name: 'Vencidas' }))
    const table = await screen.findByRole('table', { name: 'Contas a pagar' })
    expect(within(table).getByText('Cabides e capas protetoras')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Pagar · Cabides e capas protetoras' }))
    const dlg = await screen.findByRole('dialog', { name: 'Pagar' })
    await user.click(within(dlg).getByRole('button', { name: 'Confirmar pagamento' }))
    expect(await screen.findByText('Pagamento registrado')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Cabides e capas protetoras')).toBeNull())
  })

  it('despesa automática é marcada e não tem "Editar" nem "Excluir"', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/pagar')
    await user.click(await screen.findByRole('button', { name: 'Todas' }))
    const table = await screen.findByRole('table', { name: 'Contas a pagar' })
    const row = within(table).getAllByRole('row').find((r) => within(r).queryByText('Automática'))!
    expect(row).toBeTruthy()
    expect(within(row).queryByRole('button', { name: /Editar/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: /Excluir/ })).toBeNull()
    const manual = within(table).getAllByRole('row').find((r) => /Cabides/.test(r.textContent ?? ''))!
    expect(within(manual).getByRole('button', { name: /Editar/ })).toBeInTheDocument()
  })

  it('excluir pede confirmação e remove a despesa', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/pagar')
    const table = await screen.findByRole('table', { name: 'Contas a pagar' })
    await user.click(within(table).getByRole('button', { name: 'Excluir · Cabides e capas protetoras' }))
    const dlg = await screen.findByRole('dialog', { name: 'Excluir despesa' })
    expect(within(dlg).getByText('Excluir "Cabides e capas protetoras"? Esta ação não pode ser desfeita.')).toBeInTheDocument()
    await user.click(within(dlg).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(screen.queryByText('Cabides e capas protetoras')).toBeNull())
  })
})

describe('Financeiro — Categorias', () => {
  it('categoria de sistema tem a pill "Sistema" e não tem "Excluir"', async () => {
    renderPreview('/preview/financeiro/categorias')
    const receitas = await screen.findByRole('region', { name: 'Receitas' })
    const loc = (await within(receitas).findByText('Locação')).closest('.fx-cat') as HTMLElement
    expect(within(loc).getByText('Sistema')).toBeInTheDocument()
    expect(within(loc).queryByRole('button')).toBeNull()
    expect(screen.getByText(/\d+ categoria\(s\)/)).toBeInTheDocument()
  })

  it('nova categoria sem nome mostra "Informe o nome."; com nome aparece na lista', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderPreview('/preview/financeiro/categorias')
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    const dlg = await screen.findByRole('dialog', { name: 'Nova categoria' })
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText('Informe o nome.')).toBeInTheDocument()
    await user.type(within(dlg).getByLabelText('Nome'), 'Brindes')
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Brindes')).toBeInTheDocument()
  })
})

describe('gráficos', () => {
  const fmt = (n: number) => `R$ ${n}`
  it('LineChart, BarList e ColumnChart expõem os valores como texto acessível', () => {
    render(
      <MemoryRouter>
        <LineChart ariaLabel="Linha" format={fmt} points={[{ label: 'jan', value: 10 }, { label: 'fev', value: 30 }]} />
        <BarList format={fmt} rows={[{ label: 'PIX', value: 50, note: '2×', href: '/x' }, { label: 'Dinheiro', value: 25 }]} />
        <ColumnChart ariaLabel="Colunas" format={fmt} columns={[{ label: 'a', value: 1 }, { label: 'b', value: 2 }]} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('figure', { name: 'Linha' })).toBeInTheDocument()
    expect(screen.getByText('fev: R$ 30')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PIX' })).toHaveAttribute('href', '/x')
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Colunas' })).toBeInTheDocument()
    expect(screen.getByText('b: R$ 2')).toBeInTheDocument()
  })
})
