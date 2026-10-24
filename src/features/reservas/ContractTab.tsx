import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import type { ReservationDetail } from '@/data/types'
import { dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Button, EmptyState, Icon, buttonClass, useToast } from '@/ui'

export type ContractTabProps = { r: ReservationDetail; onSign(): void; onWhatsApp(): void }


/** Aba Contrato: número, situação da assinatura, ações (visualizar, copiar, imprimir, assinar) e o texto. */
export function ContractTab({ r, onSign, onWhatsApp }: ContractTabProps) {
  const { can } = usePermissions()
  const href = useAppHref()
  const toast = useToast()
  const c = r.contract
  const phone = r.customer.phone.replace(/\D/g, '')
  const closed = r.state === 'cancelada' || r.state === 'no_show'

  async function copy() {
    if (!c) return
    try {
      await navigator.clipboard.writeText(c.bodyRendered)
      toast({ title: 'Contrato copiado', description: 'Cole no WhatsApp, no e-mail ou no editor.' })
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Selecione o texto abaixo e copie.', tone: 'error' })
    }
  }

  return (
    <section className="card" aria-labelledby="rd-ct-t">
      <div className="card-h">
        <h3 id="rd-ct-t">Contrato de locação</h3>
        {c && (
          <span className="muted tiny">
            <span className="mono">{c.number}</span> · {c.signedAt ? `assinado ${dateBR(c.signedAt)}` : 'não assinado'}
          </span>
        )}
        <div className="actions">
          {c && (
            <>
              <Button size="sm" icon="copiar" onClick={() => void copy()}>
                Copiar texto
              </Button>
              <Link to={href(`/reservas/${r.id}/contrato`)} className={buttonClass('secondary', 'sm')}>
                <Icon name="doc" size={13} /> Imprimir / PDF
              </Link>
            </>
          )}
          {!c?.signedAt && !closed && can('reserva.confirm') && (
            <Button size="sm" icon="check" onClick={onSign}>
              Marcar como assinado
            </Button>
          )}
          {c && can('cliente.view') && r.state !== 'rascunho' && (
            <Button size="sm" icon="seta" disabled={!phone} title={phone ? undefined : 'Cliente sem telefone'} onClick={onWhatsApp}>
              Enviar no WhatsApp
            </Button>
          )}
        </div>
      </div>
      <div className="card-b rd-contract">
        <p className="note info">
          <Icon name="escudo" size={14} />
          <span>O contrato acompanha os dados da reserva enquanto não for assinado. Depois de marcado como assinado, vira snapshot imutável.</span>
        </p>
        {c?.signedAt && (
          <p className="note green">
            <Icon name="check" size={14} />
            <span>
              Assinado em {dateBR(c.signedAt)} por {c.signerName ?? '—'}.{c.signatureNotes ? ` ${c.signatureNotes}` : ''}
            </span>
          </p>
        )}
        {!r.customer.cpf && (
          <p className="note amber">
            <Icon name="alerta" size={14} />
            <span>A cliente ainda não tem CPF cadastrado. O contrato sai com o campo em branco — completar cadastro.</span>
          </p>
        )}
        {c ? (
          <pre className="rd-contract-text" tabIndex={0} aria-label="Texto do contrato">
            {c.bodyRendered}
          </pre>
        ) : (
          <EmptyState icon="doc" title="Sem contrato gerado" description="O contrato é gerado quando o rascunho é salvo. Marque como assinado para emitir a via." />
        )}
      </div>
    </section>
  )
}
