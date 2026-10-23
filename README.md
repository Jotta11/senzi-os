# Senzi OS

Back-office da Senzi Club (locação de vestidos), em React + Vite + Supabase.

## Como rodar

```bash
pnpm install
pnpm dev          # servidor de desenvolvimento
pnpm test         # todos os projetos de teste (web e db)
pnpm test:web     # testes de interface
pnpm test:db      # testes de banco
pnpm typecheck    # checagem de tipos
pnpm lint         # ESLint
pnpm build        # build de produção
```

## Conectar ao Supabase

Requer Node ≥ 22.18 (o script `bootstrap:admin` roda TypeScript com o type stripping nativo).

1. `supabase login`
2. `supabase link --project-ref <ref>`
3. `supabase db push` (aplica as migrations de `supabase/migrations`).
4. **Desligue o cadastro público** — usuários são criados só pelo administrador: no painel do
   Supabase, em *Authentication → Sign In / Providers* (ou *Settings*), desmarque
   **Allow new users to sign up**. (O `supabase/config.toml` já vem com `enable_signup = false`
   e senha mínima de 8 caracteres para o ambiente local.)
5. **URLs de redirecionamento** (usadas no e-mail de "Esqueci minha senha"): em
   *Authentication → URL Configuration*, defina o **Site URL** com a URL de produção e inclua em
   **Redirect URLs** a URL de produção e `http://localhost:5173`.
6. `supabase functions deploy admin-users` (criação de usuários pelo admin).
7. Crie o primeiro administrador (a senha é pedida no terminal, sem eco; `--password` só em CI):

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> \
     pnpm bootstrap:admin -- --email ana@senzi.com.br --name "Ana Souza"
   ```

   A chave `service_role` fica só no terminal — nunca em `.env.local` nem no front.
8. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
