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

1. `supabase login`
2. `supabase link --project-ref <ref>`
3. `supabase db push`
4. `supabase functions deploy admin-users`
5. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
