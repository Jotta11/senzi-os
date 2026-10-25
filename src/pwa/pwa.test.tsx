import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildManifest, THEME_COLOR } from './manifest'
import { InstallAppButton, UpdateBanner } from './PwaPrompts'
import { __setPwaStateForTests } from './pwa'

afterEach(() => __setPwaStateForTests({}, null))

describe('manifesto', () => {
  it('sistema real: abre em / com atalhos para as telas', () => {
    const m = buildManifest('/')
    expect(m).toMatchObject({ name: 'Senzi OS', short_name: 'Senzi', start_url: '/', scope: '/', display: 'standalone', lang: 'pt-BR' })
    expect(m.shortcuts.map((s) => s.url)).toEqual(['/agenda', '/reservas', '/clientes', '/acervo'])
  })

  it('sem Supabase: abre na prévia e os atalhos apontam para a prévia', () => {
    const m = buildManifest('/preview')
    expect(m.start_url).toBe('/preview')
    expect(m.shortcuts[0]!.url).toBe('/preview/agenda')
  })

  it('cores da marca e ícones normais + maskable de 192 e 512 que existem em public/', () => {
    const m = buildManifest('/')
    expect(m.theme_color).toBe(THEME_COLOR)
    expect(m.background_color).toBe('#3F1116')
    for (const purpose of ['any', 'maskable']) {
      expect(m.icons.filter((i) => i.purpose === purpose && i.type === 'image/png').map((i) => i.sizes)).toEqual(['192x192', '512x512'])
    }
    for (const icon of m.icons) expect(() => readFileSync(resolve(__dirname, '../../public', icon.src.slice(1)))).not.toThrow()
  })

  it('index.html liga o manifesto, a cor do tema e o ícone do iPhone', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR}" />`)
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
    expect(html).toContain('viewport-fit=cover')
  })
})

describe('Instalar app', () => {
  it('não aparece quando o navegador não oferece instalação', () => {
    render(<InstallAppButton />)
    expect(screen.queryByRole('button', { name: 'Instalar app' })).toBeNull()
  })

  it('Chrome/Android: abre o diálogo nativo e some depois', async () => {
    const prompt = vi.fn(async () => {})
    const ev = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) })
    __setPwaStateForTests({ canInstall: true }, ev)
    render(<InstallAppButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Instalar app' }))
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Instalar app' })).toBeNull()
  })

  it('iPhone: explica o caminho pelo Compartilhar', async () => {
    __setPwaStateForTests({ iosHint: true })
    render(<InstallAppButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Instalar app' }))
    const dialog = screen.getByRole('dialog', { name: 'Instalar no iPhone ou iPad' })
    expect(dialog).toHaveTextContent('Adicionar à Tela de Início')
  })

  it('já instalado: não oferece de novo', () => {
    __setPwaStateForTests({ iosHint: true, standalone: true })
    render(<InstallAppButton />)
    expect(screen.queryByRole('button', { name: 'Instalar app' })).toBeNull()
  })
})

describe('Nova versão', () => {
  it('aviso aparece com versão nova e "Depois" o esconde', async () => {
    __setPwaStateForTests({ updateReady: true })
    render(<UpdateBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Nova versão disponível.')
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('sem versão nova não mostra nada', () => {
    render(<UpdateBanner />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('service worker', () => {
  const sw = readFileSync(resolve(__dirname, 'sw.js'), 'utf8')
  it('modelo tem os marcadores que o build substitui', () => {
    expect(sw).toContain("'__BUILD_ID__'")
    expect(sw).toContain('const PRECACHE = __PRECACHE__')
    expect(sw.match(/__BUILD_ID__|__PRECACHE__/g)).toHaveLength(2)
  })
  it('só intercepta GET da própria origem e das fontes (dados do Supabase nunca vão para o cache)', () => {
    expect(sw).toContain("if (request.method !== 'GET') return")
    expect(sw).toContain('if (url.origin !== self.location.origin) return')
  })
})
