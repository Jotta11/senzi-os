import { Button, Modal } from '@/ui'

export type ConfirmModalProps = {
  title: string
  message: string
  confirmLabel: string
  pending?: boolean
  error?: string | null
  onConfirm(): void
  onClose(): void
}

/** Confirmação curta (cancelar lançamento, excluir despesa, arquivar categoria). */
export function ConfirmModal({ title, message, confirmLabel, pending, error, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {error && (
        <p className="note red" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
