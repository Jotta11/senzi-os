import { Logo } from '@/ui'
import { STORE } from '@/domain/store'
import { ContractBody } from '../ContractBody'
import { PrintShell } from './PrintShell'

/** `/reservas/:id/contrato` — contrato de locação (modelo da loja) em folha A4, com a logo no cabeçalho, para imprimir ou salvar em PDF. */
export function ContractPrint() {
  return (
    <PrintShell>
      {(r) => (
        <>
          <header className="pr-head">
            <Logo className="pr-logo" />
            <p className="pr-store">
              {STORE.name}
              <br />
              CNPJ {STORE.cnpj}
              <br />
              {STORE.address}
            </p>
          </header>
          {r.contract ? (
            <ContractBody text={r.contract.bodyRendered} className="pr-contract" />
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
