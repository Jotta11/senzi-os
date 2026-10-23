import type { KeyboardEvent, ReactNode } from 'react'

export type Column<T> = {
  key: string
  header: ReactNode
  render(row: T): ReactNode
  align?: 'left' | 'right' | 'center'
  /** Classe extra nas células da coluna (ex.: 'mono'). */
  className?: string
}

export type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey(row: T): string
  /** Linha clicável (também por Enter quando focada). Prefira pôr um link na primeira coluna. */
  onRowClick?(row: T): void
  /** Nome acessível da tabela (fica visualmente oculto). */
  caption?: string
  /** Mostrado no lugar do corpo quando não há linhas. */
  empty?: ReactNode
}

/** Tabela simples com cabeçalho fixo de estilo, rolagem horizontal própria (nunca a da página). */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, caption, empty }: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>
  const onKey = (row: T) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick?.(row)
  }
  return (
    <div className="dt-wrap">
      <table className="dt">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align ? `al-${c.align}` : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? 'dt-click' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? onKey(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={[c.align && `al-${c.align}`, c.className].filter(Boolean).join(' ') || undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
