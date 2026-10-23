import { Link } from 'react-router'
import { buttonClass } from '@/ui'
import './shell.css'

export function NotFound() {
  return (
    <div className="sb-pad">
      <h1 className="display">Página não encontrada</h1>
      <p>O endereço que você abriu não existe.</p>
      <p><Link to="/" className={buttonClass()}>Voltar ao início</Link></p>
    </div>
  )
}
