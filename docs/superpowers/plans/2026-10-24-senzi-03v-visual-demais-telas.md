# Senzi OS — Plano 3V: visual das demais telas (Agenda, Provas, Reservas, Operação, Financeiro, Dashboard, Inteligência)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir na prévia visual (`/preview/*`, dados fictícios em memória) todas as telas que faltam, com um "mundo" de dados coerente entre elas (uma reserva confirmada aparece na agenda, bloqueia a peça, gera conta a receber, alimenta o dashboard e a inteligência).

**Architecture:** Mesmo padrão do Plano 2A. As telas só falam com a interface `DataSource` (agora composta por áreas); a implementação em memória (`createMockSource`) guarda um `World` gerado de forma determinística a partir de "hoje" e aplica as regras do negócio por funções puras em `src/domain/` (as mesmas regras que o banco terá no Plano 2B). Nenhum banco, nenhuma dependência nova.

**Tech Stack:** React 19, TypeScript strict, react-router v7, TanStack Query v5, Vitest + Testing Library (projeto `web`). Componentes de `src/ui`, tokens de `src/styles/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (autoridade) + especificações de conteúdo por tela, que são **requisito** (textos, colunas, regras, mensagens verbatim):
- `docs/superpowers/specs/telas/agenda-provas.md`
- `docs/superpowers/specs/telas/reservas.md`
- `docs/superpowers/specs/telas/operacao-financeiro.md`
- `docs/superpowers/specs/telas/dashboard-inteligencia.md`

Onde a spec de tela marca **[DECIDIR]**, **(proposta)** ou **[atenção]**, vale a decisão da seção "Decisões" abaixo; se não houver decisão listada, vale a proposta da própria spec.

## Global Constraints

- Interface toda em pt-BR; textos de UI verbatim das specs de tela. Empresa: **Senzi** (nunca "Senzie").
- Semana começa na **segunda**, domingo é o último dia, em todo lugar (calendários, kanban, mini calendário).
- Datas puras como string `aaaa-mm-dd` (use `todayISO`, `addDays`, `dateBR` de `src/lib/format.ts`); nunca `toISOString()` para data pura. "Hoje" vem da fonte (`createMockSource({ today })`), não de `new Date()` dentro das regras.
- Valores em BRL com `brl()` de `src/lib/format.ts`; arredondamento a centavos (`round2`).
- Pré-reserva não existe (nem estado, nem bloco, nem alerta, nem filtro).
- Perfis: Administrador (todas as permissões) e Atendimento (`ATENDIMENTO_PERMS` em `src/preview/previewRole.ts`). Toda ação/valor restrito é escondido com `usePermissions().can(...)`.
- Sem dependências novas de runtime. Gráficos em SVG/CSS próprio (como `src/preview/PreviewPage.tsx`). PDFs = páginas de impressão em HTML + "Imprimir / salvar PDF" do navegador.
- Visual: modo único claro, cards brancos com borda Areia, fundo `--fundo`, cores só por tokens (exceto cores reais de peça/categoria vindas dos dados). Tons de status sempre com rótulo de texto (`Badge`).
- Componentes existentes primeiro: `Button`, `buttonClass`, `Card`, `Badge`, `Field`, `Icon`, `Tabs`, `Modal`, `DataTable`, `SearchInput`, `Chips`, `EmptyState`, `Silhouette`. Formulários seguem o padrão de `GarmentForm`/`CustomerForm` (erro por campo vindo de `SourceError.field`).
- Telas montadas só nas rotas da prévia (`src/preview/previewRoutes.tsx`); links internos via `useAppHref()`.
- Arquivos focados (uma responsabilidade; evitar arquivos > ~450 linhas). Comentários no estilo do código existente (JSDoc curto em pt-BR).
- Verificação de cada tarefa: `pnpm exec tsc -b`, `pnpm exec eslint src` sem erros/avisos novos, `pnpm exec vitest run --project web` verde.

## Decisões (resolvem os [DECIDIR]/(proposta) das specs de tela)

1. **Agenda:** um único kanban por dia (sem seletor Dia/Semana/Mês). Janela carregada: hoje −14 a hoje +45 dias; abre com hoje na 2ª coluna visível; setas movem 1 coluna; "Hoje" recentra. Parâmetro `?dia=aaaa-mm-dd` abre centrado nesse dia. Cartão de prova vai a `/provas/:id` (prova > reserva > cliente).
2. **Interno:** `kind = 'interno'`, tom `stone` com borda tracejada e ícone; com Interno a Cliente é opcional e a Observação é obrigatória (vira título). Compromissos manuais (`atendimento`, `servico`, `interno`) podem ser editados e cancelados; automáticos não.
3. **Novo compromisso** permite escolher o tipo entre `Atendimento` (com cliente), `Serviço` e `Interno`; o flag "Interno" é o atalho visual exigido pela spec (marcar = tipo Interno).
4. **Provas:** prova vira `convertida` quando o **rascunho** de reserva é criado a partir dela. Clicar num chip de resultado preserva a nota. `concluida` não pode ser reaberta. Nav ganha o item **Provas** (`prova.view`) logo abaixo de Agenda. `fit_preference` não existe: a nota "Prefere…" usa `preferences.preferredLengths`/`sleeve`.
5. **Reservas:** incluídos "Editar rascunho", "Adicionar/Remover peça" (só rascunho), "Marcar como pronta para retirada" (`confirmada → pronta_retirada`, `reserva.pickup`) e "Marcar no-show" (`confirmada|pronta_retirada` com retirada no passado, `reserva.cancel`). Cancelar exige motivo. Compromissos de agenda da reserva (retirada 10:00, devolução 11:00, evento 19:00) são criados **na confirmação**. Rascunho com conflito: aviso, não bloqueio. Chip "Com saldo" só com `financeiro.view`; "Futuras" inclui rascunhos. Campos `Local do evento` e `Canal` entram no formulário. Datas: offsets do protótipo (retirar 0–5 dias antes, devolver 1–4 depois).
6. **Caução sugerida:** se `deposit_percent > 0`, `Σ retailReference × pct/100`; senão regra do protótipo (`round(retailReference × 0,1 / 10) × 10` da 1ª peça, 0 para `bolsa-acessorio`, fallback 10% do devido). Estorno de caução tem `refersTo: 'caucao'` e não mexe no saldo; estorno de receita subtrai do pago e do Recebido.
7. **Exceções por PIN na prévia:** o `AuthorizeExceptionDialog` passa a obter `listActiveAdmins`/`authorizeException` de um contexto `ExceptionAuthorizer` (padrão = Supabase, como hoje); a prévia fornece a versão em memória: administradora **Júlia Senzi** (`julia@senzi.com.br`), PIN **1234**, mesmas regras de bloqueio (5 erros em 15 min). A prévia mostra "PIN de demonstração: 1234" no diálogo.
8. **Documentos:** contrato e OS são rotas de impressão `/reservas/:id/contrato` e `/reservas/:id/os` (dentro da prévia, com CSS de impressão que esconde a moldura) e botão "Imprimir / salvar PDF" (`window.print()`). Link assinado/Storage fica para o Plano 2B (pendência). WhatsApp: `https://wa.me/55{dígitos}?text=…` com as mensagens da spec, sem `{link}` (frase "O PDF segue em anexo." no lugar).
9. **Operação:** fila de inspeção mostra "aguarda há N dia(s)"; "Liberar" (sem ordem) exige `operacao.release`; liberar peça `bloqueado` também libera blocos `bloqueio_manual`/`editorial` que cobrem hoje; fornecedor editado ao concluir é gravado.
10. **Financeiro:** submenu = subitens na sidebar sob "Financeiro" (visíveis quando a rota está em `/financeiro*`, filtrados por permissão) **e** abas no topo das quatro páginas (`FinanceNav`). Contas a pagar: baixa só integral (valor editável para juros/desconto, guardado em `paidAmount`). Despesas automáticas (`source: 'operacao' | 'aquisicao'`) são somente leitura. Estorno de receita subtrai do Recebido. Tiles Pago/Resultado/Custo/Margem/Investido exigem `financeiro.consolidated`.
11. **Dashboard:** ordem Alertas → 5 tiles → Agenda de hoje + mini calendário → Faturamento | Ciclo operacional. Alertas mostram até 6 boxes + "Ver todos (N)"; cada box tem rótulo de severidade (Crítico/Atenção/Info). Faturamento exige `financeiro.consolidated`; sem ela aparece "Provas de hoje e amanhã". Tiles clicáveis (destinos da spec). Alertas cujo destino o usuário não pode abrir são omitidos. Aniversário trata virada de ano e 29/02→28/02.
12. **Inteligência:** 5 seções por pergunta de negócio (abas-âncora) + bloco "Leitura do período" com os insights no topo; período 90 dias / 6 meses / 12 meses + filtro de categoria. Peças paradas usam o parâmetro `idle_alert_days` (90) e ignoram peças cadastradas há menos de 30 dias. Ocupação só conta locações realizadas (não canceladas), limitada a 100%. Insight #3 dispara com > 14% e o texto cita as faixas "atenção > 14%" e "falta acervo > 25%". Nada do inventário da spec pode faltar.
13. **Configurações** não entra nesta etapa (a tela real já existe e depende do banco); na prévia continua "em breve".

## Review Focus

1. **Datas na borda do dia/semana** — "hoje" é domingo ou segunda, fim de mês, virada de ano: a semana deve continuar segunda→domingo e nenhuma data pode "andar um dia". Testes: Task 1 (`weekStart`, aniversário 31/12→01/01) e Task 4 (kanban com hoje = domingo).
2. **Centavos que somem** — desconto rateado entre peças (Σ líquido = total líquido), saldo com estorno e caução, multa por atraso. Testes: Task 1 (`prorate` com 3 peças e R$ 100,00 de desconto; `balance` com estorno de caução).
3. **Confirmar pela metade** — conflito de agenda em uma das peças na confirmação: nada pode mudar (sem bloco, sem pagamento, sem estado). Teste: Task 6.
4. **Vazamento por perfil** — Atendimento nunca vê custo, resultado, contas a pagar, categorias, inteligência nem margens, inclusive em subtítulos, tiles e alertas. Testes: Tasks 8, 11, 12 (render "Ver como Atendimento" e garantir ausência dos textos).
5. **Coerência entre telas** — depois de confirmar/retirar/devolver/inspecionar, as outras telas refletem a mudança sem recarregar (invalidação de cache). Teste: Task 9 (devolver na reserva → peça aparece em "Aguardando inspeção" na Operação → inspecionar → reserva finalizada).

---

## Task 1: Tipos, rótulos e regras de domínio puras

**Files:**
- Create: `src/data/types-agenda.ts`, `src/data/types-reservas.ts`, `src/data/types-operacao.ts`, `src/data/types-financeiro.ts`, `src/data/types-painel.ts`
- Modify: `src/data/types.ts` (re-exporta os novos com `export *`; `GarmentBlock` ganha `reservationId?: string | null; maintenanceId?: string | null`; `SourceErrorCode` ganha os códigos novos), `src/data/labels.ts` (ou `src/data/labels-ops.ts` re-exportado), `src/lib/errorMessages.ts`
- Create: `src/domain/dates.ts`, `src/domain/money.ts`, `src/domain/calendar.ts`, `src/domain/fittings.ts`, `src/domain/settings.ts`
- Test: `src/domain/domain.test.ts`

**Interfaces:**
- Produces (tipos): exatamente os esboços TS das specs de tela, com estes nomes: `AppointmentKind`, `AppointmentState`, `Appointment`, `AgendaItem`, `AgendaGarmentBlock`, `AgendaDay = { date: string; items: AgendaItem[]; garmentBlocks: AgendaGarmentBlock[]; moreBlocks: number }`, `AppointmentInput = { date; time; kind: 'atendimento'|'servico'|'interno'; customerId: string|null; notes: string|null }`, `FittingState`, `FitOutcome`, `FittingSession`, `FittingItem`, `FittingListRow`, `FittingKpis`, `FittingFilter`, `FittingGarmentStats`, `FittingDetail = { session: FittingSession; customer: Customer; attendantName: string|null; items: (FittingItem & { garment: Garment; favorite: boolean })[]; reservation: { id: string; code: string; customerName: string; eventDate: string|null } | null }`, `FittingInput = { customerId?: string; newCustomer?: CustomerInput; date: string; time?: string; attendantName?: string|null; eventType?: string|null; eventDate?: string|null; budget?: number|null; notes?: string|null }`; `ReservationState`, `ItemState`, `PaymentKind`, `PaymentMethod`, `PaymentState`, `PayStatus`, `ExceptionKind` (mover o tipo de `AuthorizeExceptionDialog` para cá e reimportar lá), `Channel`, `Reservation`, `ReservationItem`, `Payment` (com `refersTo?: 'caucao'|null`), `Contract`, `ExceptionAuthorization`, `ReservationHistoryEntry`, `ReservationInput`, `PickupDecision`, `ReturnDecision`, `ReservationBalance = { devido; pago; caucao; due; status: PayStatus }`, `ReservationFilter = 'ativas'|'hoje'|'rascunhos'|'com_saldo'|'rua'|'inspecao'|'futuras'|'encerradas'|'todas'`, `AvailabilityConflict = { kind: BlockKind; label: string; from: string; to: string; reservationCode: string|null; draft: boolean }`, `AvailabilityResult = { garmentId: string; ok: boolean; conflicts: AvailabilityConflict[]; reason: string|null; window: { from: string; to: string; cleaningDays: number } }`; `MaintenanceKind`, `MaintenanceState`, `Maintenance`, `InspectionResult`, `Severity`, `InspectionFinding`, `Inspection`, `ChecklistItem`, `InspectionInput` (fotos = `{ kind: 'devolucao'|'dano'|'detalhe' }[]`), `CloseMaintenanceInput`, `QueueRow`, `OperacaoQueue`; `FinCategoryType`, `FinCategory`, `Recurrence`, `PayableStatus`, `Payable`, `ReceivableStatus`, `Receivable`, `FinanceRange`, `FinanceOverview`; `AlertSeverity = 'critico'|'atencao'|'info'`, `AlertKind`, `Alert`, `DashboardSummary`, `IntelPeriod`, `IntelReport`, `IntelGroup`, `PressureRow`; `Settings = { defaultCleaningDays: number; defaultPrepDays: number; lateFeeDailyPercent: number; depositPercent: number; discountLimitPercent: number; minSignalPercent: number; idleAlertDays: number }`; `AppUser = { id: string; name: string; email: string; role: 'admin'|'atendimento' }`.
- Produces (rótulos, `labels`): `AG_KIND`, `APPOINTMENT_STATE`, `FITTING_STATE`, `FIT_OUTCOME` (com `positive: boolean|null` e ícone), `RESERVATION_STATE`, `ITEM_STATE`, `PAYMENT_KIND`, `PAYMENT_METHOD`, `PAYMENT_STATE`, `PAYSTATUS`, `EXCEPTION_KIND`, `CHANNEL`, `MAINTENANCE_KIND`, `MAINTENANCE_STATE`, `INSPECTION_RESULT`, `SEVERITY`, `RECURRENCE`, `PAYABLE_STATUS`, `RECEIVABLE_STATUS`, `ALERT_SEVERITY` (Crítico/red, Atenção/amber, Info/stone) — valores das specs de tela. Conjuntos: `ACTIVE_RESERVATION_STATES`, `REALIZED_RESERVATION_STATES`, `CLOSED_RESERVATION_STATES`.
- Produces (regras, todas puras, `today` sempre parâmetro):
  - `dates.ts`: `weekdayIndex(iso): 0..6` (0 = segunda), `weekStart(iso)`, `diffDays(a, b)` (b − a), `dayRange(from, to): string[]`, `relativeDay(iso, today): 'hoje'|'amanhã'|'ontem'|'em N dias'|'há N dias'`, `nextBirthday(birthISO, today): { date: string; inDays: number }` (virada de ano; 29/02 → 28/02 em ano não bissexto), `longDate(iso)` ("sexta-feira, 23 de outubro"), `monthLabel(iso)`.
  - `money.ts`: `round2`, `prorate(items: { gross: number; itemDiscount?: number }[], orderDiscount: number): { alloc: number; net: number }[]` (algoritmo da spec reservas §4.2), `balance(totalNet, lateFee, payments: Payment[]): ReservationBalance` (§4.3 com a Decisão 6), `lateFee(totalNet, pct, daysLate)`, `minSignal(totalNet, pct)`, `depositSuggestion(garments: Garment[], devido, depositPercent)`, `discountNeedsException(gross, discount, limitPct)` (estritamente maior).
  - `calendar.ts`: `effectiveCleaningDays(garment, categories, settings)`, `occupiedWindow(pickup, returnDue, prepDays, cleaningDays)`, `checkAvailability({ garment, blocks, pickup, returnDue, ignoreReservationId, drafts, settings, categories }): AvailabilityResult` (§4.5; rascunhos da mesma peça viram conflito `draft: true`), `makeBlocks(...)` (§4.5 "Blocos ao confirmar"), `realignOnReturn(...)` (buffer comprimível), `deriveGarmentState(...)` ("o fato vence o plano", sem `pre_reservado`), `alternatives(target, candidates, availabilityOf)` (pontuação +4/+3/+2/+2/+1, até 4).
  - `fittings.ts`: `fittingStats(garmentId, sessions, items, reservationItems): FittingGarmentStats`, `conversionRate(sessions): { closed: number; converted: number; rate: number|null }` (`concluida` não conta).
  - `settings.ts`: `DEFAULT_SETTINGS: Settings` = `{ defaultCleaningDays: 2, defaultPrepDays: 0, lateFeeDailyPercent: 20, depositPercent: 0, discountLimitPercent: 15, minSignalPercent: 50, idleAlertDays: 90 }`.
- Novos `SourceErrorCode` (com mensagem em `errorMessages.ts`): `DATA_OBRIGATORIA` "Informe a data.", `HORARIO_OBRIGATORIO` "Informe o horário.", `CLIENTE_OBRIGATORIA` "Selecione a cliente.", `DATAS_INCOERENTES` "O evento não pode ser antes da prova.", `PROVA_ENCERRADA` "Esta prova já foi encerrada.", `RESERVA_SEM_CLIENTE` "Selecione a cliente — toda reserva pertence a alguém.", `RESERVA_SEM_PECAS` "Selecione ao menos uma peça.", `DATA_EVENTO_OBRIGATORIA` "Informe a data do evento.", `DEVOLUCAO_ANTES_RETIRADA` "A devolução não pode ser anterior à retirada.", `EVENTO_ANTES_RETIRADA` "O evento não pode acontecer antes da retirada.", `EVENTO_DEPOIS_DEVOLUCAO` "O evento não pode acontecer depois da devolução prevista.", `RETIRADA_NO_PASSADO` "A retirada está no passado. Revise as datas.", `DESCONTO_NEGATIVO` "O desconto não pode ser negativo.", `DESCONTO_MAIOR_QUE_BRUTO` "O desconto é maior que o valor das peças.", `DESCONTO_ACIMA_LIMITE` "Desconto acima do limite da casa — precisa de autorização.", `CONTRATO_NAO_ASSINADO` "Marque o contrato como assinado antes de confirmar.", `SINAL_INSUFICIENTE` "Sinal abaixo do mínimo. Só o Administrador pode dispensar.", `VALOR_INVALIDO` "O valor do pagamento deve ser maior que zero.", `VALOR_EXCEDE_SALDO` "O valor excede o saldo em aberto.", `SALDO_EM_ABERTO` "Retirada com saldo pendente exige autorização.", `ESTADO_INVALIDO` "Esta ação não está disponível no estado atual.", `DESCRICAO_OBRIGATORIA` "Informe a descrição.", `CATEGORIA_OBRIGATORIA` "Escolha a categoria.", `VENCIMENTO_OBRIGATORIO` "Informe o vencimento.", `DATA_FUTURA` "A data não pode ser futura.", `CATEGORIA_DUPLICADA` "Já existe uma categoria com esse nome.", `CATEGORIA_EM_USO` "Há lançamentos nesta categoria — arquive em vez de excluir.", `CATEGORIA_SISTEMA` "Categorias do sistema não podem ser alteradas.", `RECORRENCIA_FIM_INVALIDO` "A data final deve ser posterior ao vencimento.", `MOTIVO_OBRIGATORIO` (já existe a mensagem). Quando a mensagem precisa de valor (ex.: "O valor excede o saldo em aberto (R$ 780,00)."), a fonte manda o valor em `hint` e a tela compõe o texto.

- [ ] **Step 1: Escrever `src/domain/domain.test.ts`** com, no mínimo:
  - `weekStart('2026-10-25')` (domingo) = `'2026-10-19'`; `weekdayIndex('2026-10-19')` = 0; `weekdayIndex('2026-10-25')` = 6.
  - `nextBirthday('1990-01-02', '2026-12-31')` → `{ date: '2027-01-02', inDays: 2 }`; `nextBirthday('2000-02-29', '2027-02-27')` → `{ date: '2027-02-28', inDays: 1 }`.
  - `prorate([{gross: 300}, {gross: 300}, {gross: 400}], 100)`: allocs `[30, 30, 40]`; `prorate([{gross: 100}, {gross: 100}, {gross: 100}], 100)`: Σ net = 200,00 exato e o resto de centavos no item de maior base (empate → o primeiro).
  - `balance(1000, 0, [sinal 500 pago, caucao 200 pago, estorno 200 pago refersTo 'caucao'])` → `{ pago: 500, caucao: 0, due: 500, status: 'parcial' }`; com estorno 100 de receita → `pago: 400`.
  - `lateFee(1250, 20, 2)` = 500; `minSignal(1180, 50)` = 590; `discountNeedsException(1000, 150, 15)` = false e `(1000, 150.01, 15)` = true.
  - `checkAvailability`: bloco `locacao` 10–15 e pedido 14–20 → conflito; bloco de reserva `finalizada` (histórico) não conflita; pedido que encosta no buffer de higienização (devolução + 3 dias) conflita; rascunho da mesma peça vira conflito com `draft: true`.
  - `realignOnReturn`: devolução antecipada encolhe a locação e puxa a higienização; atrasada empurra a higienização e corta no início do próximo bloco.
  - `conversionRate`: sessões convertida, perdida, no_show, concluida, agendada → `{ closed: 3, converted: 1, rate: 1/3 }`.
- [ ] **Step 2:** `pnpm exec vitest run --project web src/domain` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar tipos, rótulos, códigos de erro e as funções de `src/domain/` conforme as specs de tela (§ citados acima).
- [ ] **Step 4:** Rodar os testes do passo 2 → PASS; `pnpm exec tsc -b` e suíte `web` inteira verdes.
- [ ] **Step 5:** Commit `feat(dominio): tipos, rótulos e regras puras de agenda, provas, reservas, operação e financeiro`.

## Task 2: Mundo de dados coerente e fonte em memória por áreas

**Files:**
- Create: `src/data/fixture/world.ts` (tipo `World` + `buildWorld(today)`), `src/data/fixture/history.ts` (locações finalizadas dos últimos 7 meses), `src/data/fixture/scenario.ts` (situação atual: reservas, provas, compromissos, operação), `src/data/fixture/finance.ts` (categorias, contas a pagar/receber avulsas), `src/data/mock/context.ts` (`MockCtx`), `src/data/mock/acervoClientes.ts` (o conteúdo atual de `mockSource.ts` movido para cá)
- Modify: `src/data/fixture/index.ts` (`buildFixture` passa a ser `buildWorld`; o tipo `Fixture` vira `World`), `src/data/fixture/garments.ts` (remove `CENARIO`; estados e blocos passam a vir do mundo), `src/data/mockSource.ts` (vira o compositor), `src/data/source.ts` (`DataSource` = interseção das interfaces de área; nesta tarefa só `AcervoClientesSource`), testes de 2A que dependiam do `CENARIO`/`rentals`
- Test: `src/data/fixture/world.test.ts`

**Interfaces:**
- Consumes: tudo da Task 1.
- Produces:
  - `World = { today: string; settings: Settings; users: AppUser[]; categories; brands; garments: Garment[]; customers: Customer[]; reservations: Reservation[] (com `items`, `payments`, `contract`, `authorizations`, `history`, `fittingId`); fittings: FittingSession[]; fittingItems: FittingItem[]; appointments: Appointment[]; maintenances: Maintenance[]; inspections: Inspection[]; checklist: ChecklistItem[]; finCategories: FinCategory[]; payables: Payable[]; receivables: Receivable[] /* só avulsos */; exceptions: ExceptionAuthorization[]; pinAttempts: { email: string; at: string; ok: boolean }[] }`.
  - `MockCtx = { db: World; today: string; userName(): string; run<T>(fn: () => T): Promise<T>; fail(issues: SourceIssue[], hint?: string): never; newId(prefix: string): string; garment(id): Garment; customer(id): Customer; reservation(id): Reservation }` e helpers de projeção `projectGarment(ctx, g)` (preenche `blocks` ativos ordenados) e `projectCustomer(ctx, c)` (recalcula `stats` a partir das reservas: `rentals` = reservas realizadas, `spent` = Σ `totalNet` delas, `nextEvent` = menor `eventDate ≥ hoje` de reserva ativa).
  - `createMockSource(opts)` continua com a mesma assinatura e devolve `{ ...acervoClientes(ctx) }` (as tarefas seguintes acrescentam `...agenda(ctx)`, `...reservas(ctx)`, etc.).
  - `garmentEconomics` passa a calcular com `economics` da spec dashboard §3.3 (receita = Σ `netRevenue` dos itens de reservas realizadas; limpeza/manutenção = contas a pagar `source: 'operacao'` da peça) e ganha `lastRental: string|null` em `GarmentEconomics`.
- Conteúdo do mundo (determinístico; offsets relativos a `today`; nomes das specs de tela):
  - Usuários: Júlia Senzi (admin, julia@senzi.com.br), Ana Lima (atendimento), Bruna Costa (atendimento).
  - Histórico (`history.ts`): ~7 meses de reservas `finalizada`, uma peça por reserva, sem sobreposição por peça, popularidade por peça como na spec dashboard §6 (Turim, Nápoles, Rimini nunca alugadas), desconto ocasional, `sinal` 50% + `saldo` na retirada, contrato assinado, inspeção 86% aprovada / 14% ressalva, despesa de higienização R$ 38–86 (Lavanderia Branca Neve) e de reparo R$ 25–115 (Ateliê Dona Neuza) nas com ressalva; 1 `cancelada` (Lecce, "Cliente adiou a festa") e 1 `no_show` (Bari). Códigos `RS-{ano}-{NNNN}` em ordem cronológica.
  - Situação atual (`scenario.ts`): as 15 situações da spec reservas §8 (itens 1–15, já traduzidos para o modelo novo: Sorrento `confirmada` com saldo e retirada amanhã; Bolonha e Capri como 2 `rascunho`s, Bolonha com conflito de exemplo; Siena só como prova), clientes do fixture atual; as provas da spec agenda-provas §7 (inclui 1 `concluida` e 1 `no_show`); compromissos (automáticos das reservas confirmadas + manuais: "Atendimento — primeira visita", "Coleta da lavanderia" (Serviço) e ao menos 2 `interno`, ex.: "Reunião de equipe", "Fotos do acervo novo"); pelo menos um dia com mais de 4 cartões e um dia com 5+ blocos de acervo; operação da spec operacao-financeiro §1.7 (Trastevere e Lecce em higienização, Parma em manutenção há 9 dias, Assis em ajuste, Gênova bloqueada editorial, Modena e Ravello em inspeção desde ontem). Umbria participa da devolução parcial (item 14), então a peça `baixado` passa a ser **Como**.
  - Financeiro (`finance.ts`): categorias de sistema (Receita: Locação; Despesa: Aquisição de acervo, Higienização, Manutenção, Ajuste) + livres da spec; despesas de aquisição de cada peça (`source: 'aquisicao'`, paga na data de aquisição); contas a pagar e receitas avulsas da "Fixture sugerida" da spec operacao-financeiro §2.7.
  - Estados e blocos das peças **derivados**: blocos das reservas confirmadas/ativas (`makeBlocks`), blocos da operação e bloqueios manuais; `state` por `deriveGarmentState` + estados da operação. Verona mantém o bloqueio manual "Separada para prova de noiva".
- [ ] **Step 1: Escrever `src/data/fixture/world.test.ts`**: (a) mesma data → mesmo mundo (determinismo); (b) nenhuma peça tem dois blocos ativos sobrepostos, exceto pares permitidos pela regra (higienização encostada); (c) para toda reserva, Σ `netRevenue` dos itens = `totalNet`; (d) toda peça em reserva `em_uso`/`retirada` está em `em_uso`/`aguardando_devolucao`; (e) Turim, Nápoles e Rimini sem nenhuma reserva realizada; (f) existem reservas nos 11 estados exceto `devolvida`; (g) existe prova `concluida` e `no_show`; (h) compromissos `interno` ≥ 2; (i) `lateFee` da devolução parcial = 20% × total × 1.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar o mundo, mover a fonte de Acervo/Clientes para `src/data/mock/acervoClientes.ts` sobre `MockCtx`, recalcular `stats` da cliente e economia da peça a partir do mundo.
- [ ] **Step 4:** Rodar a suíte `web` inteira. Testes de 2A que dependiam de valores do `CENARIO`/`rentals` antigos devem ser **atualizados para os novos dados**, sem afrouxar o que verificam (ex.: troque a data esperada, não remova a asserção). Liste no relatório cada teste ajustado e por quê.
- [ ] **Step 5:** Commit `feat(dados): mundo fictício coerente (reservas, provas, agenda, operação e financeiro) e fonte em memória por áreas`.

## Task 3: Fonte e hooks de Agenda e Provas

**Files:**
- Create: `src/data/source-agenda.ts` (`AgendaSource`), `src/data/mock/agenda.ts`, `src/data/hooks-agenda.ts`
- Modify: `src/data/source.ts` (`DataSource` inclui `AgendaSource`), `src/data/mockSource.ts`
- Test: `src/data/mock/agenda.test.ts`

**Interfaces:**
- Produces `AgendaSource`:
  - `agendaRange(from: string, to: string): Promise<AgendaDay[]>` — um `AgendaDay` por dia (inclusive), itens de `appointment` não cancelados ordenados por hora, `garmentBlocks` dos 5 tipos da spec (máx. 4; `moreBlocks` = excedente).
  - `agendaMonthDays(month: string /* aaaa-mm */): Promise<string[]>` — dias com ≥1 compromisso não cancelado.
  - `createAppointment(input: AppointmentInput): Promise<Appointment>`; `updateAppointment(id, input)`; `cancelAppointment(id)` — só manuais, senão `ESTADO_INVALIDO`. Validação: `DATA_OBRIGATORIA`, `HORARIO_OBRIGATORIO`, `CLIENTE_OBRIGATORIA` (sem Interno), `OBSERVACAO_OBRIGATORIA` (Interno sem cliente).
  - `listUsers(): Promise<AppUser[]>`.
  - `listFittings(filter: FittingFilter, page: PageRequest): Promise<PageResult<FittingListRow>>` (ordem `scheduledAt` desc); `fittingKpis(): Promise<FittingKpis>`.
  - `getFitting(id): Promise<FittingDetail | null>`.
  - `createFitting(input: FittingInput): Promise<FittingSession>` — `newCustomer` passa pela mesma validação de `createCustomer` (mesmos códigos); `CLIENTE_OBRIGATORIA`, `DATA_OBRIGATORIA`, `DATAS_INCOERENTES`; horário vazio → `15:00`; cria o compromisso `prova`.
  - `addFittingGarment(id, garmentId)`, `removeFittingGarment(id, garmentId)`, `setFittingOutcome(id, garmentId, { outcome?: FitOutcome; needsAlteration?: boolean; note?: string|null })` (nota preservada quando ausente; `agendada → em_curso`; `favorita` cria favorito `source: 'prova'`), `closeFitting(id, state: 'perdida'|'concluida'|'no_show', notes: string|null)` — todas `PROVA_ENCERRADA` se a prova não está aberta; devolvem `FittingDetail`.
  - `fittingsOfCustomer(customerId): Promise<FittingListRow[]>`; `fittingStatsOf(garmentId): Promise<FittingGarmentStats>`.
- Produces hooks (`hooks-agenda.ts`), chaves sob `['agenda', …]`, `['fittings', …]`, `['fitting', id]`: `useAgendaRange`, `useAgendaMonthDays`, `useCreateAppointment`, `useUpdateAppointment`, `useCancelAppointment`, `useUsers`, `useFittings`, `useFittingKpis`, `useFitting`, `useCreateFitting`, `useFittingMutation` (add/remove/outcome/close), `useCustomerFittings`, `useFittingStats`. Toda mutação desta tarefa e das seguintes chama `invalidateWorld(qc)` = `qc.invalidateQueries()` sem filtro **exceto** `['categories']` (exportar de `src/data/hooks.ts` e usar em todas as áreas).
- [ ] **Step 1:** Testes em `agenda.test.ts`: `agendaRange` de hoje traz os compromissos do cenário ordenados por hora e sem cancelados; criar Interno sem cliente e sem observação → `OBSERVACAO_OBRIGATORIA`; criar Atendimento sem cliente → `CLIENTE_OBRIGATORIA`; cancelar compromisso automático → `ESTADO_INVALIDO`; `createFitting` com `newCustomer` de CPF duplicado → `CPF_DUPLICADO` e nenhuma prova criada; `setFittingOutcome` sem `note` mantém a nota anterior e move `agendada → em_curso`; `closeFitting` duas vezes → `PROVA_ENCERRADA`; `fittingKpis` bate com `conversionRate` do domínio.
- [ ] **Step 2–4:** FAIL → implementar → PASS (suíte `web` verde).
- [ ] **Step 5:** Commit `feat(agenda): fonte em memória e hooks de agenda e provas`.

## Task 4: Tela Agenda (kanban de 4 dias) e Novo compromisso

**Files:**
- Create: `src/features/agenda/AgendaPage.tsx`, `src/features/agenda/DayColumn.tsx`, `src/features/agenda/AppointmentModal.tsx`, `src/features/agenda/CustomerPicker.tsx` (busca de cliente reutilizável: `searchCustomers`, teclado acessível, opção "Cadastrar nova cliente" opcional por prop), `src/features/agenda/agenda.css`
- Modify: `src/preview/previewRoutes.tsx` (`agenda`), `src/shell/nav.ts` (item **Provas** `/provas`, ícone de prova existente ou novo em `icons.ts`, perm `prova.view`, após Agenda)
- Test: `src/features/agenda/agenda.test.tsx`

**Interfaces:**
- Consumes: hooks da Task 3; `weekdayIndex`, `dayRange`, `dateBR`.
- Produces: `CustomerPicker({ value, onChange, allowCreate?, onCreateRequest? })` (usado também nas Tasks 5 e 7).
- Layout/conteúdo: spec agenda-provas §2.1, §3.1 + Decisões 1–3. Kanban: contêiner com rolagem horizontal, `scroll-snap-type: x mandatory`, colunas com largura = 1/4 da área (mín. 220px; 2 colunas ≤ 760px; 1 coluna ≤ 560px), setas `‹ ›` com aria-labels "Anterior"/"Próximo", "Hoje", chips de tipo, cabeçalho com o intervalo visível. Cada dia é `role="region"` com `aria-label` "segunda, 26/10" etc.
- [ ] **Step 1:** Testes: com `today` = um domingo, as colunas visíveis seguem `… sáb, dom` e a próxima é `seg` (semana segunda→domingo); abre com hoje marcado "hoje" e visível; chip "Prova" esconde os outros tipos mas mantém os blocos de acervo; "+N peças" aparece no dia com 5+ blocos; `?dia=` abre centrado no dia pedido; "Novo compromisso" com Interno marcado salva sem cliente e o cartão aparece com rótulo "Interno"; sem Interno e sem cliente mostra "Selecione a cliente." no campo; Atendimento vê o botão (tem `agenda.manage`); cartão de prova leva a `/preview/provas/:id`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(agenda): kanban de 4 dias com rolagem e novo compromisso (interno)`.

## Task 5: Provas — lista, ficha, modais e aba Provas da cliente

**Files:**
- Create: `src/features/provas/ProvasListPage.tsx`, `src/features/provas/FittingPage.tsx`, `src/features/provas/FittingItemRow.tsx`, `src/features/provas/ScheduleFittingModal.tsx`, `src/features/provas/PickGarmentModal.tsx`, `src/features/provas/FittingNoteModal.tsx`, `src/features/provas/CloseFittingModal.tsx`, `src/features/provas/provas.css`
- Modify: `src/preview/previewRoutes.tsx` (`provas`, `provas/:id`), `src/features/clientes/CustomerPage.tsx` (aba **Provas** com a lista e botão "+ Agendar" que abre `ScheduleFittingModal` com a cliente), `src/features/acervo/GarmentPage.tsx` (aba **Provas** da peça: `fittingStatsOf` + lista de provas em que a peça entrou, como `prv` do protótipo)
- Test: `src/features/provas/provas.test.tsx`

**Interfaces:**
- Consumes: Task 3, `CustomerPicker` (Task 4), `CustomerForm` existente (para "Cadastrar nova cliente" dentro do agendamento: reaproveitar os campos obrigatórios Nome, Telefone, Nascimento, CPF com as mesmas máscaras).
- Produces: `ScheduleFittingModal({ open, onClose, customerId? })`.
- "Gerar reserva" navega para `href('/reservas?nova=1&prova=<id>')` (a Task 7 lê esse parâmetro).
- Conteúdo: spec agenda-provas §2.2, §2.3, §3.2–3.6, Decisão 4.
- [ ] **Step 1:** Testes: lista abre no filtro "Em aberto" com os 4 tiles e a taxa no subtítulo; "Todas" inclui a `concluida`; agendar prova cadastrando cliente nova com CPF inválido mostra "CPF inválido." no campo e não cria nada; agendar com cliente existente navega para a ficha nova; data do evento antes da prova → "O evento não pode ser antes da prova."; na ficha, clicar "Gostou" numa peça com nota mantém a nota visível; "Encerrar prova" com peça sem resultado mostra o aviso âmbar e, após encerrar, os botões de edição somem; "Gerar reserva" só aparece com ≥1 peça aprovada; aba Provas na ficha da cliente lista as sessões dela.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(provas): lista, ficha da prova, agendamento com cliente completa e abas de provas`.

## Task 6: Fonte e hooks de Reservas + autorizador de exceções

**Files:**
- Create: `src/data/source-reservas.ts` (`ReservasSource`), `src/data/mock/reservas.ts`, `src/data/mock/contract.ts` (`renderContract(world, reservation): string` — template da spec reservas §5.1 com "Senzi Club"), `src/data/hooks-reservas.ts`, `src/features/exceptions/ExceptionAuthorizer.tsx` (contexto + implementação Supabase padrão), `src/data/mock/exceptions.ts`
- Modify: `src/features/exceptions/AuthorizeExceptionDialog.tsx` (usa o contexto; mostra `demoHint` quando o autorizador fornecer), `src/preview/PreviewLayout.tsx` (fornece o autorizador em memória), `src/data/source.ts`, `src/data/mockSource.ts`
- Test: `src/data/mock/reservas.test.ts`; o teste existente do diálogo continua passando sem mudança de asserções

**Interfaces:**
- Produces `ExceptionAuthorizer = { listActiveAdmins(): Promise<{ id: string; full_name: string; email: string }[]>; authorize(args: { email: string; pin: string; kind: ExceptionKind; reason: string; refType: string; refId: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }>; demoHint?: string }` e `ExceptionAuthorizerProvider`; mock: Júlia Senzi/`1234`, erro `AUTORIZACAO_INVALIDA`, bloqueio `PIN_BLOQUEADO` após 5 erros em 15 min, motivo vazio → `MOTIVO_OBRIGATORIO`; grava `ExceptionAuthorization` no mundo (vínculo à reserva quando `refType = 'reserva'`; `refType = 'reserva_rascunho'` com `refId` temporário é religado no `createDraft`).
- Produces `ReservasSource`:
  - `listReservations(filter: ReservationFilter, page: PageRequest): Promise<PageResult<ReservationRow>>` (`ReservationRow = { id; code; state; customerName; garments: { code; shortName }[]; eventDate; eventType; pickupDate; returnDueDate; daysLate: number; payStatus: PayStatus|null; totalNet; due }`, ordenação da spec §2.1); `reservationSummary(): Promise<{ active: number; toReceive: number }>`.
  - `getReservation(id): Promise<ReservationDetail | null>` — `ReservationDetail = Reservation & { customer: Customer; garments: Garment[]; conflicts: AvailabilityResult[] /* só rascunho */; fittingCode: string|null; fittingDate: string|null; minSignal: number; depositSuggested: number }`.
  - `checkAvailability(garmentIds, pickup, returnDue, ignoreReservationId?): Promise<AvailabilityResult[]>`; `alternatives(garmentId, pickup, returnDue): Promise<Garment[]>`.
  - `createDraft(input: ReservationInput, exceptionId?: string): Promise<Reservation>` / `updateDraft(id, input, exceptionId?)` — validações da spec §3.1 (todos os problemas em `issues`, `field` = `customerId|items|eventDate|returnDueDate|pickupDate|discount`), `DESCONTO_ACIMA_LIMITE` sem exceção; conflitos não bloqueiam; gera/regera contrato; com `input.fittingId` converte a prova.
  - `addDraftItem(id, garmentId)`, `removeDraftItem(id, itemId)` (`RESERVA_SEM_PECAS` se ficaria vazia).
  - `markContractSigned(id, { signedAt: string; signerName: string; notes: string|null })`.
  - `confirmReservation(id, { amount, method, reference, notes }, exceptionId?): Promise<{ ok: true; reservation: Reservation } | { ok: false; conflicts: AvailabilityResult[] }>` — `CONTRATO_NAO_ASSINADO`, `SINAL_INSUFICIENTE` (sem exceção), `VALOR_EXCEDE_SALDO`, `VALOR_INVALIDO` lançados como `SourceError`; conflito → `{ ok: false }` e **nada muda**; sucesso aplica os efeitos da spec §3.2 (blocos, estados de peça, sinal pago, saldo pendente com vencimento na retirada, compromissos, histórico, exceção).
  - `registerPayment(id, { kind, method, amount, reference, notes, refersTo? })`, `returnDeposit(id, method)`.
  - `markReady(id)`, `pickupItems(id, decisions: PickupDecision[], exceptionId?)` (`SALDO_EM_ABERTO` sem exceção quando há saldo), `returnItems(id, decisions: ReturnDecision[])` (multa única, `realignOnReturn`, peça → `inspecao`), `cancelReservation(id, reason)` (`MOTIVO_OBRIGATORIO`), `markNoShow(id)` — estado errado → `ESTADO_INVALIDO`.
  - `reservationsOfCustomer(customerId)`, `reservationsOfGarment(garmentId): Promise<ReservationRow[]>`; `getSettings(): Promise<Settings>`.
- Hooks (`hooks-reservas.ts`) com chaves `['reservations', …]`, `['reservation', id]`, todas as mutações com `invalidateWorld`.
- [ ] **Step 1:** Testes: rascunho com peça em conflito é criado (estado `rascunho`, peça continua `disponivel`, sem blocos); desconto de 16% sem exceção → `DESCONTO_ACIMA_LIMITE`, com exceção válida → cria; confirmar sem contrato assinado → `CONTRATO_NAO_ASSINADO`; **confirmar com uma das duas peças em conflito → `{ ok: false }` e o mundo fica idêntico (compare `structuredClone` antes/depois de reservas, blocos, pagamentos e estados das peças)**; confirmar ok cria blocos locação + higienização, sinal pago, saldo pendente com `dueAt = pickupDate` e 3 compromissos; sinal abaixo de 50% sem exceção → `SINAL_INSUFICIENTE`; retirada com saldo sem exceção → `SALDO_EM_ABERTO`; devolução parcial de 1 de 2 peças atrasada 1 dia gera uma multa pendente de 20% × total e reserva `aguardando_devolucao`; cancelar sem motivo → `MOTIVO_OBRIGATORIO`; cancelar libera blocos e compromissos; autorizador: PIN errado 5× → `PIN_BLOQUEADO` mesmo com PIN certo na 6ª.
- [ ] **Step 2–4:** FAIL → implementar → PASS (inclui o teste existente de `AuthorizeExceptionDialog`).
- [ ] **Step 5:** Commit `feat(reservas): fonte em memória (rascunho, confirmação atômica, pagamentos, retirada, devolução) e autorizador de exceções da prévia`.

## Task 7: Reservas — lista e Nova reserva / Editar rascunho

**Files:**
- Create: `src/features/reservas/ReservasListPage.tsx`, `src/features/reservas/ReservationForm.tsx` (modal largo), `src/features/reservas/GarmentSelector.tsx` (busca + pílulas de disponibilidade + alternativas; reaproveitado em "Adicionar peça"), `src/features/reservas/reservas.css`
- Modify: `src/preview/previewRoutes.tsx` (`reservas`), `src/features/acervo/GarmentPage.tsx` (botão "Reservar" → `/reservas?nova=1&peca=<id>`), `src/features/clientes/CustomerPage.tsx` (botão "Nova reserva" → `/reservas?nova=1&cliente=<id>`)
- Test: `src/features/reservas/list.test.tsx`

**Interfaces:**
- Consumes: Task 6, `CustomerPicker`, `AuthorizeExceptionDialog`.
- Produces: `ReservationForm({ open, onClose, draft?: ReservationDetail, initial?: { customerId?; garmentIds?; fittingId?; eventDate?; eventType? } })`.
- URL: `?f=` filtro (padrão `ativas`), `?nova=1` abre o formulário com `cliente`, `peca`, `prova` (lê a prova: cliente, peças aprovadas, tipo e data do evento); fechar remove os parâmetros (replace); criar navega para a ficha com replace (padrão de 2A).
- Conteúdo: spec reservas §2.1, §3.1, §3.3, Decisão 5.
- [ ] **Step 1:** Testes: lista abre em "Ativas" sem rascunhos encerrados e com "Rascunhos" listando Bolonha e Capri; Atendimento não vê as colunas Pagamento/Valor nem o chip "Com saldo"; atraso aparece como "2d de atraso" em vermelho; "?nova=1&peca=sz-0107" abre o formulário com Verona selecionada; peça em conflito mostra a pílula de conflito e a faixa âmbar com alternativas, mas "Criar rascunho" funciona; erros listados na caixa "Corrija antes de continuar:" com as frases verbatim; desconto acima de 15% abre o diálogo de PIN e, com 1234, cria o rascunho; vindo de prova (`?prova=`), o rascunho criado deixa a prova "Convertida".
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(reservas): lista com filtros e formulário de rascunho com disponibilidade e alternativas`.

## Task 8: Reservas — ficha, ações, documentos e WhatsApp

**Files:**
- Create: `src/features/reservas/ReservationPage.tsx`, `src/features/reservas/ReservationSide.tsx`, `src/features/reservas/ReservationItems.tsx`, `src/features/reservas/PaymentsTab.tsx`, `src/features/reservas/ContractTab.tsx`, `src/features/reservas/modals/ConfirmModal.tsx`, `PaymentModal.tsx`, `PickupModal.tsx`, `ReturnModal.tsx`, `SignContractModal.tsx`, `CancelModal.tsx`, `ConflictModal.tsx` (em `src/features/reservas/modals/`), `src/features/reservas/print/ContractPrint.tsx`, `src/features/reservas/print/OsPrint.tsx`, `src/features/reservas/print/print.css`, `src/features/reservas/whatsapp.ts` (`waLink(phone, text)`, `messages(detail, settings)`)
- Modify: `src/preview/previewRoutes.tsx` (`reservas/:id`, `reservas/:id/contrato`, `reservas/:id/os`; as duas últimas renderizam sem a moldura na impressão), `src/features/acervo/GarmentPage.tsx` (aba **Reservas** com contador), `src/features/clientes/CustomerPage.tsx` (aba **Reservas**)
- Test: `src/features/reservas/detail.test.tsx`, `src/features/reservas/whatsapp.test.ts`

**Interfaces:**
- Consumes: Task 6, `AuthorizeExceptionDialog`.
- Conteúdo: spec reservas §2.2, §3.2, §3.4–§3.10, §5, Decisões 5–8. Botões do cabeçalho por estado+permissão exatamente da tabela §2.2. Depois de "Confirmar devolução", navegar para `/operacao` se `operacao.view`.
- Mensagens WhatsApp: as 6 da spec §5.4 sem `{link}` (Decisão 8); telefone sem dígitos → botão desabilitado com dica "Cliente sem telefone".
- [ ] **Step 1:** Testes: rascunho mostra "Editar rascunho", "Confirmar reserva" e o aviso de conflito; Confirmar com contrato não assinado deixa o botão desabilitado e oferece "Marcar como assinado"; marcar assinado + sinal 50% confirma e a aba Histórico mostra "Confirmada"; confirmação recusada (rascunho Bolonha) mostra o modal "Confirmação recusada" com "nada foi alterado"; sinal abaixo do mínimo troca o botão para "Dispensar sinal mínimo e confirmar"; reserva com saldo: retirada pede PIN ("Autorizar e entregar"); reserva atrasada mostra a faixa vermelha com a multa calculada; Atendimento (tem `financeiro.view`) vê os valores da reserva, mas nenhum texto de custo da peça ("Custo", "Payback", "Resultado"); `/reservas/:id/contrato` contém "CONTRATO DE LOCAÇÃO DE VESTUÁRIO Nº CT-" e "Senzi Club" e nunca "Senzie"; `waLink('63 99612-4478', 'Olá')` = `https://wa.me/5563996124478?text=Ol%C3%A1`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(reservas): ficha com confirmação atômica, pagamentos, retirada, devolução, contrato, OS e WhatsApp`.

## Task 9: Operação — fonte, tela, modais e aba Manutenções da peça

**Files:**
- Create: `src/data/source-operacao.ts`, `src/data/mock/operacao.ts`, `src/data/hooks-operacao.ts`, `src/features/operacao/OperacaoPage.tsx`, `src/features/operacao/QueueCard.tsx`, `src/features/operacao/InspectionModal.tsx`, `src/features/operacao/CloseMaintenanceModal.tsx`, `src/features/operacao/operacao.css`
- Modify: `src/data/source.ts`, `src/data/mockSource.ts`, `src/preview/previewRoutes.tsx` (`operacao`), `src/features/acervo/GarmentPage.tsx` (aba **Manutenções** com contador: ordens e inspeções da peça)
- Test: `src/data/mock/operacao.test.ts`, `src/features/operacao/operacao.test.tsx`

**Interfaces:**
- Produces `OperacaoSource`: `operacaoQueue(): Promise<OperacaoQueue>`; `checklist(): Promise<ChecklistItem[]>`; `inspectionTarget(garmentId): Promise<{ reservationId: string; customerName: string } | null>`; `registerInspection(input: InspectionInput): Promise<{ result: InspectionResult; garment: Garment }>`; `closeMaintenance(input: CloseMaintenanceInput): Promise<Garment>` (custo > 0 vira conta a pagar paga, `source: 'operacao'`); `releaseGarment(garmentId, note): Promise<Garment>`; `maintenancesOf(garmentId): Promise<{ maintenances: Maintenance[]; inspections: Inspection[] }>`; `suppliers(): Promise<string[]>`.
- Conteúdo: spec operacao-financeiro Parte 1 + Decisão 9. Fotos da inspeção são marcadores simulados (sem upload) com o rótulo do tipo.
- [ ] **Step 1:** Testes (fonte): inspeção aprovada → peça `higienizacao` com ordem `em_andamento`; grave → `manutencao` com bloco 5 dias; grave + perda → `bloqueado` 30 dias sem ordem; última peça inspecionada finaliza a reserva; concluir com custo 58 cria conta a pagar paga de Higienização. Testes (tela + coerência, Review Focus 5): partindo da prévia, abrir a reserva da devolução de hoje (Ostuni), registrar devolução → a tela vai para Operação e Ostuni está em "Aguardando inspeção"; inspecionar sem ressalvas → Ostuni em "Em higienização"; voltar à reserva → estado "Finalizada"; Atendimento não vê "em custos nos últimos 30 dias".
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(operacao): filas pós-devolução, inspeção, conclusão e liberação`.

## Task 10: Fonte e hooks do Financeiro

**Files:**
- Create: `src/data/source-financeiro.ts`, `src/data/mock/financeiro.ts`, `src/domain/finance.ts` (`financeOverview(world, range, today)`, `reservationReceivables(world, today)` — parcelas sinal/saldo/multa/caução derivadas das reservas, `receivableStatus`, `payableStatus`, `nextRecurrence(dueDate, recurrence)` com ajuste de fim de mês), `src/data/hooks-financeiro.ts`
- Modify: `src/data/source.ts`, `src/data/mockSource.ts`
- Test: `src/domain/finance.test.ts`, `src/data/mock/financeiro.test.ts`

**Interfaces:**
- Produces `FinanceiroSource`: `financeOverview(range: FinanceRange): Promise<FinanceOverview>`; `listReceivables(f: { status: 'abertas'|'vencidas'|'recebidas'|'todas'; origin: 'todas'|'reservas'|'avulsas'; categoryId: string|null; q: string; range: FinanceRange|'tudo' }): Promise<{ rows: Receivable[]; total: number; totals: { open; overdue; dueIn7; receivedInRange } }>`; `createReceivable(input)`, `updateReceivable(id, input)`, `receiveReceivable(id, { amount; receivedAt; method; notes })`, `cancelReceivable(id)`; `listPayables(f: { status: 'abertas'|'vencidas'|'pagas'|'todas'; categoryId; recurrence: 'todas'|'unica'|'recorrente'; q; range })` com `totals: { open; overdue; dueIn7; paidInRange }`; `createPayable`, `updatePayable` (automáticas → `ESTADO_INVALIDO`), `payPayable(id, { paidAt; paidAmount; method; notes })` (gera a próxima ocorrência), `deletePayable`; `listFinCategories(): Promise<(FinCategory & { usageCount: number })[]>`, `createFinCategory`, `updateFinCategory`, `archiveFinCategory`, `deleteFinCategory`. Validações e códigos da spec §2.3 (Task 1).
- [ ] **Step 1:** Testes: `financeOverview('90')` — Recebido = Σ sinal/saldo/integral/multa pagos no período − estornos de receita; caução fora do Recebido e dentro de `custody`; `result = received − paid`; `operatingMargin` null quando Recebido = 0; `nextRecurrence('2026-01-31', 'mensal')` = `'2026-02-28'`; pagar a ocorrência de aluguel mensal cria a do mês seguinte; excluir categoria com uso → `CATEGORIA_EM_USO`; categoria de sistema → `CATEGORIA_SISTEMA`; saldo de reserva confirmada aparece em Contas a Receber com vencimento na retirada e caução marcada `isCustody`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(financeiro): fonte em memória de visão geral, contas a receber, a pagar e categorias`.

## Task 11: Telas do Financeiro e submenu

**Files:**
- Create: `src/features/financeiro/FinanceNav.tsx`, `FinanceOverviewPage.tsx`, `ReceivablesPage.tsx`, `PayablesPage.tsx`, `CategoriesPage.tsx`, `modals/ReceivableModal.tsx`, `modals/ReceiveModal.tsx`, `modals/PayableModal.tsx`, `modals/PayModal.tsx`, `modals/CategoryModal.tsx`, `src/features/financeiro/charts.tsx` (linha/barras SVG acessíveis reutilizadas também pelo Dashboard e Inteligência: `LineChart`, `BarList`, `ColumnChart`), `src/features/financeiro/financeiro.css`
- Modify: `src/shell/nav.ts` (`NavItem.children?: NavItem[]`: Visão geral `/financeiro` `financeiro.view`, Contas a Receber `/financeiro/receber` `financeiro.geral`, Contas a Pagar `/financeiro/pagar` `financeiro.geral`, Categorias `/financeiro/categorias` `financeiro.geral`), `src/shell/Sidebar.tsx` (renderiza subitens indentados quando a seção está ativa; ocultos no trilho/topo), `src/preview/PreviewLayout.tsx` (filtra subitens por permissão), `src/preview/previewRoutes.tsx`
- Test: `src/features/financeiro/financeiro.test.tsx`, ajuste de `src/shell/shell.test.tsx` se necessário

**Interfaces:**
- Consumes: Task 10, `PaymentModal` da Task 8 (botão "Registrar pagamento" das parcelas de reserva).
- Produces: `LineChart({ points: { label: string; value: number }[]; ariaLabel; format })`, `BarList({ rows: { label; value; note?; color?; href? }[]; format })`, `ColumnChart(...)`.
- Conteúdo: spec operacao-financeiro Parte 2 + Decisão 10. Período na URL (`?periodo=30|90|365`).
- [ ] **Step 1:** Testes: Admin vê na sidebar os 4 subitens ao entrar em Financeiro; Atendimento vê só a Visão geral reduzida (sem Pago, Resultado, Custo operacional, Margem, Investido; sem subitens; sem abas) e acessar `/preview/financeiro/pagar` mostra a tela de acesso restrito existente; trocar o período muda o subtítulo; Contas a Pagar → "Nova despesa" sem descrição mostra "Informe a descrição." no campo; pagar a conta vencida a tira da aba "Vencidas"; despesa automática não tem "Editar"; Categorias: categoria de sistema com pill "Sistema" e sem "Excluir".
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(financeiro): visão geral, contas a receber, contas a pagar, categorias e submenu`.

## Task 12: Dashboard real

**Files:**
- Create: `src/data/source-painel.ts` (`PainelSource`), `src/data/mock/painel.ts`, `src/domain/alerts.ts` (`computeAlerts(world, today): Alert[]` — 12 tipos da spec dashboard §3.1, ordenação estável por severidade), `src/data/hooks-painel.ts`, `src/features/dashboard/DashboardPage.tsx`, `AlertsStrip.tsx`, `TodayAgenda.tsx`, `MiniCalendar.tsx`, `RevenueCard.tsx`, `CycleCard.tsx`, `dashboard.css`
- Modify: `src/preview/previewRoutes.tsx` (`index` → `DashboardPage`), remover `src/preview/PreviewPage.tsx` e seu teste (o conteúdo aprovado vira referência visual da nova tela: mesma ordem e estilo), `src/data/source.ts`, `src/data/mockSource.ts`
- Test: `src/domain/alerts.test.ts`, `src/features/dashboard/dashboard.test.tsx`

**Interfaces:**
- Produces `PainelSource`: `dashboardSummary(range: '7'|'30'|'90'): Promise<DashboardSummary>` (alertas já ordenados; `finance` sempre calculado — a tela decide mostrar por permissão); `agendaMonthDays` é reutilizado da Task 3.
- Botões "Retirar"/"Devolver" da agenda de hoje abrem `PickupModal`/`ReturnModal` da Task 8; "Abrir prova" → ficha da prova; "Ver financeiro completo" → `/financeiro`; "Ver operação" → `/operacao`; mini calendário → `/agenda?dia=…`.
- Conteúdo: spec dashboard-inteligencia §2.1, §3.1, §3.2 + Decisão 11.
- [ ] **Step 1:** Testes (alertas): com o mundo do dia, existem `devolucao_atrasada` (Portofino) crítico antes de qualquer atenção; aniversário em 01/01 visto de 30/12 gera "Aniversário em 2 dia(s)"; `pagamento_pendente` some quando o saldo é quitado. Testes (tela): ordem das seções Alertas → tiles → Agenda de hoje → Faturamento/Ciclo; clicar um alerta navega para a rota dele; "Ver todos (N)" expande; clicar um dia do mini calendário vai para `/preview/agenda?dia=…` e o kanban centra nele; Atendimento vê "Provas de hoje e amanhã" no lugar de "Faturamento recebido" (sem "Ticket médio" nem valores do gráfico) e continua vendo o alerta `pagamento_pendente` (tem `financeiro.view`).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(dashboard): alertas no topo, agenda do dia com mini calendário, faturamento e ciclo operacional`.

## Task 13: Inteligência

**Files:**
- Create: `src/domain/intel.ts` (`intelReport(world, days, today, categorySlug|null): IntelReport` — todas as fórmulas e os 11 insights da spec dashboard §3.3 com as Decisões 12), `src/data/mock/intel.ts`, `src/data/hooks-intel.ts`, `src/features/inteligencia/IntelPage.tsx`, `IntelSections.tsx` (5 seções), `Insights.tsx`, `intel.css`
- Modify: `src/data/source.ts` (`IntelSource.intelReport(days: IntelPeriod, categorySlug: string|null)`), `src/data/mockSource.ts`, `src/preview/previewRoutes.tsx` (`inteligencia`)
- Test: `src/domain/intel.test.ts`, `src/features/inteligencia/intel.test.tsx`

**Interfaces:**
- Consumes: `charts.tsx` da Task 11, `fittingStats`/`conversionRate` (Task 1), economia da peça (Task 2).
- Conteúdo: spec dashboard-inteligencia §2.2 (inventário completo + reorganização) e §3.3.
- [ ] **Step 1:** Testes (domínio): ticket por item ≠ ticket do dashboard por reserva quando há reserva multi-peça; Milano aparece em "Encanta e não fecha"; Turim, Nápoles e Rimini em Capital parado como "nunca alugada"; taxa de conversão ignora `concluida`; ocupação por categoria ≤ 100%; com período sem locações, ticket = 0 e nenhum insight #1. Testes (tela): as 5 seções existem com os títulos de pergunta; os 7 tiles e todos os cards do inventário estão presentes (um teste que lista os 10 títulos de card da spec e verifica cada um); trocar o período muda o subtítulo; filtro de categoria restringe "Receita por peça"; Atendimento não vê o item "Inteligência" na sidebar e a rota mostra acesso restrito.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(inteligencia): relatório completo do protótipo reorganizado por pergunta de negócio`.
