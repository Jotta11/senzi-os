import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockSource } from '@/data/mockSource'
import { DataSourceProvider, type DataSource } from '@/data/source'
import type { Customer } from '@/data/types'
import { PreviewLayout } from '@/preview/PreviewLayout'
import { PreviewPermissionsProvider } from '@/preview/PreviewPermissions'
import { previewRoutes } from '@/preview/previewRoutes'
import { AppPathContext } from '@/shell/appPath'
import { CustomerForm } from './CustomerForm'

const newSource = () => createMockSource({ latencyMs: 0, today: '2026-10-23' })
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderNova(path = '/preview/clientes?nova=1', source: DataSource = newSource()) {
  const router = createMemoryRouter(
    [{ path: '/preview', element: <PreviewLayout source={source} queryClient={newClient()} />, children: previewRoutes.children }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, source }
}

function renderEdit(customer: Customer, source: DataSource, onClose = vi.fn()) {
  const router = createMemoryRouter([{ path: '/', element: <CustomerForm open customer={customer} onClose={onClose} /> }])
  render(
    <QueryClientProvider client={newClient()}>
      <DataSourceProvider source={source}>
        <PreviewPermissionsProvider>
          <AppPathContext.Provider value="/preview">
            <RouterProvider router={router} />
          </AppPathContext.Provider>
        </PreviewPermissionsProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
  return { onClose }
}

const dialog = (name = 'Nova cliente') => screen.findByRole('dialog', { name })
const input = (dlg: HTMLElement, label: RegExp) => within(dlg).getByLabelText(label) as HTMLInputElement
/** Mensagem de erro associada ao campo (aria-describedby). */
const errorOf = (el: HTMLElement) => {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  return ids.map((id) => document.getElementById(id)?.textContent).join(' ')
}

async function fillRequired(dlg: HTMLElement, { cpf = '390.533.447-05' } = {}) {
  const user = userEvent.setup()
  await user.type(input(dlg, /^Nome completo/), 'Helena Prado Teste')
  await user.type(input(dlg, /^Telefone/), '63981234567')
  fireEvent.change(input(dlg, /^Data de nascimento/), { target: { value: '1995-08-14' } })
  await user.type(input(dlg, /^CPF/), cpf)
  return user
}

describe('Cadastro de cliente', () => {
  it('seções e subtítulo; submit vazio mostra as 4 mensagens obrigatórias e não chama a fonte', async () => {
    const src = newSource()
    const create = vi.spyOn(src, 'createCustomer')
    renderNova(undefined, src)
    const dlg = await dialog()
    expect(within(dlg).getByText('Nome, telefone, nascimento e CPF são obrigatórios.')).toBeInTheDocument()
    for (const s of ['Dados', 'Modelo ideal', 'Perfil corporal', 'Preferências']) {
      expect(within(dlg).getByRole('group', { name: s })).toBeInTheDocument()
    }
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cadastrar cliente' }))
    expect(errorOf(input(dlg, /^Nome completo/))).toBe('Informe o nome completo da cliente.')
    expect(errorOf(input(dlg, /^Telefone/))).toBe('Informe um telefone com DDD.')
    expect(errorOf(input(dlg, /^Data de nascimento/))).toBe('Informe a data de nascimento (não pode ser no futuro).')
    expect(errorOf(input(dlg, /^CPF/))).toBe('CPF inválido.')
    expect(create).not.toHaveBeenCalled()
  })

  it('máscaras de telefone e CPF enquanto digita', async () => {
    renderNova()
    const dlg = await dialog()
    await userEvent.type(input(dlg, /^Telefone/), '63996124478')
    expect(input(dlg, /^Telefone/).value).toBe('(63) 99612-4478')
    await userEvent.type(input(dlg, /^CPF/), '52998224725')
    expect(input(dlg, /^CPF/).value).toBe('529.982.247-25')
  })

  it('Enter na busca do modelo ideal não envia o cadastro', async () => {
    const src = newSource()
    const create = vi.spyOn(src, 'createCustomer')
    renderNova(undefined, src)
    const dlg = await dialog()
    await userEvent.type(within(dlg).getByRole('searchbox', { name: 'Buscar peça do acervo' }), 'verona{Enter}')
    await within(dlg).findByRole('button', { name: /SZ-0107.*Vestido Verona/ })
    expect(create).not.toHaveBeenCalled()
    expect(errorOf(input(dlg, /^Nome completo/))).toBe('')
    expect(errorOf(input(dlg, /^CPF/))).toBe('Exigido no contrato') // só a dica, sem erro
    expect(within(dlg).queryAllByRole('alert')).toHaveLength(0)
  })

  it('telefone colado com DDI (+55) perde o 55', async () => {
    const src = newSource()
    const create = vi.spyOn(src, 'createCustomer')
    renderNova(undefined, src)
    const dlg = await dialog()
    const user = await fillRequired(dlg)
    await user.clear(input(dlg, /^Telefone/))
    await user.click(input(dlg, /^Telefone/))
    await user.paste('+55 63 99612-4478')
    expect(input(dlg, /^Telefone/).value).toBe('(63) 99612-4478')
    await user.click(within(dlg).getByRole('button', { name: 'Cadastrar cliente' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]![0].phone).toBe('63996124478')
  })

  it('CPF "111.111.111-11" →"CPF inválido."; telefone sem DDD e nascimento futuro acusam no campo', async () => {
    const src = newSource()
    const create = vi.spyOn(src, 'createCustomer')
    renderNova(undefined, src)
    const dlg = await dialog()
    const user = userEvent.setup()
    await user.type(input(dlg, /^Nome completo/), 'Helena Prado')
    await user.type(input(dlg, /^Telefone/), '99612447')
    fireEvent.change(input(dlg, /^Data de nascimento/), { target: { value: '2030-01-01' } })
    await user.type(input(dlg, /^CPF/), '111.111.111-11')
    await user.click(within(dlg).getByRole('button', { name: 'Cadastrar cliente' }))
    expect(errorOf(input(dlg, /^CPF/))).toBe('CPF inválido.')
    expect(errorOf(input(dlg, /^Telefone/))).toBe('Informe um telefone com DDD.')
    expect(errorOf(input(dlg, /^Data de nascimento/))).toBe('Informe a data de nascimento (não pode ser no futuro).')
    expect(errorOf(input(dlg, /^Nome completo/))).toBe('')
    expect(create).not.toHaveBeenCalled()
  })

  it('modelo ideal: busca no acervo, card da peça e "Usar medidas desta peça" preenche as medidas (editáveis)', async () => {
    const src = newSource()
    const ideal = await src.idealMeasurements('sz-0107')
    renderNova(undefined, src)
    const dlg = await dialog()
    const picker = within(dlg).getByRole('group', { name: 'Modelo ideal' })
    expect(within(picker).getByText('As medidas vêm da peça escolhida e podem ser ajustadas.')).toBeInTheDocument()
    await userEvent.type(within(picker).getByRole('searchbox', { name: 'Buscar peça do acervo' }), 'verona')
    const option = await within(picker).findByRole('button', { name: /SZ-0107.*Vestido Verona/ })
    await waitFor(() => expect(within(picker).getAllByRole('button', { name: /^SZ-/ })).toHaveLength(1))
    await userEvent.click(option)

    const chosen = within(picker).getByRole('region', { name: 'Peça escolhida' })
    expect(chosen).toHaveTextContent('SZ-0107')
    expect(chosen).toHaveTextContent('Vestido Verona')
    expect(chosen).toHaveTextContent('tam. 38 (M)')
    const use = within(picker).getByRole('button', { name: 'Usar medidas desta peça' })
    await waitFor(() => expect(use).toBeEnabled())
    await userEvent.click(use)

    expect((within(dlg).getByLabelText('Tamanho usual') as HTMLSelectElement).value).toBe(ideal.usualSize)
    expect(input(dlg, /^Busto/).value).toBe(String(ideal.bustCm))
    expect(input(dlg, /^Cintura/).value).toBe(String(ideal.waistCm))
    expect(input(dlg, /^Quadril/).value).toBe(String(ideal.hipCm))
    expect(input(dlg, /^Ombro/).value).toBe(String(ideal.shoulderCm))
    expect((within(dlg).getByLabelText('Comprimento preferido') as HTMLSelectElement).value).toBe(ideal.preferredLength)
    // continuam editáveis
    await userEvent.clear(input(dlg, /^Busto/))
    await userEvent.type(input(dlg, /^Busto/), '90')
    expect(input(dlg, /^Busto/).value).toBe('90')
  })

  it('?ideal=<id> já abre com a peça escolhida', async () => {
    renderNova('/preview/clientes?nova=1&ideal=sz-0107')
    const dlg = await dialog()
    expect(await within(dlg).findByRole('region', { name: 'Peça escolhida' })).toHaveTextContent('Vestido Verona')
  })

  it('salvar envia dígitos, modelo ideal e medidas; cria CL-0035 e navega para a ficha', async () => {
    const src = newSource()
    const create = vi.spyOn(src, 'createCustomer')
    const { router } = renderNova('/preview/clientes?nova=1&ideal=sz-0107', src)
    const dlg = await dialog()
    const user = await fillRequired(dlg)
    const use = await within(dlg).findByRole('button', { name: 'Usar medidas desta peça' })
    await waitFor(() => expect(use).toBeEnabled())
    await user.click(use)
    await user.type(input(dlg, /^Altura/), '168')
    await user.type(input(dlg, /^Cores preferidas/), 'Verde, Vinho,')
    await user.type(input(dlg, /^Cores evitadas/), 'Amarelo{Enter}')
    expect(within(dlg).getByRole('button', { name: 'Remover Verde' })).toBeInTheDocument()
    await user.click(within(dlg).getByRole('button', { name: 'Cadastrar cliente' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/preview/clientes/cl-0035'))
    const sent = create.mock.calls[0]![0]
    expect(sent).toMatchObject({
      fullName: 'Helena Prado Teste',
      phone: '63981234567',
      cpf: '39053344705',
      birthDate: '1995-08-14',
      idealGarmentId: 'sz-0107',
      measurement: { source: 'modelo_ideal', sourceGarmentId: 'sz-0107', heightCm: 168, usualSize: 'M' },
      preferences: { preferredColors: ['Verde', 'Vinho'], avoidedColors: ['Amarelo'] },
    })
    const saved = await src.getCustomer('cl-0035')
    expect(saved?.code).toBe('CL-0035')
    expect(saved?.measurements[0]?.bustCm).not.toBeNull()
  })

  it('CPF de cliente existente → "Já existe uma cliente com este CPF." sob o campo CPF; nada salvo', async () => {
    const src = newSource()
    const { router } = renderNova(undefined, src)
    const dlg = await dialog()
    const user = await fillRequired(dlg, { cpf: '529.982.247-25' })
    await user.click(within(dlg).getByRole('button', { name: 'Cadastrar cliente' }))
    await waitFor(() => expect(errorOf(input(dlg, /^CPF/))).toBe('Já existe uma cliente com este CPF.'))
    expect(router.state.location.pathname).toBe('/preview/clientes')
    expect(await src.getCustomer('cl-0035')).toBeNull()
  })
})

describe('Edição de cliente', () => {
  it('abre preenchido (máscaras, modelo ideal, medidas, chips) e salva só o que mudou', async () => {
    const src = newSource()
    const mariana = (await src.getCustomer('cl-0001'))!
    const update = vi.spyOn(src, 'updateCustomer')
    const { onClose } = renderEdit(mariana, src)
    const dlg = await dialog('Editar cliente')
    expect(within(dlg).getByText(/CL-0001/)).toBeInTheDocument()
    expect(input(dlg, /^Nome completo/).value).toBe('Mariana Fontes Ribeiro')
    expect(input(dlg, /^Telefone/).value).toBe('(63) 99612-4478')
    expect(input(dlg, /^CPF/).value).toBe('529.982.247-25')
    expect(input(dlg, /^Data de nascimento/).value).toBe('1994-03-21')
    expect(input(dlg, /^Busto/).value).toBe(String(mariana.measurements[0]!.bustCm))
    expect(await within(dlg).findByRole('region', { name: 'Peça escolhida' })).toHaveTextContent('Vestido Verona')
    expect(within(dlg).getByRole('button', { name: 'Remover Verde' })).toBeInTheDocument()

    await userEvent.clear(input(dlg, /^Cidade/))
    await userEvent.type(input(dlg, /^Cidade/), 'Gurupi')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const patch = update.mock.calls[0]![1]
    expect(update.mock.calls[0]![0]).toBe('cl-0001')
    expect(patch.city).toBe('Gurupi')
    expect(patch.cpf).toBe('52998224725')
    expect(patch.measurement).toBeUndefined() // medidas iguais: não cria versão nova
    const after = (await src.getCustomer('cl-0001'))!
    expect(after.city).toBe('Gurupi')
    expect(after.measurements).toHaveLength(mariana.measurements.length)
  })

  it('mudar uma medida cria nova versão; CPF de outra cliente acusa no campo', async () => {
    const src = newSource()
    const mariana = (await src.getCustomer('cl-0001'))!
    const ana = (await src.getCustomer('cl-0002'))!
    const { onClose } = renderEdit(mariana, src)
    const dlg = await dialog('Editar cliente')
    const user = userEvent.setup()
    await user.clear(input(dlg, /^CPF/))
    await user.type(input(dlg, /^CPF/), ana.cpf)
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(errorOf(input(dlg, /^CPF/))).toBe('Já existe uma cliente com este CPF.'))
    expect(onClose).not.toHaveBeenCalled()

    await user.clear(input(dlg, /^CPF/))
    await user.type(input(dlg, /^CPF/), mariana.cpf)
    await user.clear(input(dlg, /^Cintura/))
    await user.type(input(dlg, /^Cintura/), '70')
    await user.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const after = (await src.getCustomer('cl-0001'))!
    expect(after.measurements).toHaveLength(mariana.measurements.length + 1)
    expect(after.measurements[0]!.waistCm).toBe(70)
  })
})
