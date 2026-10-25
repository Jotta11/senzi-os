/**
 * Gera os ícones do app (PWA, iPhone e aba do navegador): o "Z" da Senzi em Beige sobre Cranberry.
 *
 *   pnpm icons
 *
 * Escreve os SVGs e renderiza os PNGs no Chrome headless (precisa do Google Chrome instalado;
 * outro caminho via CHROME=/caminho/do/chrome). Os arquivos gerados ficam versionados em public/,
 * então só é preciso rodar de novo se a marca ou as cores mudarem.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARK_PATH, MARK_VIEWBOX } from '../src/ui/brandMark.ts'

const FUNDO = '#3F1116' // Cranberry — cor principal da marca
const MARCA = '#FEEFDC' // Beige

const [vx, vy, vw, vh] = MARK_VIEWBOX.split(' ').map(Number) as [number, number, number, number]

/**
 * Ícone quadrado de `size` px com o Z ocupando `ratio` da altura, centralizado.
 * `radius` arredonda o fundo (favicon); ícones de app ficam retos — o sistema aplica a máscara.
 */
function iconSvg(size: number, ratio: number, radius = 0): string {
  const s = (size * ratio) / vh
  const x = (size - vw * s) / 2
  const y = (size - vh * s) / 2
  const r = (n: number) => Math.round(n * 1000) / 1000
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ''} fill="${FUNDO}"/>` +
    `<path fill="${MARCA}" transform="translate(${r(x)} ${r(y)}) scale(${r(s)}) translate(${-vx} ${-vy})" d="${MARK_PATH}"/>` +
    `</svg>`
  )
}

// "any": o Z grande, para atalhos sem máscara. "maskable": o Z dentro da zona segura (círculo de 80%),
// porque o Android recorta em círculo, gota ou quadrado arredondado.
const ICONS: { file: string; size: number; ratio: number; radius?: number }[] = [
  { file: 'icons/icon-192.png', size: 192, ratio: 0.58 },
  { file: 'icons/icon-512.png', size: 512, ratio: 0.58 },
  { file: 'icons/maskable-192.png', size: 192, ratio: 0.46 },
  { file: 'icons/maskable-512.png', size: 512, ratio: 0.46 },
  { file: 'icons/apple-touch-icon.png', size: 180, ratio: 0.56 },
  { file: 'icons/favicon-32.png', size: 32, ratio: 0.72, radius: 7 },
]

const PUBLIC = join(import.meta.dirname, '..', 'public')
mkdirSync(join(PUBLIC, 'icons'), { recursive: true })
writeFileSync(join(PUBLIC, 'favicon.svg'), iconSvg(64, 0.7, 14) + '\n')
writeFileSync(join(PUBLIC, 'icons', 'icon.svg'), iconSvg(512, 0.58) + '\n')
writeFileSync(join(PUBLIC, 'icons', 'maskable.svg'), iconSvg(512, 0.46) + '\n')

// ---------------------------------------------------------------- render no Chrome (DevTools Protocol)
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9400 + Math.floor(Math.random() * 400)
const profile = mkdtempSync(join(tmpdir(), 'senzi-icons-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

try {
  let wsUrl: string | undefined
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
      wsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {
      // Chrome ainda subindo
    }
    if (!wsUrl) await sleep(150)
  }
  if (!wsUrl) throw new Error(`não consegui abrir o Chrome em ${CHROME}`)

  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const pending = new Map<number, (v: { result?: { data?: string } }) => void>()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data)) as { id?: number; result?: { data?: string } }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg)
      pending.delete(msg.id)
    }
  })
  const send = (method: string, params: object = {}) =>
    new Promise<{ result?: { data?: string } }>((r) => {
      const id = ++seq
      pending.set(id, r)
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  for (const icon of ICONS) {
    await send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false })
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${iconSvg(icon.size, icon.ratio, icon.radius)}`
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` })
    await sleep(250)
    if (icon.radius) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(PUBLIC, icon.file), Buffer.from(shot.result!.data!, 'base64'))
    console.log(`✓ public/${icon.file}`)
  }
  ws.close()
  console.log('✓ public/favicon.svg, public/icons/icon.svg, public/icons/maskable.svg')
} finally {
  const exited = new Promise((r) => chrome.once('exit', r))
  chrome.kill()
  await exited
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
