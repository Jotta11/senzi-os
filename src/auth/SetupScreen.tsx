import './auth.css'
import { Card } from '@/ui'

export function SetupScreen() {
  return (
    <main className="auth-setup">
      <Card title="Configurar conexão">
          <p>O Senzi OS ainda não sabe a qual projeto Supabase se conectar.</p>
          <ol>
            <li>
              Copie <code>.env.example</code> para <code>.env.local</code>.
            </li>
            <li>
              Preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> com os dados de
              Project Settings &gt; API do seu projeto (use a chave anon, nunca a service_role).
            </li>
            <li>Reinicie o servidor de desenvolvimento.</li>
          </ol>
      </Card>
    </main>
  )
}
