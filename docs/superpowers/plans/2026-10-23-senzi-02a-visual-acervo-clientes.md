# Senzi OS — Plano 2A: Visual do Acervo e de Clientes (sem banco)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O João navega no localhost, sem login e sem banco, pelas telas finais de Acervo (lista, ficha, cadastro, caimento, medidas, fotos, bloqueio) e Clientes (lista, cadastro com modelo ideal, ficha, observações, medidas, favoritos, sugestões), com dados fictícios do protótipo, para aprovar o visual antes de ligarmos o banco.

**Architecture:** As telas são os componentes definitivos e recebem dados por uma camada `data source` com interface fixa. Nesta etapa a única implementação é **em memória** (`mockSource`, fixture portada do seed do protótipo, mutações em estado local). No Plano 2B o banco entra como outra implementação da mesma interface, sem reescrever as telas. As telas ficam sob `/preview/...` (públicas, sem login, faixa "Prévia visual · dados fictícios"), usando o mesmo `Sidebar` do app.

**Tech Stack:** o do Plano 1 (React 19, TS, react-router 7, TanStack Query 5, Vitest). Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (3.4 Clientes, 4.2, 6). Referência visual/funcional: `SenzieOS_v0.2_3.html` — Acervo `UI.VIEWS.acervo` L4420–5124, Clientes `UI.VIEWS.clientes` L5137–5634, seed L2754–3620, silhueta `SZ.silhouette`/`SZ.shapeFor` L1033–1060, `E.buffer` L1241. Plano 2B (banco, adiado): `docs/superpowers/plans/2026-10-23-senzi-02-demo-acervo-clientes.md` — suas Tasks 6–9 descrevem as telas em detalhe e valem aqui como especificação de conteúdo.

## Global Constraints

- Marca **Senzi**; nunca "Senzie" em `src/` (a marca do ateliê no fixture é "Ateliê Senzi").
- pt-BR, BRL, `dd/mm/aaaa`, fuso `America/Araguaina`. Visual aprovado: fundo `var(--fundo)` (#F8F5F0), cards brancos com borda Areia, sidebar Cranberry com item ativo em pill Beige; nada de fundos saturados; contraste WCAG AA.
- Telas consomem dados **só** pela interface `DataSource` (`src/data/source.ts`); nenhum componente importa o fixture diretamente.
- Permissões simuladas: a prévia tem um seletor "Ver como: Administrador | Atendimento" no topo; as telas usam `usePermissions().can()` (via um provider de prévia) e escondem custo/ações exatamente como no app real (Atendimento não tem `acervo.create`, `acervo.block`, `acervo.cost`).
- Rotas da prévia: `/preview` (dashboard já existente), `/preview/acervo`, `/preview/acervo/:id`, `/preview/clientes`, `/preview/clientes/:id`. O `Sidebar` da prévia linka Dashboard/Acervo/Clientes para essas rotas; os demais itens mostram "Em construção" dentro da prévia.
- Nenhuma chamada de rede além das fontes do Google.

## Review Focus

1. Busca com e sem acento, por código, telefone com ou sem máscara e CPF encontra o registro. *(Tasks 2, 4)*
2. Cadastro de cliente: CPF inválido/repetido, telefone sem DDD, nascimento futuro → mensagem no campo, nada salvo. *(Task 4)*
3. "Ver como Atendimento" esconde custos e ações proibidas em todas as telas. *(Tasks 2–5)*
4. Recarregar a página numa ficha `/preview/acervo/:id` funciona (deep link) e id inexistente mostra "não encontrada". *(Tasks 3, 5)*
5. Layout em 820px (tablet) sem rolagem horizontal da página. *(Task 6)*

---

### Task 1: Base — fonte de dados em memória, fixture, componentes de UI e rotas da prévia

**Files:**
- Create: `src/data/types.ts`, `src/data/source.ts`, `src/data/mockSource.ts`, `src/data/fixture/garments.ts`, `src/data/fixture/customers.ts`, `src/data/mockSource.test.ts`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/lib/cpf.ts`, `src/lib/cpf.test.ts`, `src/ui/Silhouette.tsx`, `src/ui/Tabs.tsx`, `src/ui/Modal.tsx`, `src/ui/DataTable.tsx`, `src/ui/SearchInput.tsx`, `src/ui/Chips.tsx`, `src/ui/EmptyState.tsx`, `src/ui/ui.test.tsx`, `src/preview/PreviewLayout.tsx`, `src/preview/PreviewPermissions.tsx`, `src/preview/previewRoutes.tsx`
- Modify: `src/app/router.tsx`, `src/preview/PreviewPage.tsx`, `src/shell/Sidebar.tsx` (prop opcional para mapear links), `src/features/config/ConfigPage.tsx` (usar `Tabs`)

**Interfaces:**
- `types.ts`: `Garment` (campos do protótipo: id, code, name, categorySlug, categoryName, brandName, labelSize, sizeEquiv `'PP'|'P'|'M'|'G'|'GG'|'U'`, colorPrimary, colorHex, fabric, length `'curto'|'midi'|'longo'`, neckline, sleeve, style, occasions string[], fitNotes, state (11 estados do protótipo sem `pre_reservado`), rentalPrice, acquisitionCost, retailReference, cleaningDays|null, location, fitRuns, bustComfortCm, waistMaxCm, hipMaxCm, hemHeelCm, commonAlteration, measurement {bustCm, waistCm, hipCm, shoulderCm, totalLengthCm, hemAllowanceCm, stretch}, photos {id, kind, url, isCover}[], blocks {id, kind, from, to, note}[], history {at, from, to, reason, userName}[]); `Customer` (id, code, fullName, phone (dígitos), instagram, email, birthDate, cpf (dígitos), city, state, leadSource, vip, notes, idealGarmentId, createdAt, measurements {measuredAt, usualSize, bustCm, waistCm, hipCm, heightCm, shoulderCm, shoeSize, preferredLength, source `'manual'|'modelo_ideal'`, sourceGarmentId}[] (mais recente primeiro), preferences {preferredColors, avoidedColors, preferredLengths, sleeve, neckline}, notes list {id, content, channel, pinned, at, authorName}[], favorites {garmentId, source, note, at}[], stats {rentals, spent, nextEvent}); `GarmentFilters {q, cat, stateGroup, size}`; `CustomerSort = 'nome'|'gasto'|'locacoes'|'recentes'`; `Recommendation {garment: Garment, score: number, reasons: string[]}`; `SourceError` com `code` igual aos códigos de erro do Plano 2B (`NOME_OBRIGATORIO`, `VALOR_LOCACAO_OBRIGATORIO`, `PERIODO_INVALIDO`, `CONFLITO_AGENDA`, `NOME_CLIENTE_OBRIGATORIO`, `TELEFONE_INVALIDO`, `NASCIMENTO_INVALIDO`, `CPF_INVALIDO`, `CPF_DUPLICADO`, `EMAIL_INVALIDO`, `OBSERVACAO_OBRIGATORIA`) e `field?`.
- `source.ts`: `interface DataSource { listCategories(); searchGarments(f, page): {items, total}; getGarment(id); createGarment(input); updateGarment(id, input); updateFit(id, input); updateMeasurement(id, input); addPhoto(id, file, kind); removePhoto(id, photoId); setCover(id, photoId); blockGarment(id, from, to, note); releaseBlock(id, blockId); searchCustomers(q, sort, page): {items, total}; getCustomer(id); createCustomer(input); updateCustomer(id, input); idealMeasurements(garmentId); addMeasurement(id, input); addNote(id, content, channel, pinned); setNotePinned(id, noteId, pinned); setFavorite(id, garmentId, on); recommend(id, limit=8): Recommendation[] }` — todos assíncronos; `DataSourceProvider` + `useDataSource()`.
- `mockSource`: estado em memória iniciado do fixture (cópia profunda), latência simulada 150 ms, mesmas validações e códigos de erro do Plano 2B (Task 2 e 3 de lá); `addPhoto` usa `URL.createObjectURL`; códigos novos `SZ-NNNN`/`CL-NNNN` = maior + 1; recomendação com o algoritmo do Plano 2B Task 3 (copiar a tabela de pesos). Hooks TanStack Query em `src/data/hooks.ts` (`useGarmentSearch`, `useGarment`, `useCustomers`, `useCustomer`, `useRecommendations`, mutações que invalidam as queries certas).
- Fixture: 8 categorias, 10 marcas (com "Ateliê Senzi"), as 28 peças `SZ-0107…SZ-0296` com medidas/caimento/blocos de exemplo (protótipo L2765–2868, L3311–3324), ≥ 30 clientes (L2904–2963) com CPF válido, telefone, aniversário, medidas, preferências, observações (L2997–3002) e favoritos; algumas peças em estados variados (reservado, higienização, bloqueado) para a tela mostrar os tons.
- `format.ts`: `brl(n, {cents})`, `dateBR`, `dateTimeBR` (America/Araguaina), `ageFrom`, `maskCPF`, `maskPhone`, `onlyDigits`, `normalize`. `cpf.ts`: `isValidCPF(s)`.
- UI: `Silhouette {categorySlug, style?, length, colorHex, size?}` (porta do protótipo); `Tabs` acessíveis (extraídos do ConfigPage); `Modal` (foco inicial, focus trap, Escape, `aria-modal`); `DataTable`; `SearchInput` (debounce 260 ms); `Chips` (`aria-pressed`); `EmptyState`.
- `PreviewLayout`: Sidebar + faixa "Prévia visual · dados fictícios" + seletor "Ver como"; `PreviewPermissions` fornece `can()` (admin = todas; atendimento = conjunto de `src/auth/permissions.ts`/role atendimento do Plano 1).

- [ ] **Step 1: Write the failing tests:** `format.test.ts` (`brl(890)` "R$ 890,00"; `brl(890,{cents:false})` "R$ 890"; `maskCPF('52998224725')` "529.982.247-25"; `maskPhone('63996124478')` "(63) 99612-4478"; `normalize('Verônica')` "veronica"); `cpf.test.ts` (`529.982.247-25` válido; `111.111.111-11` e `529.982.247-24` inválidos); `mockSource.test.ts` (busca "verde" acha "Verde esmeralda"; "VERÔNA" acha Verona; `stateGroup:'ciclo'` só ciclo; `createGarment` gera `SZ-0297`; preço 0 → `VALOR_LOCACAO_OBRIGATORIO`; `blockGarment` sobreposto → `CONFLITO_AGENDA`; `createCustomer` com CPF repetido → `CPF_DUPLICADO` com `field:'cpf'`; busca de cliente por "63 99612-4478" e por CPF; `recommend` de cliente M que evita amarelo não traz peça amarela e tem razão "No tamanho dela (M)"; fixture inteiro sem "Senzie" e todos os CPFs válidos); `ui.test.tsx` (Modal: foco inicial, Tab preso, Escape; Tabs com setas; SearchInput debounce; Silhouette renderiza svg com a cor).
- [ ] **Step 2:** `pnpm test:web` → FAIL.
- [ ] **Step 3:** Implementar; registrar rotas `/preview/*` com `PreviewLayout`; o dashboard `/preview` passa a usar o layout; Sidebar da prévia linka Acervo/Clientes.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` verde.
- [ ] **Step 5: Commit** `feat: base da prévia navegável — fonte de dados em memória, fixture e componentes`

---

### Task 2: Acervo — lista

**Files:** Create `src/features/acervo/AcervoListPage.tsx`, `src/features/acervo/GarmentCard.tsx`, `src/features/acervo/acervo.css`, `src/features/acervo/list.test.tsx`; Modify `src/preview/previewRoutes.tsx`.

**Interfaces:** Conteúdo = Plano 2B Task 6 (cabeçalho com totais e "investidos" só com `acervo.cost`; Galeria/Lista lembrado em `localStorage` com try/catch; busca "Buscar por código, nome, cor ou tecido…"; chips de categoria/estado/tamanho; card com foto de capa ou silhueta, pill de estado curto, código mono, nome, `cor · tam.`, preço sem centavos; lista com Código, Peça, Cor, Tam., Estado, Locação + Receita/Payback com `acervo.cost`; "Nova peça" com `acervo.create`; vazio "Nenhuma peça encontrada / Ajuste os filtros ou cadastre uma nova peça."; filtros na URL `?q=&cat=&st=&tam=`; paginação 24 com "Carregar mais"). Links para `/preview/acervo/:id`.

- [ ] **Step 1: Write the failing tests** `list.test.tsx` (com `DataSourceProvider` do mock): 24 cards na primeira página e "Carregar mais"; busca "verde" filtra após debounce; chip "Em ciclo operacional" filtra; "Ver como Atendimento" esconde "investidos", colunas de custo e "Nova peça"; clique no card navega; filtro na URL sobrevive a remount.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suíte verde.
- [ ] **Step 5: Commit** `feat: lista do acervo (prévia)`

---

### Task 3: Acervo — ficha da peça e formulários

**Files:** Create `src/features/acervo/GarmentPage.tsx`, `GarmentForm.tsx`, `FitModal.tsx`, `MeasurementsModal.tsx`, `BlockModal.tsx`, `PhotosPanel.tsx`, `CalendarPane.tsx`, `garment.test.tsx` (todos em `src/features/acervo/`); Modify `AcervoListPage.tsx` (abre "Nova peça"), `src/preview/previewRoutes.tsx`.

**Interfaces:** Conteúdo = Plano 2B Task 7: abas **Calendário** (2 meses + "Próximos 45 dias", "Compromissos futuros" com "Remover" para bloqueio manual com `acervo.block`), **Fotos** (grade, enviar, capa, remover — `acervo.edit`), **Histórico**, **Financeiro** (só `acervo.cost`; receita 0 e nota "Receita e despesas aparecem quando reservas e manutenções estiverem ativas."), **Caimento e medidas**; cabeçalho `code · categoria · marca`, ações Bloquear (`acervo.block`) e Editar (`acervo.edit`); cartão lateral (capa ou silhueta, pill, preço, próximo compromisso ou "Livre e sem compromissos futuros.", Tamanho/Cor/Tecido/Comprimento/Decote/Manga/Estilo/Ocasiões/Localização/Buffer, nota de caimento); `GarmentForm` com campos gf-* do protótipo (custos só com `acervo.cost`), `FitModal` (ft-*), `MeasurementsModal`, `BlockModal` (De hoje, Até hoje+3, Motivo); erros do source exibidos no campo ou no topo do modal; inexistente → "Peça não encontrada / Pode ter sido removida do acervo."

- [ ] **Step 1: Write the failing tests** `garment.test.tsx`: admin vê 5 abas, atendimento 4; criar peça sem preço mostra "Informe o valor da locação."; criar válida navega para a nova ficha `SZ-0297`; editar caimento atualiza o card; bloquear sobreposto mostra "A peça já tem compromisso nesse período."; enviar foto mostra miniatura; remover bloqueio some da tabela; id inexistente → "Peça não encontrada".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suíte verde.
- [ ] **Step 5: Commit** `feat: ficha da peça e formulários (prévia)`

---

### Task 4: Clientes — lista e cadastro com modelo ideal

**Files:** Create `src/features/clientes/ClientesListPage.tsx`, `CustomerForm.tsx`, `IdealGarmentPicker.tsx`, `clientes.css`, `list.test.tsx`, `form.test.tsx` (em `src/features/clientes/`); Modify `src/preview/previewRoutes.tsx`.

**Interfaces:** Conteúdo = Plano 2B Task 8 (lista: `{n} cadastradas`; busca "Nome, telefone, Instagram, CPF ou código…"; ordenação A–Z/Maior gasto/Mais locações/Mais recentes; colunas Cliente, Contato, Cidade, Locações, Total gasto e Ticket só com `financeiro.view`, Próximo evento; "Nova cliente" com `cliente.create`; 30 por página. Formulário em seções Dados (Nome*, Telefone/WhatsApp* com máscara, Nascimento*, CPF* com máscara, Instagram, E-mail, Cidade, UF, Origem, Observações) · **Modelo ideal** (escolher peça do acervo com busca; card da peça; "Usar medidas desta peça" preenche medidas, que continuam editáveis; ajuda "As medidas vêm da peça escolhida e podem ser ajustadas.") · Perfil corporal (Tamanho usual, Busto, Cintura, Quadril, Ombro, Altura, Calçado, Comprimento preferido) · Preferências (cores preferidas/evitadas como chips, Manga, Decote); subtítulo "Nome, telefone, nascimento e CPF são obrigatórios."; erros por campo).

- [ ] **Step 1: Write the failing tests:** lista — busca e ordenação refletem nos resultados; com `financeiro.view` revogado no provider de permissões, as colunas de dinheiro somem; clique navega. Formulário — submit vazio mostra as 4 mensagens; CPF "111.111.111-11" → "CPF inválido."; modelo ideal preenche Busto/Cintura/Quadril/Ombro/Tamanho; salvar cria `CL-00NN` e navega para a ficha; CPF de cliente existente → "Já existe uma cliente com este CPF." sob o campo.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suíte verde.
- [ ] **Step 5: Commit** `feat: lista de clientes e cadastro com modelo ideal (prévia)`

---

### Task 5: Clientes — ficha, observações, medidas, favoritos e sugestões

**Files:** Create `src/features/clientes/CustomerPage.tsx`, `NoteModal.tsx`, `MeasureModal.tsx`, `Recommendations.tsx`, `customer.test.tsx`; Modify `src/preview/previewRoutes.tsx`.

**Interfaces:** Conteúdo = Plano 2B Task 9 (cabeçalho nome + `code · cliente desde {data}[ · VIP]`; ações Observação e Editar; cartão lateral com iniciais, `cidade · UF · {idade} anos`, pills, WhatsApp com link `https://wa.me/55<dígitos>`, Instagram, E-mail, Nascimento, CPF mascarado `***.456.789-**` para quem não tem `cliente.edit`, Origem, Tamanho, Modelo ideal com link; "Lembre-se ao atender"; "Perfil Senzi" (3 colunas; dinheiro só com `financeiro.view`; chips de favoritas); **"Sugestões para ela"** (até 8 peças com foto/silhueta, código, nome, preço e motivos; vazio "Cadastre medidas ou preferências para receber sugestões."); abas Memória de atendimento, Medidas (atual + histórico + Atualizar), Favoritos (Remover com `cliente.edit`); inexistente → "Cliente não encontrada").

- [ ] **Step 1: Write the failing tests** `customer.test.tsx`: mostra nome, código, idade, telefone mascarado e link `https://wa.me/5563996124478`; observação vazia → "Escreva a observação."; observação fixada aparece em "Lembre-se ao atender"; atualizar medidas adiciona linha ao histórico; sugestões mostram motivos e linkam para `/preview/acervo/:id`; remover favorito some da aba; id inexistente → "Cliente não encontrada".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` verde.
- [ ] **Step 5: Commit** `feat: ficha da cliente com memória, medidas, favoritos e sugestões (prévia)`

---

### Task 6: Conferência visual

- [ ] **Step 1:** `pnpm build`, servir com `vite preview` e capturar com Chrome headless (1440px e 820px), como Administrador e Atendimento: `/preview/acervo` (galeria e lista), `/preview/acervo/<id de SZ-0107>` (cada aba), modal Nova peça, `/preview/clientes`, modal Nova cliente com modelo ideal preenchido, `/preview/clientes/<id de CL-0001>`. PNGs no scratchpad.
- [ ] **Step 2:** Conferir: sem tela branca/erro, pt-BR, sem custo para Atendimento, sem rolagem horizontal em 820px, fundo #F8F5F0.
- [ ] **Step 3:** `grep -rn "Senzie" src` vazio; suíte verde. **Step 4: Commit** se houver ajuste.
