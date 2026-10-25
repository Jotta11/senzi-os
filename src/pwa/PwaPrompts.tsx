import { useState } from 'react'
import { Button, Icon, Modal } from '@/ui'
import { applyUpdate, dismissUpdate, promptInstall, usePwa } from './pwa'
import './pwa.css'

/**
 * "Instalar app" no rodapé da sidebar. No Chrome/Edge/Android abre o diálogo nativo; no iPhone/iPad
 * (Safari não tem esse diálogo) explica o caminho pelo menu Compartilhar. Some quando já está instalado.
 */
export function InstallAppButton() {
  const { canInstall, iosHint, standalone } = usePwa()
  const [help, setHelp] = useState(false)
  if (standalone || (!canInstall && !iosHint)) return null
  return (
    <>
      <button
        type="button"
        className="sb-install"
        aria-label="Instalar app"
        title="Instalar app"
        onClick={() => (canInstall ? void promptInstall() : setHelp(true))}
      >
        <Icon name="instalar" size={15} />
        <span className="sb-install-t">
          <b>Instalar app</b>
          <span>Abrir direto da tela inicial</span>
        </span>
      </button>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        size="sm"
        title="Instalar no iPhone ou iPad"
        description="O Senzi OS fica na tela inicial e abre em tela cheia, como um app."
        footer={<Button variant="primary" onClick={() => setHelp(false)}>Entendi</Button>}
      >
        <ol className="pwa-steps">
          <li>
            <span className="pwa-step-ic" aria-hidden="true"><Icon name="compartilhar" size={16} /></span>
            <span>No Safari, toque em <b>Compartilhar</b> (na barra de baixo ou no topo).</span>
          </li>
          <li>
            <span className="pwa-step-ic" aria-hidden="true"><Icon name="plus" size={16} /></span>
            <span>Escolha <b>Adicionar à Tela de Início</b>.</span>
          </li>
          <li>
            <span className="pwa-step-ic" aria-hidden="true"><Icon name="check" size={16} /></span>
            <span>Toque em <b>Adicionar</b>. O ícone da Senzi aparece com os seus apps.</span>
          </li>
        </ol>
      </Modal>
    </>
  )
}

/** Aviso fixo quando uma versão nova foi baixada: atualizar agora ou deixar para a próxima abertura. */
export function UpdateBanner() {
  const { updateReady } = usePwa()
  if (!updateReady) return null
  return (
    <div className="pwa-update" role="status">
      <Icon name="refresh" size={16} />
      <p>
        <b>Nova versão disponível.</b>
        <span>Atualize para usar as últimas melhorias.</span>
      </p>
      <Button variant="primary" onClick={applyUpdate}>Atualizar</Button>
      <button type="button" className="pwa-update-x" aria-label="Depois" title="Depois" onClick={dismissUpdate}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
