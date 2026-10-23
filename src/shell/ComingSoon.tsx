import './shell.css'

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="sb-pad">
      <p className="eyebrow">Em construção</p>
      <h1 className="display">{title}</h1>
      <p>Esta área será liberada em uma próxima etapa do Senzi OS.</p>
    </div>
  )
}
