import { useId, useState, type ChangeEvent } from 'react'
import { useAttachContractFile } from '@/data/hooks-reservas'
import { useDataSource } from '@/data/source'
import type { ReservationDetail } from '@/data/types'
import { CONTRACT_FILE_TYPES } from '@/data/validation'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Icon, useToast } from '@/ui'

const ACCEPT = Object.keys(CONTRACT_FILE_TYPES).join(',')

/** Abre o contrato assinado anexado (URL temporária) numa nova aba. */
export function ContractFileButton({ path, label = 'Ver contrato assinado' }: { path: string; label?: string }) {
  const src = useDataSource()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function open() {
    // Abre a aba já no clique (o navegador bloqueia janela aberta depois de um await) e só então aponta para o arquivo.
    const win = window.open('', '_blank')
    setBusy(true)
    try {
      const url = await src.contractFileUrl(path)
      if (win) win.location.href = url
      else window.location.assign(url)
    } catch (err) {
      win?.close()
      toast({ title: 'Não foi possível abrir o contrato', description: errorMessage(err), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" icon="olho" disabled={busy} onClick={() => void open()}>
      {label}
    </Button>
  )
}

export type ContractFileFieldProps = {
  /** Arquivo já anexado ao contrato (`pdfPath`). */
  attached: string | null
  file: File | null
  onChange(file: File | null): void
  error?: string
  disabled?: boolean
  /** Só ver o anexado (sem escolher arquivo). */
  readOnly?: boolean
  /** Rótulo com "· opcional" (na confirmação). */
  optional?: boolean
  /** Texto sob o nome do arquivo escolhido. */
  pendingHint?: string
}

/** Campo "Contrato assinado (arquivo)": PDF ou foto da via assinada; mostra o já anexado e permite substituir. */
export function ContractFileField({ attached, file, onChange, error, disabled, readOnly, optional = true, pendingHint = 'será anexado ao confirmar' }: ContractFileFieldProps) {
  const id = useId()

  function pick(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  return (
    <div className={['field', 'rd-file', error && 'has-error'].filter(Boolean).join(' ')}>
      <span className="rd-file-l" id={`${id}-l`}>
        Contrato assinado (arquivo){optional && <span className="muted"> · opcional</span>}
      </span>
      <div className="rd-file-box">
        <Icon name="doc" size={18} />
        <div className="rd-file-txt">
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span className="tiny muted">{(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB · {pendingHint}</span>
            </>
          ) : attached ? (
            <>
              <strong>Contrato anexado</strong>
              <span className="tiny muted">{readOnly ? 'PDF ou foto da via assinada.' : 'Escolha outro arquivo para substituir.'}</span>
            </>
          ) : readOnly ? (
            <>
              <strong>Nenhum arquivo anexado</strong>
              <span className="tiny muted">A via assinada ainda não foi enviada.</span>
            </>
          ) : (
            <>
              <strong>Anexar contrato assinado</strong>
              <span className="tiny muted">PDF ou foto (JPG, PNG, HEIC), até 10 MB</span>
            </>
          )}
        </div>
        <div className="rd-file-act">
          {!file && attached && <ContractFileButton path={attached} label="Ver" />}
          {file && (
            <Button size="sm" variant="ghost" icon="x" disabled={disabled} onClick={() => onChange(null)}>
              Remover
            </Button>
          )}
          {!readOnly && (
            <label className={`btn btn-sm${disabled ? ' is-disabled' : ''}`}>
              <Icon name="subir" size={13} />
              {file || attached ? 'Trocar' : 'Escolher arquivo'}
              <input type="file" accept={ACCEPT} className="sr-only" disabled={disabled} onChange={pick} aria-labelledby={`${id}-l`} />
            </label>
          )}
        </div>
      </div>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/** Aba Contrato: envia o contrato assinado assim que o arquivo é escolhido (ou só mostra o anexado, sem permissão). */
export function ContractUpload({ r, canEdit }: { r: ReservationDetail; canEdit: boolean }) {
  const attach = useAttachContractFile(r.id)
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | undefined>()

  function send(f: File | null) {
    if (!f) return
    setFile(f)
    setError(undefined)
    attach.mutate(f, {
      onSuccess: () => {
        toast({
          title: r.contract?.pdfPath ? 'Contrato assinado substituído' : 'Contrato assinado anexado',
          description: r.contract?.signedAt ? (r.contract.number ?? r.code) : 'Falta marcar o contrato como assinado.',
        })
      },
      onError: (err) => {
        setError(errorMessage(err))
        toast({ title: 'Não foi possível anexar o contrato', description: errorMessage(err), tone: 'error' })
      },
      onSettled: () => setFile(null),
    })
  }

  return (
    <ContractFileField
      attached={r.contract?.pdfPath ?? null}
      file={file}
      onChange={send}
      error={error}
      disabled={attach.isPending}
      readOnly={!canEdit}
      optional={false}
      pendingHint="enviando…"
    />
  )
}
