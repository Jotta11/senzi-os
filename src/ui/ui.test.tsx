import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import { Chips, DataTable, EmptyState, Modal, SearchInput, Silhouette, Tabs } from '@/ui'

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova peça" footer={<button type="button">Salvar</button>}>
        <label>
          Nome <input />
        </label>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('foco inicial, Tab preso dentro, Escape fecha e devolve o foco', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    await user.click(abrir)

    const dialog = screen.getByRole('dialog', { name: 'Nova peça' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const nome = screen.getByLabelText('Nome')
    expect(nome).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
    await user.tab()
    expect(nome).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(abrir).toHaveFocus()
  })

  it('clicar em texto do modal não solta o foco: Escape fecha e Tab continua preso', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova peça' })
    await user.click(screen.getByRole('heading', { name: 'Nova peça' }))
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(screen.getByRole('heading', { name: 'Nova peça' }))
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(screen.getByRole('heading', { name: 'Nova peça' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('trava a rolagem da página enquanto aberto e restaura ao fechar', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'
    render(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('auto')
    document.body.style.overflow = ''
  })
})

describe('Tabs', () => {
  it('setas, Home e End trocam de aba e movem o foco', async () => {
    const user = userEvent.setup()
    render(
      <Tabs
        label="Ficha"
        tabs={[
          { key: 'a', label: 'Calendário', content: <p>cal</p> },
          { key: 'b', label: 'Fotos', content: <p>fotos</p> },
          { key: 'c', label: 'Histórico', content: <p>hist</p> },
        ]}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'Ficha' })).toBeInTheDocument()
    const cal = screen.getByRole('tab', { name: 'Calendário' })
    expect(cal).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Calendário' })).toHaveTextContent('cal')

    cal.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Fotos' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Fotos' })).toHaveTextContent('fotos')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(cal).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Calendário' })).toHaveAttribute('tabindex', '-1')
  })
})

describe('SearchInput', () => {
  afterEach(() => vi.useRealTimers())

  it('chama onChange só depois de 260 ms sem digitar', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<SearchInput label="Buscar peças" value="" onChange={onChange} placeholder="Buscar…" />)
    const input = screen.getByRole('searchbox', { name: 'Buscar peças' })
    fireEvent.change(input, { target: { value: 've' } })
    act(() => vi.advanceTimersByTime(200))
    fireEvent.change(input, { target: { value: 'verde' } })
    act(() => vi.advanceTimersByTime(259))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('verde')
  })
})

describe('Chips', () => {
  it('marca a opção atual com aria-pressed e avisa a troca', async () => {
    const onChange = vi.fn()
    render(
      <Chips
        label="Tamanho"
        value="M"
        onChange={onChange}
        options={[
          { value: '', label: 'Todos' },
          { value: 'M', label: 'M' },
          { value: 'G', label: 'G', count: 3 },
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: 'Tamanho' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: /G/ }))
    expect(onChange).toHaveBeenCalledWith('G')
  })
})

describe('Silhouette', () => {
  it('renderiza um svg na cor da peça, com forma pela categoria', () => {
    const { container } = render(<Silhouette categorySlug="vestido-longo" length="longo" colorHex="#0E5C4A" label="Vestido Verona — Verde esmeralda" />)
    const svg = screen.getByRole('img', { name: 'Vestido Verona — Verde esmeralda' })
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(container.querySelector('stop[stop-color="#0E5C4A"]')).not.toBeNull()
    expect(svg).toHaveAttribute('data-shape', 'longo')
  })

  it('sereia pelo estilo, bolsa pela categoria, decorativa sem label', () => {
    const { container, rerender } = render(<Silhouette categorySlug="vestido-longo" style="Sereia" length="longo" colorHex="#191919" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-shape', 'sereia')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Silhouette categorySlug="bolsa-acessorio" length="curto" colorHex="#B9BEC6" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-shape', 'bolsa')
  })
})

describe('DataTable e EmptyState', () => {
  it('renderiza cabeçalhos, linhas e clique na linha', async () => {
    const onRowClick = vi.fn()
    render(
      <DataTable
        caption="Peças"
        rows={[{ id: '1', code: 'SZ-0107', price: 890 }]}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        columns={[
          { key: 'code', header: 'Código', render: (r) => r.code },
          { key: 'price', header: 'Locação', align: 'right', render: (r) => r.price },
        ]}
      />,
    )
    expect(screen.getByRole('table', { name: 'Peças' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Código' })).toBeInTheDocument()
    await userEvent.click(screen.getByText('SZ-0107'))
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', code: 'SZ-0107', price: 890 })
  })

  it('EmptyState mostra título e descrição', () => {
    render(<EmptyState title="Nenhuma peça encontrada" description="Ajuste os filtros ou cadastre uma nova peça." />)
    expect(screen.getByText('Nenhuma peça encontrada')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros ou cadastre uma nova peça.')).toBeInTheDocument()
  })
})
