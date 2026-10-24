import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useReservation } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { useAppHref } from '@/shell/appPath'
import { Button, EmptyState, Icon } from '@/ui'
import './print.css'

/** Dados da loja ainda não configuráveis (placeholders; pendência do Plano 2B). */
export const STORE_PLACEHOLDER = 'Senzi Club — razão social, CNPJ e endereço a configurar'

/**
 * Carrega a reserva da rota e envolve o documento: barra de ações (voltar + "Imprimir / salvar PDF", ocultas na
 * impressão) e a folha A4. O CSS de impressão esconde a sidebar e a faixa da prévia.
 */
export function PrintShell({ children }: { children(r: ReservationDetail): ReactNode }) {
  const { id } = useParams()
  const q = useReservation(id)
  const href = useAppHref()
  const { can } = usePermissions()
  if (q.isPending) return <div className="pr-page" aria-busy="true" />
  const r = q.data
  if (!r || !can('reserva.view')) {
    return (
      <div className="pr-page">
        <section className="card">
          <EmptyState icon="doc" title="Reserva não encontrada" description="Não há documento para este link." action={<Link to={href('/reservas')} className="btn">Voltar às reservas</Link>} />
        </section>
      </div>
    )
  }
  return (
    <div className="pr-page pr-doc">
      <div className="pr-bar no-print">
        <Link to={href(`/reservas/${r.id}`)} className="gp-back">
          <Icon name="chevronL" size={13} /> {r.code}
        </Link>
        <Button variant="primary" icon="doc" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
      </div>
      <article className="pr-sheet">{children(r)}</article>
    </div>
  )
}
