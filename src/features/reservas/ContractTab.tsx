import { useState } from 'react'
import { Link } from 'react-router'
import { usePermissions } from '@/auth/usePermissions'
import { useEditContract } from '@/data/hooks-reservas'
import type { ReservationDetail } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { dateBR } from '@/lib/format'
import { useAppHref } from '@/shell/appPath'
import { Button, EmptyState, Field, Icon, buttonClass, useToast } from '@/ui'
import { ContractBody } from './ContractBody'
import { ContractUpload } from './ContractFile'

export type ContractTabProps = { r: ReservationDetail; onSign(): void; onWhatsApp(): void }

/**
 * Aba Contrato: número, situação da assinatura, ações (copiar, imprimir, editar, assinar), envio do contrato assinado
 * e o texto. Enquanto não assinado, o texto pode ser editado na tela (precisa de `cliente.edit`: sem ela o CPF chega
 * mascarado e a máscara iria para o contrato).
 */
export function ContractTab({ r, onSign, onWhatsApp }: ContractTabProps) {
  const { can } = usePermissions()
  const href = useAppHref()
  const toast = useToast()
  const c = r.contract
  const phone = r.customer.phone.replace(/\D/g, '')
  const closed = r.state === 'cancelada' || r.state === 'no_show'
  const edit = useEditContract(r.id)
  const [draft, setDraft] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | undefined>()
  const canEditText = !!c && !c.signedAt && !closed && can('reserva.create') && can('cliente.edit')
  const editing = draft !== null

  function saveText(body: string | null) {
    edit.mutate(body, {
      onSuccess: () => {
        toast(body === null ? { title: 'Texto padrão restaurado', description: c?.number ?? r.code } : { title: 'Contrato atualizado', description: `${c?.number ?? r.code} · texto editado na tela.` })
        setDraft(null)
        setEditError(undefined)
      },
      onError: (err) => {
        setEditError(errorMessage(err))
        toast({ title: 'Não foi possível salvar o contrato', description: errorMessage(err), tone: 'error' })
      },
    })
  }

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
    <section className="card rd-ct-card" aria-labelledby="rd-ct-t">
      <div className="card-h">
        <h3 id="rd-ct-t">Contrato de locação</h3>
        {c && (
          <span className="muted tiny">
            <span className="mono">{c.number}</span> · {c.signedAt ? `assinado ${dateBR(c.signedAt)}` : 'não assinado'}
          </span>
        )}
        <div className="actions">
          {c && !editing && (
            <>
              <Button size="sm" icon="copiar" onClick={() => void copy()}>
                Copiar texto
              </Button>
              <Link to={href(`/reservas/${r.id}/contrato`)} className={buttonClass('secondary', 'sm')}>
                <Icon name="doc" size={13} /> Imprimir / PDF
              </Link>
              {canEditText && (
                <Button size="sm" icon="editar" onClick={() => setDraft(c.bodyRendered)}>
                  Editar texto
                </Button>
              )}
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
        {c && <ContractUpload r={r} canEdit={!closed && can('reserva.confirm')} />}
        {!r.customer.cpf && (
          <p className="note amber">
            <Icon name="alerta" size={14} />
            <span>A cliente ainda não tem CPF cadastrado. O contrato sai com o campo em branco — completar cadastro.</span>
          </p>
        )}
        {c?.editedAt && !c.signedAt && (
          <p className="note amber">
            <Icon name="editar" size={14} />
            <span>
              Texto editado na tela em {dateBR(c.editedAt)}. Se a reserva mudar (peças, datas, desconto), o contrato é regerado e a edição se perde.
              {canEditText && !editing && (
                <>
                  {' '}
                  <button type="button" className="rs-alt" disabled={edit.isPending} onClick={() => saveText(null)}>
                    Restaurar texto padrão
                  </button>
                </>
              )}
            </span>
          </p>
        )}
        {c && editing ? (
          <div className="rd-contract-edit">
            <Field
              as="textarea"
              full
              label="Texto do contrato"
              hint="Cada linha é um parágrafo. Mantenha os títulos (CLÁUSULA 1, ANEXO I…) no começo da linha para a formatação da impressão."
              rows={22}
              spellCheck
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setEditError(undefined)
              }}
              error={editError}
            />
            <div className="actions">
              <Button onClick={() => { setDraft(null); setEditError(undefined) }} disabled={edit.isPending}>
                Cancelar
              </Button>
              <Button variant="primary" icon="check" disabled={edit.isPending || draft === c.bodyRendered} onClick={() => saveText(draft)}>
                {edit.isPending ? 'Salvando…' : 'Salvar texto'}
              </Button>
            </div>
          </div>
        ) : c ? (
          <div className="rd-contract-text" tabIndex={0} role="document" aria-label="Texto do contrato">
            <ContractBody text={c.bodyRendered} />
          </div>
        ) : (
          <EmptyState icon="doc" title="Sem contrato gerado" description="O contrato é gerado quando o rascunho é salvo. Marque como assinado para emitir a via." />
        )}
      </div>
    </section>
  )
}
