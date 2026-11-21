import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCategories, useDeleteGarment } from '@/data/hooks'
import type { Garment } from '@/data/types'
import { errorMessage } from '@/lib/errorMessages'
import { useAppHref } from '@/shell/appPath'
import { Button, Modal, useToast } from '@/ui'

/**
 * Confirmação de "Apagar peça" (`acervo.delete`). A fonte recusa peça que já passou por reserva ou prova
 * (PECA_COM_HISTORICO, mostrado aqui). Apagada, volta para a lista do grupo dela (Vestidos ou Bolsas).
 */
export function DeleteGarmentModal({ open, onClose, garment: g }: { open: boolean; onClose(): void; garment: Garment }) {
  const del = useDeleteGarment(g.id)
  const categories = useCategories()
  const navigate = useNavigate()
  const href = useAppHref()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const isBag = categories.data?.find((c) => c.slug === g.categorySlug)?.group === 'bolsas'

  function close() {
    setError(null)
    onClose()
  }

  function confirm() {
    setError(null)
    del.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Peça apagada', description: `${g.code} · ${g.name}`, tone: 'ok' })
        navigate(href(isBag ? '/acervo/bolsas' : '/acervo'), { replace: true })
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  return (
    <Modal
      open={open}
      size="sm"
      onClose={close}
      title="Apagar peça"
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="danger" icon="lixo" onClick={confirm} disabled={del.isPending}>
            Apagar peça
          </Button>
        </>
      }
    >
      <p>
        Apagar <b>{g.code} · {g.name}</b> do acervo? As fotos, o histórico e as manutenções da peça vão junto, e a compra
        registrada no Financeiro também é apagada. Não dá para desfazer.
      </p>
      {error && (
        <p className="note red" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
