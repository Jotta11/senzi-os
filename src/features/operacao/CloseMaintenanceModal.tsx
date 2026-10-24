import { useState, type FormEvent } from 'react'
import { useCloseMaintenance, useReleaseGarment, useSuppliers } from '@/data/hooks-operacao'
import { GARMENT_STATE } from '@/data/labels'
import type { Garment } from '@/data/types'
import { SourceError } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { brl } from '@/lib/format'
import { Button, Field, Modal, useToast } from '@/ui'

import type { OrderTarget } from './orderTarget'

const FORM_ID = 'op-close-form'

/** Concluir higienização/manutenção (spec §1.3.2): custo, fornecedor, observação e liberação da peça. */
export function CloseMaintenanceModal({ order, onClose }: { order: OrderTarget | null; onClose(): void }) {
  const hig = order?.kind === 'higienizacao'
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      size="sm"
      title={hig ? 'Concluir higienização' : 'Concluir manutenção'}
      description={order ? `${order.garmentCode} · ${order.garmentName}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID} icon="check">
            Concluir
          </Button>
        </>
      }
    >
      {order && <CloseForm order={order} onDone={onClose} />}
    </Modal>
  )
}

function CloseForm({ order, onDone }: { order: OrderTarget; onDone(): void }) {
  const toast = useToast()
  const close = useCloseMaintenance()
  const suppliers = useSuppliers()
  const [cost, setCost] = useState(order.kind === 'higienizacao' ? '58' : '0')
  const [provider, setProvider] = useState(order.provider ?? '')
  const [note, setNote] = useState('')
  const [release, setRelease] = useState(true)
  const [error, setError] = useState<string | undefined>()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (close.isPending) return
    const value = cost.trim() === '' ? 0 : Number(cost.replace(',', '.'))
    if (!Number.isFinite(value) || value < 0) return setError(errorMessage('CUSTO_INVALIDO'))
    setError(undefined)
    close.mutate(
      { maintenanceId: order.id, cost: value, provider: provider.trim() || null, note: note.trim() || null, release },
      {
        onSuccess: () => {
          toast({ title: 'Concluído', description: value > 0 ? `${order.garmentCode} · ${brl(value)} lançado no custo da peça` : `${order.garmentCode} · sem custo`, tone: 'ok' })
          onDone()
        },
        onError: (err) => {
          if (err instanceof SourceError && err.field === 'cost') setError(errorMessage(err))
          else toast({ title: 'Não foi possível concluir', description: errorMessage(err), tone: 'error' })
        },
      },
    )
  }

  return (
    <form id={FORM_ID} className="op-form" onSubmit={submit} noValidate>
      <div className="op-fields">
        <Field id="op-cost" label="Custo (R$)" type="number" inputMode="decimal" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} error={error} />
        <Field id="op-supplier" label="Fornecedor" list="op-suppliers" value={provider} onChange={(e) => setProvider(e.target.value)} />
        <datalist id="op-suppliers">
          {(suppliers.data ?? []).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Field id="op-note" full label="Observação" placeholder="O que foi feito" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="op-opt">
        <input type="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} />
        <span>Liberar a peça para o acervo ao concluir</span>
      </label>
    </form>
  )
}

/** Confirmação "Liberar peça para o acervo" (spec §1.3.3). */
export function ReleaseModal({ garment: g, onClose }: { garment: Garment | null; onClose(): void }) {
  const toast = useToast()
  const release = useReleaseGarment()
  function confirm() {
    if (!g || release.isPending) return
    release.mutate(
      { garmentId: g.id, note: 'Liberada pela Operação' },
      {
        onSuccess: (out) => {
          toast({ title: 'Peça liberada', description: `${g.code} agora está ${GARMENT_STATE[out.state].label.toLowerCase()}.`, tone: 'ok' })
          onClose()
        },
        onError: (err) => toast({ title: 'Não foi possível liberar', description: errorMessage(err), tone: 'error' }),
      },
    )
  }
  return (
    <Modal
      open={!!g}
      onClose={onClose}
      size="sm"
      title="Liberar peça para o acervo"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={confirm} disabled={release.isPending}>
            Liberar peça
          </Button>
        </>
      }
    >
      {g && (
        <p>
          Encerrar higienização, ajuste ou manutenção em aberto de <b>{g.name}</b> ({g.code}) e devolvê-la ao acervo? Os bloqueios operacionais atuais serão removidos do calendário.
        </p>
      )}
    </Modal>
  )
}
