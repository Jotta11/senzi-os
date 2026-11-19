import { useState, type FormEvent } from 'react'
import { useGarmentSearch } from '@/data/hooks'
import { useSendToCleaning, useSuppliers } from '@/data/hooks-operacao'
import { GARMENT_STATE } from '@/data/labels'
import type { Garment } from '@/data/types'
import { SourceError } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Field, Modal, SearchInput, useToast } from '@/ui'
import { GarmentThumb } from '../reservas/GarmentThumb'

const FORM_ID = 'op-avulsa-form'
const PAGE = { limit: 8, offset: 0 }
/** Só peça na loja pode ir para a lavanderia sem devolução. */
const canSend = (g: Garment) => g.state === 'disponivel' || g.state === 'reservado'

/** Higienização avulsa: escolhe a peça do acervo e abre a ordem de higienização sem ter havido devolução. */
export function SendToCleaningModal({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lançar peça para higienização"
      description="Para peças que estão na loja e precisam ir à lavanderia sem ter sido devolvidas (prova, vitrine, ensaio…)."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={FORM_ID} icon="gota">
            Enviar para higienização
          </Button>
        </>
      }
    >
      {open && <SendForm onDone={onClose} />}
    </Modal>
  )
}

function SendForm({ onDone }: { onDone(): void }) {
  const toast = useToast()
  const send = useSendToCleaning()
  const suppliers = useSuppliers()
  const [q, setQ] = useState('')
  const search = useGarmentSearch({ q }, PAGE)
  const [picked, setPicked] = useState<Garment | null>(null)
  const [provider, setProvider] = useState('')
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<{ garment?: string; days?: string }>({})

  function submit(e: FormEvent) {
    e.preventDefault()
    if (send.isPending) return
    if (!picked) return setError({ garment: 'Escolha a peça.' })
    const n = days.trim() === '' ? null : Number(days)
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 60)) return setError({ days: 'Entre 1 e 60 dias.' })
    setError({})
    send.mutate(
      { garmentId: picked.id, provider: provider.trim() || null, note: note.trim() || null, days: n },
      {
        onSuccess: () => {
          toast({ title: 'Enviada para higienização', description: `${picked.code} · ${picked.name}`, tone: 'ok' })
          onDone()
        },
        onError: (err) => {
          if (err instanceof SourceError && err.field === 'days') setError({ days: errorMessage(err) })
          else toast({ title: 'Não foi possível lançar', description: errorMessage(err), tone: 'error' })
        },
      },
    )
  }

  const items = search.data?.items ?? []
  return (
    <form id={FORM_ID} className="op-form" onSubmit={submit} noValidate>
      {picked ? (
        <div className="op-pick">
          <GarmentThumb garment={picked} className="op-thumb" />
          <span className="op-txt">
            <span>
              <span className="op-name">{picked.name}</span>
              <span className="op-code mono">{picked.code}</span>
            </span>
            <span className="op-sub">{GARMENT_STATE[picked.state].label}</span>
          </span>
          <Button size="sm" onClick={() => setPicked(null)}>
            Trocar
          </Button>
        </div>
      ) : (
        <div className="op-search">
          <SearchInput value={q} onChange={setQ} label="Buscar peça" placeholder="Código, nome ou cor" />
          {error.garment && (
            <span className="error tiny" role="alert">
              {error.garment}
            </span>
          )}
          <ul className="op-list op-results" aria-label="Peças encontradas" aria-busy={search.isFetching}>
            {items.length === 0 && <li className="muted tiny">{search.isPending ? 'Buscando…' : 'Nenhuma peça encontrada.'}</li>}
            {items.map((g) => {
              const ok = canSend(g)
              return (
                <li key={g.id}>
                  <button type="button" className="op-row op-pick-row" disabled={!ok} onClick={() => setPicked(g)} title={ok ? undefined : 'Só peças na loja (disponíveis ou reservadas) podem ser lançadas'}>
                    <GarmentThumb garment={g} className="op-thumb" />
                    <span className="op-txt">
                      <span>
                        <span className="op-name">{g.name}</span>
                        <span className="op-code mono">{g.code}</span>
                      </span>
                      <span className="op-sub">{GARMENT_STATE[g.state].label}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div className="op-fields">
        <Field id="op-av-supplier" label="Fornecedor" list="op-av-suppliers" value={provider} onChange={(e) => setProvider(e.target.value)} />
        <datalist id="op-av-suppliers">
          {(suppliers.data ?? []).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Field id="op-av-days" label="Dias previstos" type="number" inputMode="numeric" min={1} max={60} placeholder="Padrão da peça" value={days} onChange={(e) => setDays(e.target.value)} error={error.days} />
        <Field id="op-av-note" full label="Motivo / observação" placeholder="Ex.: usada em prova, mancha de maquiagem" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="muted tiny">O custo é lançado ao concluir a higienização, como nas demais ordens.</p>
    </form>
  )
}
