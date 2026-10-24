import { Logo } from '@/ui'
import { PrintShell, STORE_PLACEHOLDER } from './PrintShell'

/** `/reservas/:id/contrato` — contrato de locação (texto da spec §5.1) em folha A4 para imprimir ou salvar em PDF. */
export function ContractPrint() {
  return (
    <PrintShell>
      {(r) => (
        <>
          <header className="pr-head">
            <Logo className="pr-logo" />
            <p className="pr-store">{STORE_PLACEHOLDER}</p>
          </header>
          {r.contract ? (
            <pre className="pr-contract">{r.contract.bodyRendered}</pre>
          ) : (
            <p className="pr-empty">Esta reserva ainda não tem contrato gerado.</p>
          )}
          <footer className="pr-foot">
            Contrato {r.contract?.number ?? r.code.replace('RS', 'CT')} · Senzi Club
            {r.contract?.signedAt ? ' · assinado' : ' · via para assinatura'}
          </footer>
        </>
      )}
    </PrintShell>
  )
}
