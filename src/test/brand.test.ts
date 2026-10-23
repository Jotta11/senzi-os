import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const self = resolve(__filename)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === '.temp' || name === 'node_modules') return []
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('marca', () => {
  it('nenhum arquivo em src/ ou supabase/ contém "Senzie"', () => {
    const offenders = ['src', 'supabase']
      .flatMap((d) => walk(join(root, d)))
      .filter((f) => f !== self)
      .filter((f) => /Senzie/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
