import { useId, useState, type ChangeEvent } from 'react'
import { usePermissions } from '@/auth/usePermissions'
import { useAddPhoto, useRemovePhoto, useSetCover } from '@/data/hooks'
import { PHOTO_KIND_LABEL } from '@/data/labels'
import type { Garment, PhotoKind } from '@/data/types'
import { MAX_PHOTOS } from '@/data/validation'
import { errorMessage } from '@/lib/errorMessages'
import { Badge, Button, EmptyState, Icon, Silhouette } from '@/ui'

const NOT_IMAGE = 'Envie apenas imagens (JPG, PNG, WEBP…).'
const LIMIT = `Limite de ${MAX_PHOTOS} fotos por peça.`
const KINDS = Object.keys(PHOTO_KIND_LABEL) as PhotoKind[]

/**
 * Fotos da peça: grade com capa, "Definir como capa" e "Remover"; envio de imagens (só `image/*`, até 10 por peça).
 * Na prévia as fotos ficam só neste navegador (URL local do arquivo). Sem `acervo.edit`, só a grade.
 */
export function PhotosPanel({ garment: g }: { garment: Garment }) {
  const { can } = usePermissions()
  const canEdit = can('acervo.edit')
  const kindId = useId()
  const [kind, setKind] = useState<PhotoKind>('frente')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const add = useAddPhoto(g.id)
  const remove = useRemovePhoto(g.id)
  const cover = useSetCover(g.id)
  const full = g.photos.length >= MAX_PHOTOS

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setError(null)
    const images = files.filter((f) => f.type.startsWith('image/'))
    const problems: string[] = []
    if (images.length < files.length) problems.push(NOT_IMAGE)
    const room = MAX_PHOTOS - g.photos.length
    if (images.length > room) problems.push(LIMIT)
    setUploading(true)
    try {
      for (const file of images.slice(0, Math.max(0, room))) await add.mutateAsync({ file, kind })
    } catch (err) {
      problems.push(errorMessage(err))
    } finally {
      setUploading(false)
    }
    if (problems.length) setError(problems.join(' '))
  }

  const run = (p: Promise<unknown>) => {
    setError(null)
    p.catch((err: unknown) => setError(errorMessage(err)))
  }

  return (
    <section className="card">
      <div className="card-h">
        <h3>Fotos da peça</h3>
        <span className="muted tiny">
          {g.photos.length} de {MAX_PHOTOS}
        </span>
        {canEdit && (
          <div className="actions gp-ph-actions">
            <label htmlFor={kindId} className="sr-only">
              Tipo da foto
            </label>
            <select id={kindId} className="gp-select" value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {PHOTO_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label className={`btn btn-sm${full || uploading ? ' is-disabled' : ''}`}>
              <Icon name="camera" size={13} />
              {uploading ? 'Enviando…' : 'Enviar fotos'}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={full || uploading} onChange={onFiles} aria-label="Enviar fotos" />
            </label>
          </div>
        )}
      </div>
      <div className="card-b gp-ph-b">
        {error && (
          <div className="note red" role="alert">
            <Icon name="alerta" size={15} />
            <span>{error}</span>
          </div>
        )}
        {g.photos.length === 0 ? (
          <div className="gp-ph-empty">
            <div className="gp-ph-sil" aria-hidden="true">
              <Silhouette categorySlug={g.categorySlug} style={g.style} length={g.length} colorHex={g.colorHex} />
            </div>
            <EmptyState
              icon="camera"
              title="Nenhuma foto ainda"
              description={
                canEdit
                  ? 'Envie frente, costas e detalhes. Até lá, a peça aparece como silhueta na cor cadastrada.'
                  : 'Até alguém enviar fotos, a peça aparece como silhueta na cor cadastrada.'
              }
            />
          </div>
        ) : (
          <ul className="gp-photos" aria-label="Fotos da peça">
            {g.photos.map((p, i) => (
              <li key={p.id} className={p.isCover ? 'gp-photo is-cover' : 'gp-photo'}>
                <div className="gp-photo-img">
                  <img src={p.url} alt={`${g.name} — ${PHOTO_KIND_LABEL[p.kind]} (${i + 1})`} />
                  {p.isCover && (
                    <span className="gp-photo-cover">
                      <Badge tone="wine">Capa</Badge>
                    </span>
                  )}
                </div>
                <div className="gp-photo-f">
                  <span className="tiny">{PHOTO_KIND_LABEL[p.kind]}</span>
                  {canEdit && (
                    <span className="gp-photo-btns">
                      {!p.isCover && (
                        <Button size="sm" variant="ghost" onClick={() => run(cover.mutateAsync(p.id))} aria-label={`Definir foto ${i + 1} como capa`}>
                          Tornar capa
                        </Button>
                      )}
                      <button type="button" className="icon-btn" aria-label={`Remover foto ${i + 1}`} onClick={() => run(remove.mutateAsync(p.id))}>
                        <Icon name="lixo" size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="tiny muted">Nesta prévia as fotos ficam só neste navegador e somem ao recarregar a página.</p>
      </div>
    </section>
  )
}
