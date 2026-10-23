/** Variáveis de conexão do front. `null` quando faltar qualquer uma (mostra a tela de configuração). */
export function getEnv(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) return null
  return { url, anonKey }
}
