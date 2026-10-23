import { Link } from 'react-router'
import { buttonClass } from '@/ui'
import './shell.css'

export function RestrictedPage() {
  return (
    <div className="sb-pad">
      <p className="eyebrow">Permissão</p>
      <h1 className="display">Acesso restrito</h1>
      <p>Você não tem permissão para ver esta área. Se precisar dela, fale com um administrador.</p>
      <p><Link to="/" className={buttonClass()}>Voltar ao início</Link></p>
    </div>
  )
}
