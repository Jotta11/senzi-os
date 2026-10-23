# Senzi OS — Plano 1: Fundação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projeto React + Supabase rodando, com a nova identidade visual, login, dois perfis com permissões garantidas no banco (RLS), auditoria por trigger, autorização de exceção por PIN, gestão de usuários e uma página de prévia visual para o João aprovar antes das telas de negócio.

**Architecture:** SPA Vite/React/TS falando direto com o Supabase (PostgREST + RPC). Toda regra de acesso vive no Postgres: catálogo de permissões em tabela, função `has_perm()` usada por RLS e por RPCs. Migrations em `supabase/migrations` são testadas em Vitest contra PGlite (Postgres WASM, sem Docker) com um shim do schema `auth`. Criação de usuários (precisa de service role) fica numa Edge Function.

**Tech Stack:** pnpm, Vite ≥7, React ≥19, TypeScript strict, React Router ≥7 (modo biblioteca), TanStack Query ≥5, React Hook Form + Zod, @supabase/supabase-js ≥2, Vitest ≥3.2 (projects `web` jsdom e `db` node), @testing-library/react, @electric-sql/pglite (+ contrib `btree_gist`, `pg_trgm`, `pgcrypto`), Supabase CLI (já instalado em `/opt/homebrew/bin/supabase`).

**Spec:** `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (seções 3.8, 5, 6, 7). Referência funcional: `SenzieOS_v0.2_3.html` (permissões em ~1100–1215, nav em ~3636–3646, design tokens em ~20–200).

**Sequência de planos:** 1 Fundação (este) → 2 Acervo + Clientes → 3 Agenda + Provas → 4 Reservas/pagamentos/PDF/WhatsApp → 5 Operação → 6 Financeiro → 7 Dashboard + Inteligência. Cada plano é escrito quando o anterior termina.

## Global Constraints

- Nome da marca: **Senzi** / "Senzi OS" / "Senzi Club". A string `Senzie` não pode aparecer em `src/` nem `supabase/`.
- Interface 100% pt-BR; moeda BRL; datas `dd/mm/aaaa`; fuso `America/Araguaina`.
- **Modo único claro**: nenhum `prefers-color-scheme`, nenhum tema escuro; `<meta name="color-scheme" content="light">`.
- Paleta (exata): Cranberry `#3F1116`, Beige `#FEEFDC`, Cranberry Vivo `#6E2027`, Papel `#FBF3E8`, Areia `#E1D1B9`, Tinta `#1C1A18`, Névoa `#6F645B`. Sidebar inteira em Cranberry com texto Beige; Cranberry Vivo só em links/foco/botão primário.
- Tipografia: Instrument Sans (texto), Instrument Serif (display), IBM Plex Mono (códigos), via Google Fonts.
- Contraste WCAG AA (≥ 4.5:1) para todo par texto/fundo dos tokens.
- Perfis: só `admin` e `atendimento`. Permissão vale no banco; checagem no front é só conveniência.
- Nenhuma chave `service_role` no front. Variáveis do front: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- O arquivo `SenzieOS_v0.2_3.html` permanece intocado na raiz como referência.

## Review Focus

1. App aberto sem `.env` (situação atual: sem conta Supabase) → tela "Configurar conexão" com instruções, não tela branca. *(teste na Task 5)*
2. Usuário desativado com sessão ainda válida → `has_perm()` retorna false para tudo, RLS devolve zero linhas, e o front faz logout com aviso. *(testes nas Tasks 3 e 5)*
3. Atendimento digitando `/config` ou consultando `audit_log` direto pela API → "Acesso restrito" na tela e 0 linhas no banco. *(testes nas Tasks 3, 4 e 6)*
4. Força bruta de PIN → bloqueio após 5 falhas em 15 min para aquele admin; mensagem de erro igual para "admin não existe" e "PIN errado". *(teste na Task 4)*
5. Admin rebaixando/desativando a si mesmo ou o último admin ativo → recusado pelo banco. *(teste na Task 3)*

---

### Task 1: Esqueleto do projeto

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`, `.env.example`, `README.md`, `src/main.tsx`, `src/app/App.tsx`, `src/test/setup.ts`, `src/test/brand.test.ts`, `src/app/App.test.tsx`
- Create (via `supabase init`): `supabase/config.toml`

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm build`, `pnpm test` (todos os projetos), `pnpm test:web`, `pnpm test:db`, `pnpm typecheck`, `pnpm lint`. Alias de import `@/` → `src/`.

- [ ] **Step 1:** `git init` na raiz; `.gitignore` com `node_modules`, `dist`, `.env`, `.env.local`, `supabase/.temp`, `.DS_Store`. Primeiro commit só com `SenzieOS_v0.2_3.html`, `anotacoes.txt` e `docs/`.
- [ ] **Step 2:** Criar o projeto Vite React-TS com pnpm, TypeScript `strict: true`, alias `@/`. `index.html`: `lang="pt-BR"`, `<title>Senzi OS</title>`, `<meta name="color-scheme" content="light">`. Rodar `supabase init` (não precisa de Docker).
- [ ] **Step 3:** `vitest.config.ts` com dois projects: `web` (environment `jsdom`, include `src/**/*.test.{ts,tsx}`, setup `src/test/setup.ts` com `@testing-library/jest-dom`) e `db` (environment `node`, include `tests/db/**/*.test.ts`, `testTimeout: 30000`).
- [ ] **Step 4: Write the failing tests**
  - `src/test/brand.test.ts` → `it('nenhum arquivo em src/ ou supabase/ contém "Senzie"')`: lê recursivamente os dois diretórios (ignorando o próprio teste) e espera lista vazia de arquivos com `/Senzie/`.
  - `src/app/App.test.tsx` → `it('renderiza o nome Senzi OS')`: `render(<App />)`; `expect(screen.getByText('Senzi OS')).toBeInTheDocument()`.
- [ ] **Step 5:** `pnpm test:web` → FAIL em `App.test.tsx` (App ainda sem o texto).
- [ ] **Step 6:** `App.tsx` mínimo exibindo "Senzi OS". `.env.example` com `VITE_SUPABASE_URL=` e `VITE_SUPABASE_ANON_KEY=` comentados em pt-BR. `README.md`: como rodar, e a seção "Conectar ao Supabase" (`supabase login`, `supabase link --project-ref <ref>`, `supabase db push`, `supabase functions deploy admin-users`, preencher `.env`).
- [ ] **Step 7:** `pnpm test:web && pnpm typecheck && pnpm build` → tudo verde.
- [ ] **Step 8: Commit** `chore: esqueleto do Senzi OS (vite, react, vitest, supabase init)`

---

### Task 2: Design system e página de prévia visual

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/lib/contrast.ts`, `src/lib/contrast.test.ts`, `src/ui/Button.tsx`, `src/ui/Card.tsx`, `src/ui/Badge.tsx`, `src/ui/Field.tsx`, `src/ui/Icon.tsx`, `src/ui/index.ts`, `src/preview/PreviewPage.tsx`, `src/preview/PreviewPage.test.tsx`
- Reference: `SenzieOS_v0.2_3.html:20-700` (tokens, componentes), ícones em `SZ.ICONS` (~linha 940)

**Interfaces:**
- Produces: `contrastRatio(fg: string, bg: string): number` (hex `#RRGGBB`); componentes `Button` (`variant: 'primary' | 'secondary' | 'ghost' | 'danger'`), `Card` (`title?`, `actions?`), `Badge` (`tone: 'green'|'wine'|'amber'|'indigo'|'teal'|'ochre'|'stone'|'red'`), `Field` (label + input/textarea/select + `error?`), `Icon` (`name` = chaves de `SZ.ICONS` do protótipo). Tokens CSS: `--cranberry --beige --vivo --papel --areia --tinta --nevoa --surface(#FFFFFF)` + tons de status `--t-*`/`--t-*-bg`/`--t-*-line` e raios/sombras do protótipo.

- [ ] **Step 1: Write the failing test** `src/lib/contrast.test.ts`:
  - `contrastRatio('#000000','#FFFFFF')` ≈ 21 (toBeCloseTo, 1).
  - Todos ≥ 4.5: Beige/Cranberry (14.27), Branco/Vivo (11.06), Tinta/Papel (15.77), Tinta/Branco (17.35), Névoa/Papel (5.23), Névoa/Branco (5.75), Vivo/Papel (10.05).
  - Para cada tom de status `--t-X` sobre seu `--t-X-bg` (valores lidos de `tokens.css` via `fs` + regex): ≥ 4.5.
- [ ] **Step 2:** `pnpm test:web src/lib/contrast.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `contrastRatio` (luminância relativa WCAG 2.x). Escrever `tokens.css` com a paleta exata e os tons de status do protótipo **dessaturados para conviver com a paleta quente** (ajustar até o teste passar). `base.css`: `body` com fundo Papel + textura (gradiente linear vertical `#FEEFDC → #F1E2CC` sutil, `background-attachment: fixed`), texto Tinta, fontes; cards brancos com borda Areia `1px` e `--shadow-1`; foco visível `outline: 2px solid var(--vivo)`.
- [ ] **Step 4:** `pnpm test:web src/lib/contrast.test.ts` → PASS.
- [ ] **Step 5:** Portar `Button`, `Card`, `Badge`, `Field`, `Icon` do visual do protótipo para os novos tokens.
- [ ] **Step 6: Test** `PreviewPage.test.tsx` → `it('mostra sidebar, alertas, agenda de 4 dias e mini calendário')`: espera `getByRole('navigation')`, `getByText('Alertas')`, 4 elementos com `data-testid="agenda-day"` visíveis no primeiro bloco e `getByRole('grid', {name: /calendário/i})`.
- [ ] **Step 7:** `PreviewPage` estática, rota pública `/preview` (sem login, dados fictícios hard-coded): sidebar Cranberry com os itens do menu; dashboard conforme spec 3.1 (alertas no topo, bloco agenda expandido com mini calendário à direita, Faturamento com botão "Ver financeiro completo", Ciclo operacional com "Ver operação"); abaixo, faixa da Agenda com 4 dias visíveis e rolagem horizontal, semana segunda→domingo, um compromisso "Interno" com estilo distinto. Badges de todos os tons de status.
- [ ] **Step 8:** `pnpm test:web` → PASS. `pnpm dev`, abrir `/preview` e conferir manualmente em 1440px e 820px (tablet).
- [ ] **Step 9: Commit** `feat: design system Senzi e página de prévia visual`
- [ ] **Step 10: CHECKPOINT** — publicar a prévia para o João aprovar cores/layout. Ajustes de tokens entram aqui antes de seguir.

---

### Task 3: Banco — usuários, perfis e permissões com RLS

**Files:**
- Create: `supabase/migrations/20261023000100_acesso.sql`, `supabase/tests/shims/auth.sql`, `tests/db/harness.ts`, `tests/db/acesso.test.ts`, `src/auth/permissions.ts`

**Interfaces:**
- Produces (SQL, schema `public`):
  - `app_role` enum `('admin','atendimento')`.
  - `permission(key text pk, label text not null)`.
  - `role_permission(role app_role, permission_key text references permission, pk(role, permission_key))`.
  - `app_user(id uuid pk references auth.users on delete cascade, full_name text not null, email text not null unique, role app_role not null default 'atendimento', is_active boolean not null default true, pin_hash text, created_at timestamptz default now(), updated_at timestamptz default now())`.
  - `user_permission_override(user_id uuid references app_user, permission_key text references permission, granted boolean not null, pk(user_id, permission_key))`.
  - `has_perm(p text) returns boolean` — `stable security definer`, `search_path = public`; false se `auth.uid()` nulo ou usuário inativo; senão (perm do perfil ∪ concedidas) − revogadas.
  - `my_permissions() returns setof text` (mesma regra, para o front).
  - RPC `admin_update_user(p_user_id uuid, p_role app_role, p_is_active boolean, p_overrides jsonb)` — exige `has_perm('config.users')`; recusa (`raise exception 'ULTIMO_ADMIN'`) se deixar zero admins ativos; recusa (`'AUTO_REBAIXAMENTO'`) se `p_user_id = auth.uid()` e mudar o próprio role ou desativar.
- Produces (TS): `src/auth/permissions.ts` exporta `PERMISSIONS` (`as const`, mesmo catálogo e labels do SQL) e `type Perm = keyof typeof PERMISSIONS`.
- Produces (testes): `tests/db/harness.ts` exporta `createTestDb(): Promise<PGlite>` (carrega contrib, roda shim e todas as migrations em ordem) e `asUser(db, userId: string | null, fn: (tx) => Promise<T>): Promise<T>` (em transação: `set local role authenticated` e `set local request.jwt.claims = '{"sub": "<id>"}'`), `createUser(db, {email, full_name, role, is_active?}): Promise<string>`.

Catálogo (copiar labels do protótipo `SZ.PERMISSIONS`, com estas mudanças): `reserva.create` = "Criar reserva"; novo `agenda.manage` = "Criar e editar compromissos"; novo `financeiro.geral` = "Ver e gerir contas a pagar, a receber e categorias"; `financeiro.view` = "Ver o financeiro das reservas". `admin` = todas. `atendimento` = união de `atendimento` e `operacao` do protótipo + `agenda.manage`; **sem** `acervo.cost`, `financeiro.consolidated`, `financeiro.geral`, `inteligencia.view`, `reserva.authorize`, `config.*`.

Shim `auth.sql` (só para testes): schema `auth`, tabela `auth.users(id uuid pk, email text)`, função `auth.uid()` lendo `current_setting('request.jwt.claims', true)::json->>'sub'`, roles `anon`, `authenticated`, `service_role` (se não existirem).

- [ ] **Step 1: Write the failing tests** `tests/db/acesso.test.ts`:
  - `has_perm` de admin ativo para `config.users` → true; de atendimento → false; de atendimento para `operacao.inspect` → true.
  - Override: atendimento com `inteligencia.view` concedida → true; admin com `config.audit` revogada → false.
  - Usuário inativo → `has_perm('dashboard.view')` false e `select * from app_user` como ele retorna 0 linhas.
  - RLS `app_user`: atendimento vê apenas a própria linha; admin vê todas; atendimento `update app_user set role='admin'` afeta 0 linhas.
  - `admin_update_user` desativando o único admin → erro `ULTIMO_ADMIN`; admin mudando o próprio role → `AUTO_REBAIXAMENTO`; atendimento chamando → erro de permissão.
  - Sincronia: `select key from permission order by key` == `Object.keys(PERMISSIONS).sort()` importado de `src/auth/permissions.ts`.
- [ ] **Step 2:** `pnpm test:db` → FAIL.
- [ ] **Step 3:** Escrever harness, shim e a migration (`create extension if not exists` para `btree_gist`, `pg_trgm`, `pgcrypto`; tabelas; RLS habilitado em todas; policies usando `has_perm`; `grant` para `authenticated`; trigger `updated_at`). Escrever `src/auth/permissions.ts`.
- [ ] **Step 4:** `pnpm test:db` → PASS.
- [ ] **Step 5: Commit** `feat(db): perfis, permissões e RLS de usuários`

---

### Task 4: Banco — auditoria e autorização por PIN

**Files:**
- Create: `supabase/migrations/20261023000200_auditoria.sql`, `supabase/migrations/20261023000300_excecoes.sql`, `tests/db/auditoria.test.ts`, `tests/db/excecoes.test.ts`

**Interfaces:**
- Consumes: `has_perm`, `app_user`, harness (Task 3).
- Produces:
  - `audit_log(id bigint identity pk, at timestamptz default now(), actor_id uuid, table_name text, row_id text, action text check in ('insert','update','delete'), before jsonb, after jsonb)`; índice `(table_name, row_id)` e `(at desc)`. RLS: select só com `has_perm('config.audit')`; nenhum insert/update/delete via API.
  - `audit_trigger()` — trigger genérico `after insert or update or delete for each row`, `security definer`; `before`/`after` sem as colunas `pin_hash`. Aplicado a `app_user` e `user_permission_override` aqui; planos seguintes aplicam às suas tabelas com `create trigger ... execute function audit_trigger()`.
  - `set_my_pin(p_pin text)` — exige role admin; PIN de 4 a 6 dígitos (`'PIN_INVALIDO'`); grava `crypt(p_pin, gen_salt('bf'))`.
  - `exception_authorization(id uuid pk default gen_random_uuid(), kind text not null, reason text not null, ref_type text, ref_id uuid, requested_by uuid references app_user, authorized_by uuid references app_user, created_at timestamptz default now())`.
  - `pin_attempt(admin_id uuid, at timestamptz default now(), ok boolean)`.
  - `authorize_exception(p_admin_email text, p_pin text, p_kind text, p_reason text, p_ref_type text, p_ref_id uuid) returns uuid` — `security definer`; `p_kind in ('retirada_com_saldo','desconto_acima_limite','dispensa_sinal_minimo')`; `p_reason` obrigatório (`'MOTIVO_OBRIGATORIO'`); bloqueia com `'PIN_BLOQUEADO'` se ≥ 5 falhas daquele admin nos últimos 15 min; admin inexistente, inativo, sem PIN ou PIN errado → mesmo erro `'AUTORIZACAO_INVALIDA'`; sucesso grava a autorização com `requested_by = auth.uid()` e retorna o id.

- [ ] **Step 1: Write the failing tests**
  - `auditoria.test.ts`: update de `app_user.full_name` por admin gera 1 linha em `audit_log` com `actor_id` = admin, `action='update'`, `before->>'full_name'` antigo e `after->>'full_name'` novo; `pin_hash` ausente em `before` e `after`; atendimento lendo `audit_log` → 0 linhas; admin → ≥ 1; atendimento `delete from audit_log` → 0 linhas afetadas.
  - `excecoes.test.ts`: PIN `'1234'` correto → retorna uuid e linha com `authorized_by` = admin e `requested_by` = atendimento; PIN errado e e-mail inexistente → ambos `AUTORIZACAO_INVALIDA`; 5 erros seguidos → 6ª tentativa com PIN **certo** → `PIN_BLOQUEADO`; motivo vazio → `MOTIVO_OBRIGATORIO`; `set_my_pin('12')` → `PIN_INVALIDO`; atendimento chamando `set_my_pin` → erro.
- [ ] **Step 2:** `pnpm test:db` → FAIL.
- [ ] **Step 3:** Escrever as duas migrations.
- [ ] **Step 4:** `pnpm test:db` → PASS.
- [ ] **Step 5: Commit** `feat(db): auditoria por trigger e autorização de exceção por PIN`

---

### Task 5: Cliente Supabase, login e sessão

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase.ts`, `src/lib/queryClient.ts`, `src/auth/AuthProvider.tsx`, `src/auth/usePermissions.ts`, `src/auth/LoginPage.tsx`, `src/auth/SetupScreen.tsx`, `src/auth/auth.test.tsx`
- Modify: `src/main.tsx`, `src/app/App.tsx`

**Interfaces:**
- Consumes: `my_permissions()`, `app_user` (Task 3); `Perm` (Task 3).
- Produces:
  - `getEnv(): { url: string; anonKey: string } | null` (null se faltar variável).
  - `supabase` (cliente único) — só criado quando `getEnv()` não é null.
  - `useAuth(): { status: 'loading' | 'signed_out' | 'signed_in'; user: AppUser | null; signIn(email, password): Promise<void>; signOut(): Promise<void> }` onde `AppUser = { id; full_name; email; role: 'admin' | 'atendimento'; is_active }`.
  - `usePermissions(): { can(p: Perm): boolean; perms: Set<Perm>; isLoading: boolean }` (TanStack Query, key `['my_permissions']`).

- [ ] **Step 1: Write the failing tests** `src/auth/auth.test.tsx` (mockar `@/lib/supabase` e `@/lib/env`):
  - Sem env → renderiza `SetupScreen` com texto "Configurar conexão" e o nome das duas variáveis.
  - Signed out → `LoginPage`; submit com e-mail/senha chama `signInWithPassword`; erro de credencial mostra "E-mail ou senha incorretos".
  - Signed in com `app_user.is_active = false` → chama `signOut` e mostra "Seu acesso foi desativado. Fale com um administrador."
  - `can('config.users')` false quando `my_permissions` retorna só perms de atendimento.
- [ ] **Step 2:** `pnpm test:web src/auth` → FAIL.
- [ ] **Step 3:** Implementar. `LoginPage` no visual da marca (painel Cranberry com logotipo textual "Senzi" à esquerda, formulário em card branco). Sem "criar conta" e sem login social. "Esqueci minha senha" usa `resetPasswordForEmail`.
- [ ] **Step 4:** `pnpm test:web` → PASS.
- [ ] **Step 5: Commit** `feat: login, sessão e permissões no front`

---

### Task 6: Shell do app — sidebar, rotas e guarda de permissão

**Files:**
- Create: `src/shell/nav.ts`, `src/shell/AppShell.tsx`, `src/shell/Sidebar.tsx`, `src/shell/RequirePerm.tsx`, `src/shell/RestrictedPage.tsx`, `src/shell/ComingSoon.tsx`, `src/app/router.tsx`, `src/shell/shell.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `usePermissions` (Task 5); `Icon` (Task 2).
- Produces: `NAV: { path: string; icon: IconName; label: string; perm: Perm }[]`, na ordem do protótipo: Dashboard `/` `dashboard.view`; Agenda `/agenda` `agenda.view`; Reservas `/reservas` `reserva.view`; Acervo `/acervo` `acervo.view`; Clientes `/clientes` `cliente.view`; Operação `/operacao` `operacao.view`; Financeiro `/financeiro` `financeiro.view`; Inteligência `/inteligencia` `inteligencia.view`; Configurações `/config` `config.view`. `<RequirePerm perm>` envolve cada rota. As telas de negócio são `ComingSoon` até seus planos.

- [ ] **Step 1: Write the failing tests** `shell.test.tsx`:
  - Atendimento: sidebar **não** tem "Inteligência" nem "Configurações"; tem "Financeiro" (por `financeiro.view`) e "Operação".
  - Admin: os 9 itens na ordem acima.
  - Atendimento navegando para `/config` → `RestrictedPage` com "Acesso restrito".
  - Item ativo tem `aria-current="page"`.
  - Rodapé da sidebar mostra nome do usuário e botão "Sair", que chama `signOut`.
- [ ] **Step 2:** `pnpm test:web src/shell` → FAIL.
- [ ] **Step 3:** Implementar. Sidebar Cranberry, largura 236px, texto/ícones Beige, item ativo com fundo `rgba(254,239,220,.12)` e barra Beige à esquerda; recolhe para gaveta abaixo de 900px. Conteúdo sobre o fundo texturizado.
- [ ] **Step 4:** `pnpm test:web` → PASS.
- [ ] **Step 5: Commit** `feat: shell com sidebar Cranberry e guarda de rotas`

---

### Task 7: Configurações — usuários, PIN e auditoria

**Files:**
- Create: `supabase/functions/admin-users/index.ts`, `supabase/functions/admin-users/handler.ts`, `supabase/functions/admin-users/handler.test.ts`, `src/features/config/ConfigPage.tsx`, `src/features/config/UsersTab.tsx`, `src/features/config/UserForm.tsx`, `src/features/config/PinTab.tsx`, `src/features/config/AuditTab.tsx`, `src/features/config/config.test.tsx`, `src/features/exceptions/AuthorizeExceptionDialog.tsx`, `src/features/exceptions/AuthorizeExceptionDialog.test.tsx`, `scripts/bootstrap-admin.ts`
- Modify: `src/app/router.tsx` (rota `/config`), `vitest.config.ts` (incluir `supabase/functions/**/*.test.ts` no project `db`)

**Interfaces:**
- Consumes: `admin_update_user`, `set_my_pin`, `authorize_exception`, `audit_log` (Tasks 3–4); `PERMISSIONS` (Task 3).
- Produces:
  - Edge Function `admin-users` — `POST {action:'create', email, full_name, role, password}`; valida o JWT do chamador, exige `has_perm('config.users')` (via RPC com o token do chamador), cria em `auth.users` com service role e insere `app_user`. `handler.ts` exporta `handleAdminUsers(req: Request, deps: { getCaller(token): Promise<{id: string; canManageUsers: boolean} | null>; createAuthUser(...): Promise<string>; insertAppUser(...): Promise<void> }): Promise<Response>` (Deno-agnóstico, testável no Vitest).
  - `<AuthorizeExceptionDialog kind refType refId onAuthorized(id: string)>` — campos: e-mail do administrador (select dos admins ativos), PIN (input `inputmode="numeric"`, mascarado), motivo; mapeia `AUTORIZACAO_INVALIDA` → "Administrador ou PIN inválido", `PIN_BLOQUEADO` → "Muitas tentativas. Tente de novo em 15 minutos.", `MOTIVO_OBRIGATORIO` → "Informe o motivo". Consumido pelos Planos 4 e 5.
  - `scripts/bootstrap-admin.ts` — `pnpm bootstrap:admin -- --email --name` lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente do terminal (nunca do `.env` do front) e cria o primeiro admin.

- [ ] **Step 1: Write the failing tests**
  - `handler.test.ts`: sem token → 401; chamador sem permissão → 403; e-mail inválido ou senha < 8 → 400 com mensagem pt-BR; sucesso → 201 com `{id}` e `insertAppUser` chamado com o role pedido.
  - `config.test.tsx`: aba Usuários lista usuários com perfil e status; salvar desativando a si mesmo exibe "Você não pode desativar ou rebaixar a si mesmo." (erro `AUTO_REBAIXAMENTO`) e `ULTIMO_ADMIN` exibe "É preciso manter ao menos um administrador ativo."; aba Permissões por usuário mostra o catálogo com estado herdado/concedido/revogado; aba PIN só aparece para admin; aba Auditoria lista `at`, ator, tabela, ação, com filtro por tabela e paginação de 50.
  - `AuthorizeExceptionDialog.test.tsx`: as três mensagens de erro acima; sucesso chama `onAuthorized` com o id.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Implementar handler + `index.ts` (Deno, wiring real das deps), telas, diálogo e script.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → tudo verde.
- [ ] **Step 5: Commit** `feat: configurações de usuários, PIN, auditoria e diálogo de exceção`

---

### Task 8: Verificação final da fundação

- [ ] **Step 1:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → verde; colar a saída no relatório.
- [ ] **Step 2:** `grep -rn "Senzie" src supabase` → sem resultados.
- [ ] **Step 3:** `grep -rn "prefers-color-scheme" src` → sem resultados.
- [ ] **Step 4:** Se o João já tiver criado o projeto Supabase: seguir o README (`link`, `db push`, `functions deploy`, `bootstrap:admin`) e testar login real como admin e como atendimento. Se não: registrar no relatório que a conexão real ficou pendente e que a prévia `/preview` e os testes PGlite cobrem a fundação.
- [ ] **Step 5: Commit** (se houver ajustes) `chore: verificação da fundação`
