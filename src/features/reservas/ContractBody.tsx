import type { ReactNode } from 'react'
import './contract.css'

/**
 * Texto do contrato (uma linha = um parágrafo, ver src/data/mock/contract.ts) formatado como documento: título,
 * cláusulas e seções do Anexo I como títulos, número dos itens e rótulos ("CPF:") em negrito, Anexo I em página
 * nova na impressão. Contratos antigos (modelo 1, texto alinhado em colunas) continuam em bloco monoespaçado.
 */
export function ContractBody({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  if (!lines[0]?.endsWith('E ACESSÓRIOS')) return <pre className={['ct-legacy', className].filter(Boolean).join(' ')}>{text}</pre>

  const out: ReactNode[] = []
  let annex = false
  lines.forEach((line, i) => {
    const key = i
    if (i === 0) return out.push(<h1 key={key} className="ct-title">{line}</h1>)
    if (i === 1) return out.push(<p key={key} className="ct-number">{line}</p>)
    if (!line.trim()) return
    if (line.startsWith('ANEXO I')) {
      annex = true
      return out.push(<h2 key={key} className="ct-h ct-annex">{line}</h2>)
    }
    if (/^CLÁUSULA \d+/.test(line)) return out.push(<h2 key={key} className="ct-h">{line}</h2>)
    if (annex && /^\d+\. [A-ZÀ-Ú ]+$/.test(line)) return out.push(<h3 key={key} className="ct-sub">{line}</h3>)
    if (/^Peça \d+ de \d+$/.test(line)) return out.push(<p key={key} className="ct-piece">{line}</p>)
    const item = /^(\d+\.\d+\.)\s(.*)$/.exec(line)
    if (item) {
      return out.push(
        <p key={key}>
          <strong>{item[1]}</strong> {item[2]}
        </p>,
      )
    }
    const party = /^(LOCADORA|LOCATÁRIA):\s(.*)$/.exec(line)
    if (party) {
      return out.push(
        <p key={key}>
          <strong>{party[1]}:</strong> {party[2]}
        </p>,
      )
    }
    if (/ — (LOCADORA|LOCATÁRIA)$/.test(line)) return out.push(<p key={key} className="ct-sign"><strong>{line}</strong></p>)
    if (/^\(.\) /.test(line)) return out.push(<p key={key} className="ct-box">{line}</p>)
    const label = /^([^:]{2,48}):\s?(.*)$/.exec(line)
    if (label && !line.endsWith('.')) {
      return out.push(
        <p key={key} className={label[1]!.startsWith('Assinatura') ? 'ct-sigline' : undefined}>
          <strong>{label[1]}:</strong> {label[2]}
        </p>,
      )
    }
    out.push(<p key={key} className={line.startsWith('O valor de reposição constitui') ? 'ct-note' : undefined}>{line}</p>)
  })
  return <div className={['ct-doc', className].filter(Boolean).join(' ')}>{out}</div>
}
