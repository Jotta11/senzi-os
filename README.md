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

## App instalável (PWA)

O Senzi OS instala como app no celular, tablet e computador (ícone: o "Z" da Senzi em Beige sobre Cranberry).

- **Android / Chrome / Edge:** botão **Instalar app** na sidebar (ou no menu ☰ do celular).
- **iPhone / iPad:** no Safari, *Compartilhar → Adicionar à Tela de Início* (o botão Instalar app explica).
- **Onde o app abre:** em `/` quando `VITE_SUPABASE_URL` está definido no build; senão em `/preview`
  (prévia com dados fictícios). Para forçar outro caminho: `VITE_PWA_START_URL`.
- **Offline e atualização:** o service worker (gerado no `pnpm build` a partir de `src/pwa/sw.js`) guarda a
  versão atual do app e as fontes; dados do Supabase nunca vão para o cache. Cada build é uma versão nova e o
  app mostra o aviso "Nova versão disponível · Atualizar". O service worker só roda no build de produção
  (`pnpm build && pnpm preview`), não no `pnpm dev`.
- **Hospedagem:** precisa de HTTPS e de fallback de SPA (toda rota desconhecida → `index.html`); sirva
  `sw.js` e `manifest.webmanifest` sem cache longo.
- **Ícones:** já versionados em `public/`. Se a marca ou as cores mudarem, rode `pnpm icons` (precisa do
  Google Chrome instalado).

## Conectar ao Supabase

O app real (`/`, com login) usa o Supabase em **todas as telas**: Dashboard, Agenda, Provas, Reservas (contrato e OS),
Acervo, Clientes, Financeiro, Operação, Inteligência e Configurações. A prévia (`/preview`) continua com dados
fictícios em memória e não toca no banco.

Requer Node ≥ 22.18 (o script `bootstrap:admin` roda TypeScript com o type stripping nativo).

### O que as migrations fazem

`supabase db push` aplica, em ordem, tudo o que está em `supabase/migrations` — não há nada para criar à mão no banco:

- **Acesso e auditoria** (`20261023…`): usuários (`app_user`), perfis e permissões, ajustes por usuário, PIN de
  exceção, trilha de auditoria.
- **Negócio** (`20261027…`): acervo, clientes, agenda e provas, reservas (contratos, pagamentos, caução), financeiro
  (categorias, contas a pagar e a receber), operação (inspeção, higienização, manutenção) e as leituras do Dashboard e
  da Inteligência — tabelas, funções (RPCs) e regras.
- **Bucket `pecas-fotos`** no Storage (privado; fotos das peças, só imagens, até 10 MB) e as regras de acesso dele.
- **Dados de partida:** categorias de peça, categorias do financeiro (inclusive as de sistema), configurações gerais
  (higienização, preparação, multa, caução…) e o checklist de inspeção.

**O banco real começa vazio:** nenhuma peça, cliente, reserva ou lançamento de exemplo (esses existem só na prévia).
Não há seed de dados de exemplo para o banco real, de propósito — o cadastro começa pela loja.

### Passo a passo

1. `supabase login`
2. `supabase link --project-ref <ref>`
3. `supabase db push` (aplica as migrations — veja acima).
4. **Desligue o cadastro público** — usuários são criados só pelo administrador: no painel do
   Supabase, em *Authentication → Sign In / Providers* (ou *Settings*), desmarque
   **Allow new users to sign up**. (O `supabase/config.toml` já vem com `enable_signup = false`
   e senha mínima de 8 caracteres para o ambiente local.)
5. **URLs de redirecionamento** (usadas no e-mail de "Esqueci minha senha"): em
   *Authentication → URL Configuration*, defina o **Site URL** como `https://admin.senziclub.com` e inclua em
   **Redirect URLs** `https://admin.senziclub.com/**` e `http://localhost:5173/**`.
   (A Edge Function `admin-users` só aceita chamadas do navegador vindas desse domínio e do `localhost`;
   para mudar o domínio, edite `ALLOWED_ORIGINS` em `supabase/functions/admin-users/handler.ts`.)
6. **SMTP próprio** (*Authentication → Emails → SMTP Settings*): o servidor de e-mail padrão do Supabase manda
   pouquíssimos e-mails por hora e serve só para teste. Configure um SMTP (ex.: o do domínio da loja, SendGrid, Resend)
   antes de usar "Esqueci minha senha" de verdade.
7. **Data API** (*Project Settings → Data API*): mantenha ligada, com o schema `public` exposto — o app chama as
   funções (RPCs) por ela. As tabelas de negócio **não têm permissão de leitura/escrita direta** para `anon` nem
   `authenticated` (as migrations revogam): tudo passa pelas RPCs, que conferem a permissão de quem chama. Só as
   tabelas de acesso (`app_user`, `role_permission`, `user_permission_override`, `audit_log`) são lidas direto,
   protegidas por RLS. Não conceda permissões nas tabelas pelo painel.
8. **Storage:** nada a fazer — o bucket `pecas-fotos` e as regras dele vêm da migration (não crie à mão).
9. `supabase functions deploy admin-users` (criação de usuários pelo admin).
10. Crie o **primeiro administrador** (a senha é pedida no terminal, sem eco; `--password` só em CI):

    ```bash
    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> \
      pnpm bootstrap:admin -- --email ana@senzi.com.br --name "Ana Souza"
    ```

    A chave `service_role` fica só no terminal — nunca em `.env.local` nem no front. Os demais usuários são criados
    por esse administrador em *Configurações → Usuários*; cada administrador define o próprio PIN de exceções em
    *Configurações → PIN*.
11. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
