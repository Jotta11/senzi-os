# Senzi OS — Plano 2: Modo demonstração, Acervo e Clientes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O João navega pelo sistema no localhost sem Supabase (modo demonstração com banco no navegador) e usa de verdade as telas de Acervo e Clientes: listar, buscar, cadastrar, editar, fotos, caimento/medidas, bloqueio, "modelo ideal", observações, favoritos e recomendações.

**Architecture:** Toda regra continua no Postgres (migrations + RLS + RPC). Sem env do Supabase, `getSupabase()` devolve um **cliente demo** com a mesma interface usada pelo app, que executa SQL num PGlite no navegador (IndexedDB) rodando as mesmas migrations + seed, como role `authenticated` com claims — ou seja, RLS e RPCs reais. Listas com busca/filtro usam RPCs de busca (sem embeds PostgREST). Telas novas entram numa tabela de rotas com lazy loading.

**Tech Stack:** o do Plano 1 + `@electric-sql/pglite` no navegador (já é devDependency; vira dependency), `import.meta.glob` para embutir as migrations.

**Spec:** `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (3.4 Clientes, 4.2/4.3, 5, 6). Referência funcional: `SenzieOS_v0.2_3.html` — Acervo `UI.VIEWS.acervo` L4420–5124, Clientes `UI.VIEWS.clientes` L5137–5634, seed L2754–3620, `E.economics` L2041, `E.buffer` L1241, `E.window` L1266, `E.check` L1284, `E.calendar` L1322, `E.nextCode` L1470, `E.validateGarment` L2603, `E.customerStats` L2064. Pendências herdadas: `docs/superpowers/plans/2026-10-23-senzi-01-fundacao-pendencias.md`.

## Global Constraints

- Marca **Senzi**; nunca "Senzie" em `src/` e `supabase/` (inclusive seed: a marca do ateliê é "Ateliê Senzi").
- pt-BR, BRL, `dd/mm/aaaa`, fuso `America/Araguaina`. Fundo da app `var(--fundo)` (#F8F5F0); cards brancos com borda Areia; nada de fundos saturados.
- Migrations novas: nunca editar migrations já commitadas. Toda tabela nova: `enable row level security`, `revoke all ... from public, anon, authenticated` e grants explícitos; toda função: `revoke execute from public, anon`, grant a `authenticated`; security definer com `set search_path = public, pg_temp`; sequences de identity revogadas de anon/authenticated. Erros de RPC como texto exato (`SEM_PERMISSAO`, `PARAMETRO_INVALIDO`, ...) e cada código novo ganha mensagem pt-BR em `src/lib/errorMessages.ts`.
- Escrita de estado só via RPC; tabelas de negócio sem grant de insert/update/delete para `authenticated`.
- Auditoria: anexar `audit_trigger()` a toda tabela de negócio nova (padrão em `20261023000200_auditoria.sql`). Antes, alterar `audit_trigger` para **lançar erro** em tabela sem PK.
- Nunca `select('*')` nem embeds `tabela(*)`/`tabela(col)` no front; colunas explícitas. Busca/filtros de lista via RPC.
- Custos da peça (`acquisition_cost`, `retail_reference`, economia) só com `acervo.cost` — garantido no banco, não só escondido na tela.
- Nomes de pessoas em telas ("quem fez") via RPC `list_staff()`, não lendo `app_user`.
- Dados de demonstração e PGlite do navegador **nunca** carregam quando `VITE_SUPABASE_URL` está definido.

## Review Focus

1. Usuário de demo recarrega a página: dados cadastrados continuam lá (IndexedDB); se as migrations mudaram, o demo é recriado com aviso, sem tela branca. *(Task 1)*
2. Atendimento no modo demo tenta ver custo de peça (tela ou RPC direto) → não vê; RLS vale no demo igual ao real. *(Tasks 1, 2)*
3. CPF inválido, repetido ou com máscara; telefone com máscara; aniversário no futuro → mensagens pt-BR claras, nada salvo. *(Task 4)*
4. Bloqueio de peça sobrepondo bloqueio existente → recusado com o período conflitante. *(Task 2)*
5. Busca com acento/sem acento e por código/telefone/CPF encontra o registro; lista com 1.000 peças continua paginada e rápida. *(Tasks 2, 4)*

---

### Task 1: Modo demonstração (PGlite no navegador)

**Files:**
- Create: `src/lib/demo/demoDb.ts`, `src/lib/demo/demoClient.ts`, `src/lib/demo/demoAuth.ts`, `src/lib/demo/demoStorage.ts`, `src/lib/demo/demoFunctions.ts`, `src/lib/demo/migrations.ts`, `tests/db/demoClient.test.ts`, `src/shell/DemoBanner.tsx`, `supabase/seed/demo_users.sql`
- Modify: `src/lib/supabase.ts`, `src/auth/LoginPage.tsx`, `src/shell/AppShell.tsx`, `vitest.config.ts`, `package.json`

**Interfaces:**
- Produces: `isDemo(): boolean` (true quando `getEnv()` é null e `VITE_DISABLE_DEMO !== '1'`). `getSupabase()` passa a devolver o cliente demo nesse caso (tipo `SupabaseClient`, via cast documentado). `DEMO_USERS = { admin: {id, email:'admin@demo.senzi', full_name:'Júlia Senzi'}, atendimento: {id, email:'atendimento@demo.senzi', full_name:'Ana Lima'} }`, senha de ambos `demo1234`, PIN do admin `1234`.
- Cliente demo implementa exatamente: `from(t)` com `select(cols, {count:'exact', head?})`, `eq`, `neq`, `in`, `is`, `gte`, `lte`, `order(col,{ascending})`, `range(a,b)`, `limit(n)`, `single()`, `maybeSingle()`, `insert`, `update`, `upsert(row,{onConflict})`, `delete()` (thenable, retorna `{data, error, count}` no formato supabase-js; `error` = `{message, code}` com a mensagem do `raise`); `rpc(fn, args)` (escalar, jsonb, void ou set-returning → array); `auth.getSession/onAuthStateChange/signInWithPassword/signOut/updateUser/resetPasswordForEmail`; `functions.invoke('admin-users', {body})` chamando `handleAdminUsers` com deps sobre o PGlite; `storage.from(bucket).upload(path, file)` e `.createSignedUrl(path, secs)` guardando data URL em tabela demo. Qualquer outro método lança `Error('demo: <método> não suportado')`.
- `demoDb`: `getDemoDb(): Promise<PGlite>` — `idb://senzi-demo`; roda shim `supabase/tests/shims/auth.sql`, todas as migrations (ordem de nome) e `supabase/seed/*.sql` (ordem de nome) uma vez; guarda hash do conjunto em tabela `demo_meta`; hash diferente → apaga e recria, e `demoWasReset()` retorna true.
- Cada chamada roda em transação com `set local role authenticated` + `request.jwt.claims` do usuário demo logado (mesma técnica de `tests/db/harness.ts`).

- [ ] **Step 1: Write the failing tests** `tests/db/demoClient.test.ts` (projeto `db`, environment node, PGlite em memória via opção de teste de `getDemoDb({ dataDir: 'memory://' })`):
  - `from('permission').select('key,label').order('key').range(0,2)` → 3 linhas ordenadas; `{count:'exact', head:true}` → `count` igual a `select count(*)`.
  - `rpc('my_permissions')` logado como admin contém `config.users`; como atendimento não contém.
  - Como atendimento, `from('audit_log').select('id')` → `data: []`; `rpc('admin_update_user', …)` → `error.message === 'SEM_PERMISSAO'`.
  - `auth.signInWithPassword({email:'atendimento@demo.senzi', password:'demo1234'})` troca o usuário; senha errada → erro com `message` "Invalid login credentials".
  - Método não suportado lança `demo: <nome> não suportado`.
  - Recriação: mudar o hash simulado → `demoWasReset()` true e dados semeados presentes.
- [ ] **Step 2:** `pnpm test:db tests/db/demoClient.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. `migrations.ts` usa `import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true })` (idem shim e seed). `demo_users.sql` cria os 2 usuários em `auth.users`/`app_user` e o PIN do admin. PGlite carregado com `import()` dinâmico (fora do bundle principal). Login demo: na `LoginPage`, quando `isDemo()`, mostrar dois botões "Entrar como Administrador" / "Entrar como Atendimento" acima do formulário; o demo começa deslogado. `DemoBanner` fixo no topo do conteúdo: "Modo demonstração — os dados ficam só neste navegador." + botão "Restaurar dados de exemplo" (confirma e recria). Se `demoWasReset()`, toast "Os dados de demonstração foram recriados (o sistema foi atualizado)."
- [ ] **Step 4:** `pnpm test:db tests/db/demoClient.test.ts` → PASS; `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → verde. `pnpm build && pnpm preview`, abrir `/`, entrar como Administrador → shell com o menu; Configurações lista os 2 usuários.
- [ ] **Step 5: Commit** `feat: modo demonstração com Postgres no navegador`

---

### Task 2: Banco do Acervo

**Files:**
- Create: `supabase/migrations/20261024000100_acervo.sql`, `tests/db/acervo.test.ts`
- Modify: `src/auth/permissions.ts` (só se o catálogo mudar), `src/lib/errorMessages.ts`

**Interfaces (SQL, schema public):**
- Altera `audit_trigger()` para `raise exception 'AUDITORIA_SEM_PK'` em tabela sem PK.
- `list_staff() returns table(id uuid, full_name text)` — qualquer usuário ativo; todos os `app_user` (ativos e inativos).
- Enums: `garment_state` (`disponivel, reservado, retirado, em_uso, aguardando_devolucao, higienizacao, inspecao, ajuste, manutencao, bloqueado, baixado`), `size_equiv` (`PP,P,M,G,GG,U`), `garment_length` (`curto,midi,longo`), `fit_runs` (`menor,fiel,maior`), `fabric_stretch` (`nenhum,leve,alto`), `block_kind` (`locacao, higienizacao, inspecao, ajuste, manutencao, bloqueio_manual, editorial`), `photo_kind` (os 10 do protótipo).
- Tabelas (campos = protótipo, mapa em `SenzieOS_v0.2_3.html` L2765–2868 e L3322): `garment_category(id, slug unique, name, default_cleaning_days int, default_prep_days int, sort_order)`, `brand(id, name unique ci)`, `supplier(id, name, city, notes)`, `garment(id, code unique, name, category_id, brand_id, supplier_id, collection, label_size, size_equiv, color_primary, color_hex, fabric, length, neckline, sleeve, style, occasions text[], fit_notes, has_lining, allows_alteration, acquisition_cost numeric(12,2), retail_reference numeric(12,2), rental_price numeric(12,2) > 0, deposit_suggested numeric(12,2), state garment_state, cleaning_days, prep_days, location, acquired_at date, notes, fit_runs, bust_comfort_cm, waist_max_cm, hip_max_cm, hem_heel_cm, common_alteration, search tsvector/unaccent generated or trigram index, created_at, updated_at)`, `garment_measurement(garment_id pk, bust_cm, waist_cm, hip_cm, shoulder_cm, total_length_cm, hem_allowance_cm, stretch)`, `garment_photo(id, garment_id, kind, storage_path, label, position, is_cover)`, `garment_calendar_block(id, garment_id, reservation_id uuid null, maintenance_id uuid null, kind block_kind, period daterange not null, note, released_at, created_by, created_at)` com `exclude using gist (garment_id with =, period with &&) where (released_at is null)`, `garment_state_history(id, garment_id, from_state, to_state, reason, ref_type, ref_id, occurred_at, user_id)`.
- Custos: `authenticated` NÃO tem select em `acquisition_cost`/`retail_reference` (grant por coluna); leitura via `garment_costs(p_ids uuid[]) returns table(garment_id, acquisition_cost, retail_reference, revenue, cleaning, maintenance, result, payback, paid_back, rentals_to_payback)` que exige `acervo.cost` (`SEM_PERMISSAO`). Receita/higiene/manutenção = 0 até os Planos 4–5 (comentário no SQL dizendo onde entram).
- RPCs (todas checam permissão e gravam via security definer):
  - `search_garments(p_q text, p_category text, p_state_group text, p_size size_equiv, p_limit int, p_offset int) returns table(id, code, name, category_slug, color_primary, color_hex, label_size, size_equiv, state, rental_price, cover_path, total_count bigint)` — `acervo.view`; `p_q` sem acento e case-insensitive em code/name/color_primary/fabric; `p_state_group in ('todos','disponivel','reservado','em_uso','ciclo','bloqueado')` (ciclo = inspecao/higienizacao/ajuste/manutencao); ordem por code; `baixado` só aparece com `p_state_group='todos'`.
  - `create_garment(p jsonb) returns uuid` — `acervo.create`; gera `SZ-NNNN` (maior número + 1, 4 dígitos, sob advisory lock); valida nome ≥ 2 (`NOME_OBRIGATORIO`), `rental_price > 0` (`VALOR_LOCACAO_OBRIGATORIO`), custos ≥ 0 (`PARAMETRO_INVALIDO`); marca por nome case-insensitive, criando se não existir; cria `garment_measurement` vazio e histórico `null → disponivel` "Peça cadastrada no acervo".
  - `update_garment(p_id uuid, p jsonb)` — `acervo.edit`; custos só alterados se o chamador tem `acervo.cost` (senão ignorados).
  - `update_garment_fit(p_id, p jsonb)`, `update_garment_measurement(p_id, p jsonb)` — `acervo.edit`.
  - `add_garment_photo(p_garment uuid, p_kind photo_kind, p_path text) returns uuid`, `remove_garment_photo(p_id)`, `set_cover_photo(p_id)` — `acervo.edit`; primeira foto vira capa.
  - `block_garment(p_garment uuid, p_from date, p_to date, p_note text) returns uuid` — `acervo.block`; `p_to >= p_from` (`PERIODO_INVALIDO`); sobreposição → `CONFLITO_AGENDA` com detalhe do período em `hint`; se o período inclui hoje, estado → `bloqueado` com histórico.
  - `release_block(p_block uuid)` — `acervo.block`; só `bloqueio_manual` sem reserva; seta `released_at`; recalcula estado (`bloqueado → disponivel` se nada mais cobre hoje) com histórico.
  - `garment_calendar(p_garment uuid, p_from date, p_to date) returns table(day date, kind block_kind, block_id uuid, note text)` — `acervo.view`.
  - `buffer_days(p_garment uuid) returns table(cleaning int, prep int)` — peça → categoria → padrão 2/0.
- Auditoria anexada a todas as tabelas acima. Índices: trigram em `garment(name)`, `garment(code)`; `garment(category_id)`, `garment(state)`.

- [ ] **Step 1: Write the failing tests** `tests/db/acervo.test.ts`:
  - `create_garment` como admin → código `SZ-0001` no banco vazio e `SZ-0002` no seguinte; histórico com 1 linha; measurement criado; audit_log com insert de garment.
  - Atendimento (sem `acervo.create`) → `SEM_PERMISSAO`; nome "A" → `NOME_OBRIGATORIO`; preço 0 → `VALOR_LOCACAO_OBRIGATORIO`.
  - Atendimento: `select acquisition_cost from garment` → permission denied; `garment_costs` → `SEM_PERMISSAO`; admin → valores.
  - `update_garment` por atendimento com `acquisition_cost` no payload → custo inalterado.
  - `search_garments('verde', 'todos', 'todos', null, 20, 0)` encontra "Verde esmeralda"; `'verona'` acha "Vestido Verona"; `'VERÔNA'` também; `p_state_group='ciclo'` só estados de ciclo; `total_count` correto com `p_limit` 1.
  - `block_garment` sobrepondo outro bloqueio ativo → `CONFLITO_AGENDA`; após `release_block`, o mesmo período é aceito; período invertido → `PERIODO_INVALIDO`; bloqueio cobrindo hoje → estado `bloqueado`, liberar → `disponivel`.
  - Atendimento chama `release_block` sem `acervo.block` → `SEM_PERMISSAO`.
  - `audit_trigger` em tabela sem PK → `AUDITORIA_SEM_PK`.
  - Anon: nada nas tabelas novas nem nas funções.
- [ ] **Step 2:** `pnpm test:db tests/db/acervo.test.ts` → FAIL.
- [ ] **Step 3:** Escrever a migration. Adicionar mensagens pt-BR em `errorMessages.ts`: `NOME_OBRIGATORIO` "Informe o nome ou modelo da peça.", `VALOR_LOCACAO_OBRIGATORIO` "Informe o valor da locação.", `PERIODO_INVALIDO` "A data final deve ser igual ou posterior à inicial.", `CONFLITO_AGENDA` "A peça já tem compromisso nesse período.", `AUDITORIA_SEM_PK` (genérica).
- [ ] **Step 4:** `pnpm test:db` → PASS (todas as suítes).
- [ ] **Step 5: Commit** `feat(db): acervo — peças, medidas, fotos, agenda e busca`

---

### Task 3: Banco de Clientes e recomendações

**Files:**
- Create: `supabase/migrations/20261024000200_clientes.sql`, `tests/db/clientes.test.ts`
- Modify: `src/lib/errorMessages.ts`

**Interfaces:**
- `is_valid_cpf(p text) returns boolean` — imutável; aceita com ou sem máscara; rejeita 11 dígitos iguais; dígitos verificadores padrão.
- Enums: `lead_source` (`indicacao, instagram, passante, evento, google, outro`), `contact_channel` (`presencial, whatsapp, instagram, telefone`), `favorite_source` (`manual, prova`).
- Tabelas: `customer(id, code unique 'CL-NNNN', full_name not null, phone not null (só dígitos, 10–11), whatsapp, instagram, email, birth_date not null, document not null unique (CPF só dígitos), city, state char(2), lead_source, vip bool default false, notes, ideal_garment_id uuid references garment null, created_by, created_at, updated_at)`; `customer_measurement(id, customer_id, measured_at date, usual_size size_equiv, bust_cm, waist_cm, hip_cm, height_cm, shoulder_cm, shoe_size text, preferred_length garment_length, source text check in ('manual','modelo_ideal','prova'), source_garment_id uuid null, measured_by, notes)` (versionada: nunca update); `customer_preference(customer_id pk, preferred_colors text[], avoided_colors text[], preferred_styles text[], preferred_lengths text[], sleeve_preference, neckline_preference, fit_preference, updated_by, updated_at)`; `customer_interaction(id, customer_id, kind default 'observacao', channel contact_channel, content not null, pinned bool, occurred_at, author_id)`; `customer_favorite(customer_id, garment_id, source favorite_source, note, created_by, created_at, pk(customer_id, garment_id))`.
- RPCs:
  - `create_customer(p jsonb) returns uuid` — `cliente.create`; obrigatórios: nome ≥ 3 (`NOME_CLIENTE_OBRIGATORIO`), telefone 10–11 dígitos após limpar máscara (`TELEFONE_INVALIDO`), nascimento não futuro e não nulo (`NASCIMENTO_INVALIDO`), CPF válido (`CPF_INVALIDO`) e único (`CPF_DUPLICADO`); e-mail opcional com regex do protótipo (`EMAIL_INVALIDO`); gera `CL-NNNN` sob advisory lock; `whatsapp` = telefone se vazio; se `p->'measurement'` tem algum valor, cria versão; se `p->>'ideal_garment_id'`, grava e marca `source='modelo_ideal'`; upsert de preferências.
  - `update_customer(p_id, p jsonb)` — `cliente.edit`; mesmas validações (o protótipo não validava na edição — aqui valida).
  - `add_customer_measurement(p_customer, p jsonb) returns uuid` — `cliente.edit`.
  - `ideal_measurements(p_garment uuid) returns table(usual_size, bust_cm, waist_cm, hip_cm, shoulder_cm, preferred_length)` — `cliente.view`; vem de `garment.size_equiv`, `garment_measurement` e `garment.length`.
  - `add_customer_note(p_customer, p_content, p_channel, p_pinned) returns uuid` / `set_note_pinned(p_id, p_pinned)` — `cliente.note`; conteúdo vazio → `OBSERVACAO_OBRIGATORIA`.
  - `set_favorite(p_customer, p_garment, p_on bool, p_source favorite_source, p_note text)` — `cliente.edit`.
  - `search_customers(p_q text, p_sort text, p_limit int, p_offset int) returns table(id, code, full_name, phone, instagram, city, state, vip, rentals int, spent numeric, ticket numeric, next_event date, total_count bigint)` — `cliente.view`; busca sem acento em nome/telefone (dígitos)/instagram/code/cidade/CPF (dígitos); `p_sort in ('nome','gasto','locacoes','recentes')`; rentals/spent/ticket/next_event = 0/null até o Plano 4 (comentário); `spent`/`ticket` nulos sem `financeiro.view`.
  - `customer_profile(p_id) returns jsonb` — `cliente.view`; cadastro, medida atual, histórico de medidas, preferências, observações (com autor via `list_staff`-equivalente interno), favoritos (com code/name/color_hex/state/cover_path da peça), modelo ideal (code/name); CPF devolvido mascarado (`***.456.789-**`) para quem não tem `cliente.edit`.
  - `recommend_garments(p_customer uuid, p_limit int default 8) returns table(garment_id, code, name, color_primary, color_hex, size_equiv, rental_price, cover_path, score int, reasons text[])` — `cliente.view`. Algoritmo (só peças não `baixado`/`bloqueado`; exclui favoritas atuais):
    ```
    +4 size_equiv = usual_size da medida atual            reason 'No tamanho dela (M)'
    +3 mesma categoria do modelo ideal ou de uma favorita  reason 'Parecida com <nome da peça>'
    +2 color_primary contém uma cor preferida (ci, sem acento)  reason 'Cor que ela ama (<cor>)'
    -5 color_primary contém uma cor evitada                 (sem reason; nunca recomendar com score <= 0)
    +2 length em preferred_lengths (ou = preferred_length) reason 'Comprimento preferido'
    +2 bust_comfort_cm >= bust_cm da cliente e waist_max_cm >= waist_cm (quando ambos existem) reason 'Caimento compatível com as medidas'
    ordem: score desc, rental_price asc; limite p_limit
    ```
    (Os Planos 3–4 somarão sinais de provas e locações; deixar comentário com o ponto de extensão.)
- Auditoria anexada a todas as tabelas novas. Índices trigram em `customer(full_name)`; btree em `customer(document)`, `customer(phone)`.

- [ ] **Step 1: Write the failing tests** `tests/db/clientes.test.ts`:
  - `is_valid_cpf('529.982.247-25')` true; `'52998224725'` true; `'111.111.111-11'` false; `'529.982.247-24'` false.
  - `create_customer` válido → `CL-0001`, CPF salvo só com dígitos, `whatsapp` = telefone; sem CPF → `CPF_INVALIDO`; CPF repetido → `CPF_DUPLICADO`; telefone "123" → `TELEFONE_INVALIDO`; nascimento amanhã → `NASCIMENTO_INVALIDO`; sem nascimento → `NASCIMENTO_INVALIDO`; e-mail "x@" → `EMAIL_INVALIDO`.
  - Com `ideal_garment_id` e medidas → medição com `source='modelo_ideal'` e `source_garment_id`; `ideal_measurements` devolve medidas da peça.
  - `update_customer` com nome vazio → `NOME_CLIENTE_OBRIGATORIO`.
  - `add_customer_measurement` duas vezes → 2 versões, `customer_profile` traz a mais recente como atual.
  - `search_customers('mariana')` acha "Mariana Fontes Ribeiro"; por telefone com máscara "63 99612-4478"; por CPF; por `CL-0001`; ordenação 'nome' em pt-BR.
  - `customer_profile` como atendimento com `cliente.edit` vê CPF completo; um usuário com `cliente.edit` revogado vê mascarado.
  - `recommend_garments`: cliente M que evita "Amarelo" e ama "Verde" → primeira recomendação é peça M verde; nenhuma peça amarela; favoritas excluídas; `reasons` contém 'No tamanho dela (M)'.
  - `set_favorite` liga/desliga; `add_customer_note` vazio → `OBSERVACAO_OBRIGATORIA`; sem `cliente.note` → `SEM_PERMISSAO`.
- [ ] **Step 2:** `pnpm test:db tests/db/clientes.test.ts` → FAIL.
- [ ] **Step 3:** Escrever a migration e mensagens pt-BR: `NOME_CLIENTE_OBRIGATORIO` "Informe o nome completo da cliente.", `TELEFONE_INVALIDO` "Informe um telefone com DDD.", `NASCIMENTO_INVALIDO` "Informe a data de nascimento (não pode ser no futuro).", `CPF_INVALIDO` "CPF inválido.", `CPF_DUPLICADO` "Já existe uma cliente com este CPF.", `EMAIL_INVALIDO` "E-mail inválido.", `OBSERVACAO_OBRIGATORIA` "Escreva a observação.".
- [ ] **Step 4:** `pnpm test:db` → PASS.
- [ ] **Step 5: Commit** `feat(db): clientes — cadastro, medidas versionadas, observações, favoritos e recomendações`

---

### Task 4: Dados de demonstração

**Files:**
- Create: `supabase/seed/10_catalogo.sql`, `supabase/seed/20_clientes.sql`, `tests/db/seed.test.ts`
- Modify: `tests/db/harness.ts` (opção `createTestDb({ seed: true })`)

**Interfaces:** Seeds são SQL puro, idempotentes não são necessários (rodam uma vez num banco novo), inserem direto nas tabelas (como superuser, antes de qualquer sessão) e não chamam RPCs.

- [ ] **Step 1: Write the failing test** `tests/db/seed.test.ts` (`createTestDb({ seed: true })`): 8 categorias com slugs/dias do protótipo (L2765–2772); 10 marcas (com "Ateliê Senzi"); 28 peças `SZ-0107`…`SZ-0296` com medidas e caimento; ≥ 30 clientes com CPF válido (`is_valid_cpf` true para todos), telefone e nascimento preenchidos; ≥ 1 cliente com preferências, observações fixadas e favoritos; `search_garments('', 'todos', …)` total 28; nenhuma linha contém "Senzie".
- [ ] **Step 2:** `pnpm test:db tests/db/seed.test.ts` → FAIL.
- [ ] **Step 3:** Portar o seed do protótipo (L2754–3620) para SQL: categorias, marcas, fornecedores, peças (campos e caimento L3311–3324), medidas (fórmulas L2858–2866), clientes (L2904–2963) com CPFs válidos gerados e aniversários para todos, medidas, preferências, observações (L2997–3002), favoritos. Peças sem fotos (a tela usa a silhueta).
- [ ] **Step 4:** `pnpm test:db` → PASS; recriar o demo no navegador e ver as 28 peças.
- [ ] **Step 5: Commit** `feat: dados de demonstração do acervo e das clientes`

---

### Task 5: Infra de telas — rotas, formatação, silhueta, cliente de teste

**Files:**
- Create: `src/app/routes.tsx`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/ui/Silhouette.tsx`, `src/ui/Tabs.tsx`, `src/ui/Modal.tsx`, `src/ui/DataTable.tsx`, `src/ui/SearchInput.tsx`, `src/ui/Chips.tsx`, `src/ui/EmptyState.tsx`, `src/ui/ui.test.tsx`, `src/lib/useStaff.ts`
- Modify: `src/app/router.tsx`, `src/test/fakeSupabase.ts`, `src/auth/auth.test.tsx` (passar a usar o fake compartilhado)

**Interfaces:**
- `routes.tsx` exporta `APP_ROUTES: { path: string; perm: Perm; lazy: () => Promise<{ default: ComponentType }>; children?: ... }[]`; `/acervo`, `/acervo/:id`, `/clientes`, `/clientes/:id` entram aqui; demais itens do NAV continuam `ComingSoon`. Rotas carregadas com `React.lazy` + `Suspense` (fallback neutro).
- `format.ts`: `brl(n, {cents?:boolean})`, `dateBR(d)`, `dateTimeBR(d)` (fuso `America/Araguaina`), `ageFrom(birth)`, `maskCPF(digits)`, `maskPhone(digits)`, `onlyDigits(s)`, `normalize(s)` (sem acento, minúsculas).
- `Silhouette` — porta `SZ.silhouette`/`SZ.shapeFor` (protótipo L1033–1060) para SVG React: props `{ categorySlug, style?, length, colorHex, size? }`.
- `Tabs` acessíveis (roving tabindex, setas/Home/End; extrair do `ConfigPage`); `Modal` com foco inicial, focus trap, Escape fecha, `aria-modal`; `DataTable` com cabeçalhos e linhas clicáveis acessíveis; `SearchInput` com debounce 260 ms; `Chips` (grupo de filtros com `aria-pressed`); `EmptyState`.
- `useStaff()` → `Map<id, full_name>` via `rpc('list_staff')`.
- `fakeSupabase` ganha `insert/update/upsert/delete/is/neq/gte/lte/limit/rpc` registrando chamadas.

- [ ] **Step 1: Write the failing tests:** `format.test.ts` (`brl(890)` → "R$ 890,00"; `brl(890,{cents:false})` → "R$ 890"; `maskCPF('52998224725')` → "529.982.247-25"; `maskPhone('63996124478')` → "(63) 99612-4478"; `normalize('Verônica')` → "veronica"; `ageFrom` com aniversário amanhã não conta o ano); `ui.test.tsx` (Modal: foco inicial no primeiro campo, Tab preso, Escape chama onClose; Tabs: seta direita move foco e seleção; SearchInput chama onChange uma vez após 260 ms com fake timers; Silhouette renderiza `<svg>` com a cor).
- [ ] **Step 2:** `pnpm test:web src/lib/format.test.ts src/ui/ui.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar; mover rotas para `APP_ROUTES`; `ConfigPage` passa a usar `Tabs`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → verde e o aviso de chunk > 500 kB some (ou reduz e o PGlite fica em chunk próprio).
- [ ] **Step 5: Commit** `feat: infraestrutura de telas (rotas lazy, formatação, modal, tabs, silhueta)`

---

### Task 6: Tela de Acervo — lista

**Files:**
- Create: `src/features/acervo/queries.ts`, `src/features/acervo/AcervoListPage.tsx`, `src/features/acervo/GarmentCard.tsx`, `src/features/acervo/acervo.css`, `src/features/acervo/list.test.tsx`

**Interfaces:**
- `queries.ts`: `useGarmentSearch(filters)` (`rpc('search_garments')`, paginação 24 por página com "Carregar mais"), `useCategories()`, `useGarmentCosts(ids)` (só chamado se `can('acervo.cost')`).
- Lista conforme protótipo L4420–4487: título "Acervo"; subtítulo `{total} peças · {disponíveis} disponíveis` (+ `· {Σ custo} investidos` só com `acervo.cost`); alternar **Galeria/Lista** (lembrado em `localStorage` com try/catch); busca "Buscar por código, nome, cor ou tecido…"; chips de categoria, estado (Qualquer estado, Disponível, Reservado, Em uso, Em ciclo operacional, Bloqueado) e tamanho (Todos, P, M, G, GG); card de galeria (silhueta ou foto de capa, pill de estado curto, código mono, nome, `cor · tam.`, preço sem centavos); lista com colunas Código, Peça, Cor, Tam., Estado, Locação (+ Receita/Payback com `acervo.cost`); botão "Nova peça" com `acervo.create`; vazio "Nenhuma peça encontrada / Ajuste os filtros ou cadastre uma nova peça."; filtros refletidos na URL (`?q=&cat=&st=&tam=`).

- [ ] **Step 1: Write the failing tests** `list.test.tsx` (fake supabase): render com 3 peças → 3 cards com código e preço "R$ 890"; digitar "verde" chama `search_garments` com `p_q:'verde'` após debounce; chip "Em ciclo operacional" → `p_state_group:'ciclo'`; atendimento não vê "investidos" nem colunas de custo e `garment_costs` não é chamado; admin vê; "Nova peça" só com `acervo.create`; clicar no card navega para `/acervo/<id>`; vazio mostra a mensagem.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `pnpm test:web src/features/acervo` PASS + suíte completa verde.
- [ ] **Step 5: Commit** `feat: lista do acervo`

---

### Task 7: Tela de Acervo — ficha da peça e formulários

**Files:**
- Create: `src/features/acervo/GarmentPage.tsx`, `src/features/acervo/GarmentForm.tsx`, `src/features/acervo/FitModal.tsx`, `src/features/acervo/MeasurementsModal.tsx`, `src/features/acervo/BlockModal.tsx`, `src/features/acervo/PhotosPanel.tsx`, `src/features/acervo/CalendarPane.tsx`, `src/lib/photos.ts`, `src/features/acervo/garment.test.tsx`
- Modify: `src/features/acervo/queries.ts`, `src/features/acervo/AcervoListPage.tsx` (abre "Nova peça")

**Interfaces:**
- `photos.ts`: `uploadGarmentPhoto(garmentId, file, kind) → Promise<string /*storage_path*/>` (redimensiona para ≤ 1600px JPEG 0.85 no navegador, bucket `acervo`, caminho `<garment_id>/<uuid>.jpg`, depois `rpc('add_garment_photo')`); `photoUrl(path)` (`createSignedUrl` 1h, cache por TanStack Query).
- Ficha conforme protótipo L4513–4772, com estas abas nesta etapa: **Calendário** (2 meses + próximos 45 dias com rótulo "Próximos 45 dias", tabela "Compromissos futuros" com "Remover" para bloqueio manual com `acervo.block`), **Fotos** (grade, enviar, definir capa, remover — `acervo.edit`), **Histórico** (até 60 transições, autor via `useStaff`), **Financeiro** (só `acervo.cost`, via `garment_costs`), **Caimento e medidas** (cards "Caimento observado" e "Medidas da peça", botões "Atualizar" → `FitModal`/`MeasurementsModal`). Abas Reservas, Provas e Manutenções NÃO aparecem nesta etapa.
- Cabeçalho: nome; `code · categoria · marca`; ações Bloquear (`acervo.block`), Editar (`acervo.edit`); "Reservar" omitido até o Plano 4. Cartão lateral: foto de capa ou silhueta, pill de estado, preço, "Próximo compromisso" ou "Livre e sem compromissos futuros.", lista Tamanho/Cor/Tecido/Comprimento/Decote/Manga/Estilo/Ocasiões/Localização/Buffer, nota de caimento.
- `GarmentForm` (Nova peça / Editar): campos e rótulos do protótipo (tabela gf-* L4930–4963) com validação no cliente espelhando o banco; campos de custo só aparecem com `acervo.cost`; subtítulo "O código é gerado automaticamente na sequência do acervo"; após criar, navega para a ficha. `FitModal` = ft-* (L5083–5124). `MeasurementsModal` (novo): Busto, Cintura, Quadril, Ombro, Comprimento total, Sobra de barra, Elasticidade. `BlockModal`: De (hoje), Até (hoje+3), Motivo (placeholder "Ensaio fotográfico, empréstimo institucional, avaliação…"); `CONFLITO_AGENDA` mostra a mensagem + período do `hint`.
- Peça inexistente → "Peça não encontrada / Pode ter sido removida do acervo."

- [ ] **Step 1: Write the failing tests** `garment.test.tsx`: ficha mostra código/categoria/marca e as 5 abas para admin, 4 (sem Financeiro) para atendimento; criar peça envia `create_garment` com os campos e navega; validação "Informe o valor da locação." sem chamar RPC; editar caimento chama `update_garment_fit`; bloquear com conflito mostra "A peça já tem compromisso nesse período."; upload chama storage + `add_garment_photo` e a foto aparece; "Remover" bloqueio chama `release_block`; atendimento não vê campos de custo no formulário; id inexistente → "Peça não encontrada".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suíte verde; no demo, cadastrar uma peça com foto e bloquear.
- [ ] **Step 5: Commit** `feat: ficha da peça, cadastro, fotos, caimento, medidas e bloqueio`

---

### Task 8: Tela de Clientes — lista e cadastro com modelo ideal

**Files:**
- Create: `src/features/clientes/queries.ts`, `src/features/clientes/ClientesListPage.tsx`, `src/features/clientes/CustomerForm.tsx`, `src/features/clientes/IdealGarmentPicker.tsx`, `src/features/clientes/clientes.css`, `src/features/clientes/list.test.tsx`, `src/features/clientes/form.test.tsx`

**Interfaces:**
- Lista conforme protótipo L5137–5181: cabeçalho `{n} cadastradas`; busca "Nome, telefone, Instagram, CPF ou código…"; ordenação A–Z / Maior gasto / Mais locações / Mais recentes; colunas Cliente (avatar com iniciais, nome, pill VIP, código), Contato (telefone mascarado + Instagram), Cidade, Locações, Total gasto e Ticket (só com `financeiro.view`), Próximo evento; "Nova cliente" com `cliente.create`; paginação 30 "Carregar mais".
- `CustomerForm` (Nova cliente / Editar): seção **Dados** — Nome completo *, Telefone/WhatsApp * (máscara), Data de nascimento *, CPF * (máscara, valida dígitos no cliente), Instagram, E-mail, Cidade, UF, Origem do lead, Observações; seção **Modelo ideal** — `IdealGarmentPicker`: busca peça do acervo (reusa `search_garments`), mostra card da peça escolhida e botão "Usar medidas desta peça" que chama `ideal_measurements` e preenche os campos de medida (que continuam editáveis; texto de ajuda "As medidas vêm da peça escolhida e podem ser ajustadas."); seção **Perfil corporal** — Tamanho usual, Busto, Cintura, Quadril, Ombro, Altura, Calçado, Comprimento preferido; seção **Preferências** — Cores preferidas, Cores evitadas (chips separados por vírgula), Manga, Decote. Subtítulo do modal: "Nome, telefone, nascimento e CPF são obrigatórios." Erros do banco mapeados por campo (`CPF_DUPLICADO` → no campo CPF).

- [ ] **Step 1: Write the failing tests:** lista — busca chama `search_customers` com `p_q`; troca de ordenação → `p_sort:'gasto'`; atendimento sem `financeiro.view` (revogado) não vê colunas de dinheiro; clique navega para `/clientes/<id>`. Formulário — submit vazio mostra as 4 mensagens obrigatórias e não chama RPC; CPF "111.111.111-11" → "CPF inválido."; escolher modelo ideal e "Usar medidas desta peça" preenche Busto/Cintura/Quadril/Ombro/Tamanho com os valores do RPC; submit envia `create_customer` com `ideal_garment_id`, CPF só dígitos e `measurement`; `CPF_DUPLICADO` aparece sob o campo CPF.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suíte verde.
- [ ] **Step 5: Commit** `feat: lista de clientes e cadastro com modelo ideal`

---

### Task 9: Tela de Clientes — ficha, observações, medidas, favoritos e recomendações

**Files:**
- Create: `src/features/clientes/CustomerPage.tsx`, `src/features/clientes/NoteModal.tsx`, `src/features/clientes/MeasureModal.tsx`, `src/features/clientes/Recommendations.tsx`, `src/features/clientes/customer.test.tsx`
- Modify: `src/features/clientes/queries.ts`, `src/features/acervo/GarmentPage.tsx` (botão coração "Favoritar para uma cliente" fica para o Plano 3 — não fazer agora)

**Interfaces:**
- Ficha via `rpc('customer_profile')`, conforme protótipo L5184–5458, adaptada: cabeçalho nome + `code · cliente desde {data}[ · VIP]`; ações Observação (`cliente.note`), Editar (`cliente.edit`) — "Agendar prova" e "Nova reserva" omitidos até os Planos 3–4; cartão lateral (iniciais, nome, `cidade · UF · {idade} anos`, pills VIP/Recorrente/1ª locação/Sem locação, WhatsApp com link `https://wa.me/55<dígitos>`, Instagram, E-mail, Nascimento, CPF (mascarado conforme RPC), Origem, Tamanho, Modelo ideal com link para a peça); card **"Lembre-se ao atender"** (observações fixadas); card **"Perfil Senzi"** (3 colunas do protótipo; dinheiro só com `financeiro.view`; chips de favoritas); card **"Sugestões para ela"** (`Recommendations`: até 8 peças com silhueta/foto, código, nome, preço e os `reasons` como texto pequeno; vazio "Cadastre medidas ou preferências para receber sugestões."); abas **Memória de atendimento** (timeline, fixar/desafixar com `cliente.note`, autor via `useStaff`), **Medidas** (atual + histórico + "Atualizar" → `MeasureModal`, `cliente.edit`), **Favoritos** (cards, "Remover" com `cliente.edit`). Abas Histórico/Provas e "Preferências percebidas" entram nos Planos 3–4.
- Cliente inexistente → "Cliente não encontrada".

- [ ] **Step 1: Write the failing tests** `customer.test.tsx`: ficha mostra nome, código, idade e telefone mascarado; WhatsApp tem `href` `https://wa.me/5563996124478`; observação vazia mostra "Escreva a observação." sem RPC; registrar observação fixada chama `add_customer_note` com `p_pinned:true` e aparece em "Lembre-se ao atender"; atualizar medidas chama `add_customer_measurement` e o histórico mostra 2 linhas; recomendações listam as peças do RPC com o texto do motivo e linkam para `/acervo/<id>`; remover favorito chama `set_favorite` com `p_on:false`; sem `financeiro.view` não aparece "Total gasto".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` verde.
- [ ] **Step 5: Commit** `feat: ficha da cliente com memória de atendimento, medidas, favoritos e sugestões`

---

### Task 10: Verificação no navegador

- [ ] **Step 1:** `pnpm build && pnpm preview` (porta 4173). Com Chrome headless, capturar: login demo, `/acervo` (galeria e lista), `/acervo/<SZ-0107>` (cada aba), modal "Nova peça", `/clientes`, modal "Nova cliente" com modelo ideal preenchido, `/clientes/<CL-0001>` — como Administrador e como Atendimento. Salvar PNGs no scratchpad.
- [ ] **Step 2:** Conferir nas capturas: nenhuma tela branca/erro, textos pt-BR, sem custo para Atendimento, fundo #F8F5F0.
- [ ] **Step 3:** `grep -rn "Senzie" src supabase` vazio; `pnpm test && pnpm typecheck && pnpm lint && pnpm build` verde.
- [ ] **Step 4: Commit** (se houve ajuste) `chore: verificação da etapa 2`
