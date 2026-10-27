# Senzi OS — Plano 2B: todas as áreas no Supabase

**Goal:** o app real (`/`, com login) usa o Supabase em todas as telas que hoje só existem na prévia (`/preview`,
dados em memória). Cada área ganha migration (tabelas + RPCs + RLS), testes de banco, adaptador
`src/data/supabase/<area>.ts` e as rotas reais ligadas. A prévia continua igual (fonte em memória).

**Branch/worktree:** `etapa-2b-banco` em `/Users/joao/Documents/senzi-club-banco`. Nunca mexer na pasta
`/Users/joao/Documents/Senzi Club` (outra sessão trabalha lá).

**Spec funcional = a fonte em memória.** Para cada área, a implementação em `src/data/mock/<area>*.ts` e os testes
`src/data/mock/<area>*.test.ts` definem as regras (validações, códigos de erro, estados, cálculos). O banco reproduz
o mesmo comportamento observável pela interface `DataSource` (`src/data/source*.ts`). Também: spec
`docs/superpowers/specs/2026-10-23-senzi-os-design.md`, `docs/superpowers/specs/telas/*.md`, decisões em
`docs/superpowers/plans/2026-10-24-senzi-03v-pendencias.md` e `2026-10-23-senzi-02a-pendencias.md`.

## Padrão (copiar o Acervo — `supabase/migrations/20261027000100_acervo.sql`, `src/data/supabase/acervo.ts`)

- **Migration nova por área** em `supabase/migrations/2026102700NN00_<area>.sql` (NN crescente). Nunca editar
  migration já commitada; para mudar algo de uma área anterior, nova migration com `create or replace`.
- **Tabelas sem grant para anon/authenticated** (`revoke all ... from public, anon, authenticated, service_role;
  grant select ... to service_role`), RLS ligado, sem policies. Toda leitura/escrita via RPC `security definer`
  com `set search_path = public, pg_temp`, começando por `perform public.require_perm('<perm>')`.
  Sequences de identity: `revoke all ... from public, anon, authenticated`.
- **Funções internas** (helpers, triggers): `revoke all on function ... from public, anon, authenticated`.
  **RPCs públicas**: `revoke all ... from public, anon` + `grant execute ... to authenticated`. Atualizar a lista
  exata de funções executáveis em `tests/db/revisao.test.ts` ("funções internas (triggers) não são executáveis").
- **Erros**: `raise exception '<CODIGO>' using detail = '<campo>', hint = '<detalhe>'` — os mesmos códigos e
  campos da fonte em memória. Validações de formulário que a fonte em memória faz com `*Issues()` de
  `src/data/validation.ts` rodam também no adaptador antes da RPC (para devolver todos os problemas de uma vez);
  o banco valida de novo (defesa). Código novo → `SourceErrorCode` em `src/data/types.ts` + mensagem pt-BR em
  `src/lib/errorMessages.ts`.
- **Leituras devolvem jsonb já no formato dos tipos do app** (camelCase, como `public.garment_json`). Datas puras
  `aaaa-mm-dd`, instantes ISO. Dinheiro `numeric(12,2)`. "Hoje" = `public.store_today()` (fuso America/Araguaina).
- **Permissões**: catálogo em `supabase/migrations/20261023000100_acesso.sql` / `src/auth/permissions.ts`. Campos
  que a tela esconde por permissão (custos `acervo.cost`, valores consolidados `financeiro.consolidated`, dinheiro
  da cliente `financeiro.view`, etc.) **saem `null` do banco** para quem não tem a permissão.
- **Auditoria**: `create trigger <t>_audit after insert or update or delete ... execute function public.audit_trigger()`
  em toda tabela de negócio (não em tabelas que já são histórico/log).
- **Concorrência**: mutações que mexem em agenda de peça/saldos travam as linhas (`for update`) ou usam
  `pg_advisory_xact_lock`; códigos sequenciais (`SZ-NNNN`, `CL-NNNN`, …) sob advisory lock como em `create_garment`.
- **Adaptador** `src/data/supabase/<area>.ts`: `export function supabase<Area>(client: SupabaseClient): Pick<DataSource, ...>`;
  reaproveitar `fromDbError` e a assinatura de fotos de `acervo.ts` (exportar helpers se precisar, sem duplicar).
  Entrar em `createSupabaseSource` (`src/data/supabaseSource.ts`), removendo stubs que a área substitui.
- **Rotas reais**: em `src/app/router.tsx`, mapa `LIVE` + rotas de detalhe (espelhar `src/preview/previewRoutes.tsx`,
  inclusive os `RequirePerm`). Se uma tela precisar de provider que só a prévia monta (ex.: `ExceptionAuthorizerProvider`),
  montar o equivalente real em `SupabaseDataLayout` (o autorizador real chama a RPC `authorize_exception`).
- **Testes**: `tests/db/<area>.test.ts` (PGlite, `tests/db/harness.ts`) cobrindo regras, permissões, anon, e o caminho
  feliz de cada RPC; `src/data/supabase/<area>.test.ts` com cliente falso (ver `acervo.test.ts`) para o mapeamento.
- **Verificação ao fim de cada área**: `pnpm typecheck && pnpm lint && pnpm test:db && pnpm test:web && pnpm build`.
  O teste "busca verde… debounce" de `src/features/acervo/list.test.tsx` e o "Nova peça" de `garment.test.tsx` às vezes
  falham sob carga desde antes (instabilidade conhecida) — passam isolados; qualquer outra falha é sua.
- **Commit** ao fim de cada área: `feat(db): <área> no Supabase` + linha `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Marca **Senzi** (nunca "Senzie"); textos pt-BR.

## Ordem

1. **Clientes** — cadastro, medidas versionadas, modelo ideal (`idealMeasurements`), preferências, observações,
   favoritos, recomendações, busca. Estatísticas de reserva (`stats`) zeradas/nulas até a área 3 (com comentário).
   Rotas `/clientes`, `/clientes/:id`.
2. **Agenda e Provas** — compromissos, sessões de prova e itens; `source-agenda.ts`. Rotas `/agenda`, `/provas`, `/provas/:id`.
3. **Reservas** — rascunho, contrato (versões), confirmação com sinal, pagamentos, caução, retirada, devolução, multa,
   cancelamento, no-show, exceções por PIN (consumir `exception_authorization`), configurações (`getSettings`),
   blocos `locacao`/`higienizacao` na agenda da peça e estados da peça; `reservationsOfCustomer/Garment`;
   completar `stats` das clientes e receita/locações na economia da peça. Rotas `/reservas`, `/reservas/:id`,
   `/reservas/:id/contrato`, `/reservas/:id/os`.
4. **Financeiro** — categorias (com as de sistema), contas a pagar (recorrência), a receber (parcelas das reservas
   + avulsos), visão geral; compra da peça vira conta paga ("Aquisição de acervo") no `create_garment`
   (como a fonte em memória). Rotas `/financeiro`, `/financeiro/receber|pagar|categorias`.
5. **Operação** — inspeção, higienização, manutenção (ordens, fornecedores, custos → contas a pagar), ajuste,
   liberação, checklist; completar higienização/manutenção na economia da peça. Rota `/operacao`.
6. **Dashboard e Inteligência** — leituras agregadas (`source-painel.ts`). Rotas `/` e `/inteligencia`.
7. **Fechamento** — pendências de `03v-pendencias.md` que dependem do banco, README, revisão final.

## Notas da execução

- Área 1 (Clientes) em fbec2f5: CPF mascarado sem cliente.edit; `stats.spent` null sem financeiro.view (CustomerStats.spent = number | null); `customer_stats()` é placeholder que a área 3 substitui com create or replace.
- Merge de etapa-2b-acervo (be2035c, outra sessão) com regras novas da fonte em memória — reproduzir na área 3:
  
  1. returnDeposit(id, method, retain?: {amount, reason}) (DepositRetention em types-reservas.ts):
     - só reserva encerrada; caução retida > 0 senão VALOR_INVALIDO
     - retain.amount < 0/NaN → VALOR_INVALIDO (field retainAmount); > caução retida → VALOR_EXCEDE_SALDO (hint brl(caução))
     - amount > 0 sem motivo → MOTIVO_OBRIGATORIO (field retainReason)
     - devolvido = caução − retido; se > 0: payment estorno refersTo 'caucao', method escolhido, notes 'Devolução da caução'
     - retido > 0: payment estorno refersTo 'caucao', method 'outro', notes `Retida pela loja: <motivo>` + recebível AVULSO pago:
       description `Retenção de caução · <code>`, categoria sistema 'locacao', reservationId/Code/customerId/Name,
       amount = paidAmount = retido, status 'pago', receivedAt agora, method = method do pagamento de caução original,
       isCustody false, notes = motivo.
  2. pickupItems retirada antecipada: para cada peça entregue, se bloco 'locacao' da reserva começa depois de hoje e há
     outro bloco da peça com from < loc.from e to >= hoje → CONFLITO_AGENDA (field items), nada muda; senão bloco locacao.from = hoje.
     Quando todas saem, compromisso 'retirada' → concluido com startsAt = pickedUpAt.
  3. returnItems devolução completa: compromisso 'devolucao' → concluido com startsAt = agora.
  4. Busca ⌘K (src/features/search) usa useReservations('todas', limit 1000) → no banco, listReservations com filtro por texto seria bom.
- Área 2 (Agenda e Provas), migration `20261027000300_agenda.sql`. Decisões que afetam as próximas áreas:
  1. Tabelas `appointment`, `fitting_session`, `fitting_item`. `appointment.reservation_id` e `fitting_session.reservation_id`
     estão **sem FK**: a área 3 cria `reservation` e acrescenta as FKs (`alter table ... add constraint`).
  2. Instantes do app saem de `public.store_instant()` (`aaaa-mm-ddTHH:MM:SS-03:00`, fuso da loja), como `at()` da fonte em
     memória — a agenda agrupa pelos 10 primeiros caracteres. Data + hora local → `public.store_at(date, time)`. Usar os
     dois nas próximas áreas para instantes que a tela fatia (ex.: `pickedUpAt`, `startsAt`).
  3. Pontos de extensão para a área 3 (substituir com `create or replace`, mesma assinatura):
     `appointment_reservation_json(reserva, tipo)` → `{reservation:{id,code}, garments:[{id,code,name}], pendingPickupItems | itemsOut}`
     (hoje `{}`); `fitting_reservation_json(reserva)` → `{id, code, customerName, eventDate}` (hoje null);
     `reservation_has_garment(reserva, peça)` (hoje false; alimenta `fittingStatsOf.converted`).
  4. Funções internas prontas e testadas para a área 3 chamar: `appointment_insert(kind, starts_at, title, notes, customer,
     reservation, fitting, garment, assigned_to, state default 'agendado')` (compromissos da confirmação: retirada 10:00,
     evento 19:00 se há data — título = tipo do evento ou "Evento", devolução 11:00; `garment_id` só com uma peça) e
     `fitting_convert(prova, reserva, cliente)` (NAO_ENCONTRADO / PROVA_ENCERRADA / PARAMETRO_INVALIDO campo customerId;
     marca `convertida`, liga a reserva, `ended_at`, conclui o compromisso `prova`). Quem chama decide não converter quando
     a mesma prova já está ligada ao rascunho (`current.fittingId === input.fittingId`, ver `reservas-draft.ts`).
     Retirada/devolução concluídas: `update appointment set state='concluido', starts_at=...` (Notas do merge, itens 2 e 3).
  5. `listUsers` = RPC `list_staff()` (usuários ativos, por nome; exige `agenda.view` ou `prova.view`; inclui e-mail porque
     `AppUser` tem e-mail).
  6. `create_fitting` com `newCustomer` chama `create_customer` na mesma transação (exige `cliente.create`; se a prova falhar,
     a cliente não fica). Horário vazio = 15:00; horário inválido → HORARIO_OBRIGATORIO (a fonte em memória passou a validar
     igual: `appointmentIssues`/`fittingIssues` em `src/data/validation.ts`, usadas pela fonte em memória e pelo adaptador).
  7. `updateAppointment` no adaptador valida o formulário antes da RPC; o banco checa ESTADO_INVALIDO antes da validação
     (como a fonte em memória). A tela só abre edição de compromisso manual, então a ordem não aparece na prática.
  8. Rotas reais `/agenda`, `/provas`, `/provas/:id` (RequirePerm prova.view). O botão "Gerar reserva" da prova leva a
     `/reservas?nova=1&prova=…`, que no app real segue "Em breve" até a área 3. `src/app/liveScreens.test.tsx` garante que
     as telas ligadas só chamam métodos que a fonte do Supabase tem — estender a lista de telas a cada área.
- Área 3 (Reservas), migrations `20261027000400_reservas.sql` (tabelas, base do financeiro, funções internas) e
  `20261027000450_reservas_rpcs.sql` (RPCs e pontos de extensão). Decisões que afetam as próximas áreas:
  1. Tabelas: `reservation`, `reservation_item`, `reservation_payment` (ordem por `seq`), `reservation_contract` (todas as
     versões; a vigente é a de maior `version`; versão assinada não muda — trigger `reservation_contract_frozen`),
     `reservation_history`, `app_settings` (uma linha, seed = `DEFAULT_SETTINGS`). `exception_authorization` ganhou
     `reservation_id`, `amount`, `consumed_at`. FKs `reservation_id` acrescentadas em `appointment`, `fitting_session` e
     `garment_calendar_block` (os testes da agenda criam reservas mínimas por isso).
  2. **Base do financeiro (área 4 acrescenta RPCs e telas):** `fin_category` (16 categorias do fixture; `system_key` único,
     `is_system` gerado, `archived`, `sort_order`) e `receivable` = só recebíveis **avulsos** (as parcelas de reserva derivam de
     `reservation_payment`, como `src/domain/finance.ts`; `isCustody` é sempre false no avulso). Já gravado aqui: retenção de
     caução (`Retenção de caução · RS-…`, categoria `locacao`, pago). Falta na área 4: regra de nome duplicado
     (`CATEGORIA_DUPLICADA`), contas a pagar (a compra da peça → `aquisicao` no `create_garment`), visão geral. "A receber" das
     reservas = Σ parcelas `pendente` (≠ caução) de reservas fora de rascunho/cancelada/no-show (`reservation_summary`); por
     construção = Σ `reservation_open_due(id)`.
  3. **Finalização é da área 5:** `em_inspecao → finalizada` com `public.reservation_transition(id, 'finalizada', motivo)`
     (itens inspecionados → `inspecionado`). O trigger `reservation_state_blocks` libera (released_at) a locação da reserva
     finalizada, que vira histórico (a higienização fica). Helpers prontos: `garment_rederive(peça, motivo)` (estado derivado,
     registra se muda), `garment_log_state` (sempre registra), `reservation_release_blocks`, `reservation_money(id)`
     (saldo + parcelas-alvo), `reservation_sync_pending`. `maintenancesOf` segue stub vazio no `createSupabaseSource`.
  4. **Economia da peça:** `garment_costs(ids)` foi recriada (drop + create) com `rentals`, `revenue`, `last_rental`; o adaptador
     monta `GarmentEconomics` em `economicsOf` (`src/data/supabase/acervo.ts`) com higienização/manutenção = 0 — a área 5 soma
     as contas `operacao` da peça (mesma técnica: drop + create, ou colunas novas). `customer_stats` agora é real (`search_customers`
     já ordena por gasto/locações através dela).
  5. **Exceções:** valem uma vez, do tipo pedido, **só para quem as pediu** (`requested_by` = usuário da sessão — regra a mais que a
     fonte em memória), para a reserva (`ref_type 'reserva'`, `ref_id`) ou para rascunho (`reserva_rascunho`; o id provisório
     `tmp-…` da tela vai como `ref_id` null). O autorizador real é `sourceAuthorizer(fonte do Supabase)` montado em `SupabaseDataLayout`.
  6. **Agenda da peça no banco:** blocos ativos não se sobrepõem, então (a) devolução atrasada estica a locação só até o dia
     anterior ao próximo bloco de outra reserva (a fonte em memória deixaria sobrepor) e a higienização só entra se couber;
     (b) retirada antecipada libera a preparação (`inspecao`, se `default_prep_days > 0`) da própria reserva.
  7. **Permissões:** leituras `reserva.view` (inclusive `get_settings` — o Painel da área 6 pode precisar de leitura própria para
     `idleAlertDays`); rascunho `reserva.create` (+ `reserva.discount` para desconto novo > 0); contrato e confirmação
     `reserva.confirm`; pronta/retirada `reserva.pickup`; devolução `reserva.return`; cancelamento/no-show `reserva.cancel`;
     pagamentos e caução `financeiro.payment`. Os valores da reserva saem para quem tem `reserva.view` (a tela esconde sem
     `financeiro.view`; os tipos são `number`). CPF do contrato sai `***.XXX.XXX-**` sem `cliente.edit` (a OS usa a cliente já oculta).
  8. Validações compartilhadas novas em `src/data/validation.ts`: `reservationIssues` (datas de calendário real, como a RPC),
     `reservationDiscountHint`, `contractSignIssues` — usadas pela fonte em memória e pelo adaptador. O adaptador valida a
     assinatura antes da RPC, então problemas de formulário aparecem antes de `ESTADO_INVALIDO` (ordem não visível na tela).
  9. `ReservationFilter` não tem texto: a busca ⌘K continua filtrando no cliente sobre `listReservations('todas')`; o limite da
     RPC vai até 1000 (o da busca global).
  10. Rotas reais `/reservas`, `/reservas/:id`, `/reservas/:id/contrato`, `/reservas/:id/os` (RequirePerm `reserva.view`);
      "Gerar reserva" da prova (`/reservas?nova=1&prova=…`) agora funciona no app real.
- Área 4 (Financeiro), migration `20261027000500_financeiro.sql`. Decisões que afetam as próximas áreas:
  1. Tabela nova `payable` (contas a pagar; `source` manual | operacao | aquisicao; `recurrence_parent_id` = raiz da família,
     **sem FK** de propósito — excluir a raiz manual não apaga nem desliga as ocorrências, como a fonte em memória).
     `payable.maintenance_id` está **sem FK**: a área 5 cria a tabela de ordens e acrescenta a FK (`alter table ... add constraint`).
     Recebíveis continuam como na área 3: parcelas de reserva derivadas (`fin_receivable_rows()`, id = id do pagamento) + avulsos.
  2. **Para a área 5:** `public.payable_insert_auto(source, chave_categoria, descrição, fornecedor, valor, peça, ordem default null,
     reserva default null, forma default null, pago_em default now())` lança a despesa automática já paga (somente leitura;
     valor ≤ 0 não lança e devolve null; categoria pela `system_key`, só despesa). Fechar ordem com custo = chamar com
     `'operacao'`, `'higienizacao' | 'ajuste' | 'manutencao'` (regra de `closeOrder` em `src/data/mock/operacao.ts`), fornecedor
     `coalesce(provider, 'Sem fornecedor')`, descrição `coalesce(description, rótulo do tipo)`, forma `'pix'`. O "custo dos últimos
     30 dias" da fila = Σ `coalesce(paid_amount, amount)` de `payable` `source = 'operacao'`, não cancelada, `due_date >= hoje − 30`.
     Higienização/manutenção da economia da peça = Σ dessas contas por `garment_id` (categorias `higienizacao` / `ajuste`+`manutencao`).
  3. Compra da peça: `create_garment` (create or replace) lança "Compra da peça — <nome>", fornecedor "Aquisição de acervo",
     categoria `aquisicao`, paga agora, forma null (como a fonte em memória). Sem `acervo.cost` o custo é ignorado e nada é lançado.
     Mudar o custo depois (`update_garment`) não mexe na conta (igual à prévia).
  4. **Permissões:** `finance_overview` exige `financeiro.view`; sem `financeiro.consolidated` saem null `paid`, `operatingCost`,
     `operatingMargin`, `acquisitionInvested`, `result`, `operatingResult` e `monthly[].paid` (pendência do 03v resolvida para o
     Financeiro; o Painel da área 6 deve seguir a mesma regra). Contas a receber, categorias e todas as escritas: `financeiro.geral`.
     `list_payables`: `financeiro.geral` **ou** `financeiro.consolidated` (a visão geral conta as contas pagas do período com o
     consolidado). O atendimento recebe SEM_PERMISSAO em tudo isso e segue lançando pagamentos pela reserva (`financeiro.payment`).
  5. Leituras para a área 6 reaproveitar (internas): `fin_receipts()` (entradas de receita por dia/forma, estornos negativos, caução
     fora), `fin_open_receivables()` (em aberto sem caução, `falta` por linha; Σ das de reserva = Σ `reservation_open_due`),
     `store_day(instante)`, `payment_method_label(forma)`.
  6. Validações compartilhadas novas em `src/data/validation.ts`: `finEntryIssues` (com `categoryOk` — a fonte em memória confere
     tipo/arquivada; o adaptador só a presença e o banco o resto), `settleDateIssue`, `settleAmountIssues`, `recurrenceEndIssues`.
     Por isso o adaptador pode devolver "descrição + data" de uma vez, mas categoria do tipo errado/arquivada e VALOR_EXCEDE_SALDO só
     vêm do banco (um problema por vez). Na edição de categoria o adaptador checa nome vazio antes de CATEGORIA_SISTEMA (a tela não
     edita categoria de sistema).
  7. Ordem de desempate (a fonte em memória usa a ordem do array): contas a receber → parcelas (reserva mais antiga, ordem do
     lançamento) antes dos avulsos (criação); contas a pagar → criação. Formas de pagamento empatadas: ordem do enum. Categorias
     novas vão para o fim (`sort_order` = máx + 1), cor padrão = paleta pela quantidade de categorias.
  8. Rotas reais `/financeiro` (NAV, `financeiro.view`), `/financeiro/receber|pagar|categorias` (RequirePerm `financeiro.geral`).
     As leituras recalculam tudo a cada chamada (sem cache/materialização): ok para o volume de uma loja; se crescer, materializar
     `fin_receipts` por dia.
- Área 5 (Operação), migration `20261027000600_operacao.sql`. Decisões que afetam as próximas áreas:
  1. Tabelas `checklist_item` (seed = as 10 do fixture), `inspection` (achados em jsonb normalizados `{label, ok:false, severity, note}`),
     `inspection_photo` (tipo + `storage_path` opcional no bucket `pecas-fotos`, prefixo `<garment_id>/`; a tela ainda só manda o tipo,
     então o path fica nulo e a URL sai vazia) e `maintenance` (ordens). FKs `payable.maintenance_id` e
     `garment_calendar_block.maintenance_id` → `maintenance` acrescentadas aqui.
  2. RPCs: `operacao_queue`, `operacao_checklist`, `inspection_target`, `register_inspection`, `close_maintenance`, `release_garment`,
     `maintenances_of`, `operacao_suppliers`; `garment_costs` recriada (drop + create) com `cleaning`/`maintenance` (Σ contas `operacao`
     não canceladas da peça por `system_key`). Internas para a área 6: `maintenance_json`, `inspection_json`, `operacao_queue_row`,
     `garment_free_state(peça)` (estado derivado a partir de `disponivel`, sem a trava dos operacionais), `operacao_release`,
     `operacao_close_order`, `operacao_block`, `maintenance_kind_label`.
  3. **Permissões:** fila e histórico da peça `operacao.view`; checklist, reserva da devolução e fornecedores qualquer `operacao.*`;
     inspeção `operacao.inspect`; concluir ordem `operacao.maintenance` (+ `operacao.release` se `release: true` — o modal só mostra
     a opção para quem a tem); liberar `operacao.release` (+ `acervo.block` se a peça está `bloqueado`, porque tira o bloqueio manual).
     **Custos:** quem conclui lança o custo (vira conta paga via `payable_insert_auto`, forma pix), mas só quem tem `acervo.cost` lê:
     `Maintenance.cost` passou a `number | null` (null sem a permissão) e `costLast30d` sai null. A área 6 (alertas de ordens
     paradas, Inteligência) deve seguir a mesma regra.
  4. **Agenda sem sobreposição:** o bloco da ordem começa hoje e termina no dia anterior ao próximo bloco ativo da peça; se hoje já está
     ocupado, a ordem nasce sem bloco (o prazo `dueAt` fica cheio). A inspeção libera a higienização planejada da reserva e a locação
     dela que ainda cobre hoje (devolução de hoje), que vira histórico como na finalização. Blocos da Operação ficam com
     `reservation_id` nulo (como a fonte em memória), o que a liberação usa para tirá-los e manter os planejados de reservas vivas.
  5. Finalização: o último item inspecionado chama `reservation_transition(id, 'finalizada', 'Todas as peças inspecionadas')` (itens
     `cancelado`/`nao_entregue` não contam). `reservationId` inexistente → PARAMETRO_INVALIDO `reservationId` (a fonte em memória
     ignoraria); entrada malformada → PARAMETRO_INVALIDO com o campo (`findings`, `photos`, `maintenanceKind`, `perda`, `openRepair`).
  6. **Pendência mantida (03v):** peça que nunca saiu e teve a reserva cancelada dentro da própria janela de higienização fica
     `higienizacao` (sem ordem) até ser liberada na Operação — coberto em `tests/db/operacao.test.ts`. Resolver na área 7 se for o caso.
  7. Desempates: ordens por `opened_at` (clock_timestamp, então ordens da mesma inspeção ficam na ordem de criação), fornecedores
     usados na ordem em que apareceram. Rota real `/operacao` (NAV, `operacao.view`); a aba Manutenções da ficha agora lê do banco.
- Área 6 (Dashboard e Inteligência), migration `20261027000700_painel.sql`. Sem tabelas: tudo derivado ao vivo. Decisões:
  1. RPCs `dashboard_summary(p_range)` (`dashboard.view`; range '7' | '30' do dia 1 | '90', senão PARAMETRO_INVALIDO `range`) e
     `intel_report(p_days, p_category)` (`inteligencia.view`; 90 | 180 | 365, senão PARAMETRO_INVALIDO `days`; slug inexistente = escopo
     vazio, como a fonte em memória). Internas: `painel_alerts(hoje)` (os 12 tipos de `computeAlerts`), `intel_pressure`, tipos
     compostos `intel_garment`/`intel_line` (bases calculadas uma vez por chamada) e formatadores pt-BR (`brl0`, `pct_pt`, `num1_pt`,
     `plural_pt`, `dm_pt`, `relative_day_pt`, `month_abbr`, `next_birthday`, `garment_state_lower`) para os textos dos alertas e insights.
  2. **Permissões no banco:** `finance` null sem `financeiro.consolidated` (fecha a pendência do 03v); alertas filtrados como
     `visibleAlerts` (pagamento pendente exige `financeiro.view`; os demais, a permissão da rota de destino); `fittingsSoon` sai sempre
     (como a prévia). Inteligência sem `acervo.cost`: `idleCapital[].cost` null, `paidBack` vazio e os insights `pecas-paradas`/`payback`
     não saem (o resto é igual). `idleAlertDays` vem direto de `app_settings` dentro da RPC (sem depender de `get_settings`/`reserva.view`).
  3. "Hoje" = `store_today()`: o Dashboard já usava `summary.today` e a Inteligência `period`; a pendência do relógio fica resolvida para
     essas duas telas. `agendaToday`/`agendaMonthDays` são as mesmas leituras de `agenda_range`/`agenda_month_days` (sem exigir `agenda.view`,
     como a prévia).
  4. **Desempates** (a fonte em memória usa a ordem dos arrays): reservas por `created_at, code`; peças e clientes por código; ordens por
     `opened_at, id`; provas por `scheduled_at, code`; nomes/rótulos (localeCompare pt-BR) por `norm(texto)`, texto. Alertas: severidade e,
     dentro dela, a ordem de geração da fonte em memória com esses desempates.
  5. **Paridade testada:** `tests/db/painel.test.ts` carrega o mundo da fonte em memória (`buildWorld` com o hoje do banco) no PGlite
     (`tests/db/painelWorld.ts`, inserção direta sem triggers; blocos sobrepostos — que a prévia permite — são cortados no dia anterior ao
     seguinte, como a Operação faz no banco) e exige igualdade exata com `dashboardSummary` (3 períodos) e `intelReport` (6 combinações de
     período/categoria), inclusive textos e ordem dos insights. Arredondamento: `pct` em float8 (`floor(x·100 + 0,5)` = `Math.round`), dinheiro
     em numeric.
  6. `createSupabaseSource` agora é um objeto completo tipado como `DataSource` (sem Proxy); o código `NAO_DISPONIVEL` saiu de
     `SourceErrorCode`/`errorMessages`. Rotas reais `/` (Dashboard) e `/inteligencia` (RequirePerm `inteligencia.view` pelo NAV): nenhum item
     do menu cai mais em "Em construção" (`ComingSoon` segue só na prévia); `shell.test.tsx` passou a usar a fonte em memória e checa que todo
     item do menu tem tela real.
  7. Desempenho: cada chamada recalcula tudo (como o Financeiro). Ok para o volume de uma loja; se crescer, materializar as bases.

- Área 7 (Fechamento). Sem migration nova (nada no SQL precisou mudar). Decisões:
  1. **Rotas sob demanda:** as telas do app real vêm de `src/app/screens.ts` (`React.lazy`, um pedaço por tela; `SupabaseDataLayout`
     dá o `<Suspense>` com "Carregando…" sem esconder o menu). A prévia inteira entra por `/preview/*` com `lazy` do react-router
     (`src/preview/PreviewApp.tsx` monta `previewRoutes` como rotas descendentes): fonte em memória + fixture só no pedaço `PreviewApp`.
     `previewRoutes.tsx` continua com imports diretos (os testes das telas o usam). `shell.test.tsx` checa que `router.tsx` não importa
     prévia nem telas de forma estática e que `/preview` abre pelas rotas do app. Nenhum pedaço passa de 500 kB (maiores: `index` ≈ 359 kB
     — React, roteador, login, menu — e o compartilhado ≈ 283 kB com supabase-js/TanStack/UI; antes era um só de 1.118 kB).
  2. **PWA:** o plugin `senzi-pwa` passou a gerar o service worker em `generateBundle` com `order: 'post'`: com rotas sob demanda o Vite
     cria pedaços que eram só CSS e os remove do bundle depois; a lista antiga incluía 4 arquivos inexistentes, o que faria o
     `cache.addAll` (instalação do service worker) falhar. Conferido: todos os arquivos da lista existem em `dist/`.
  3. **"Hoje":** `useToday()` (`src/lib/useToday.ts`) = `todayISO()` (fuso America/Araguaina, o mesmo de `store_today()`) via
     `useSyncExternalStore`, que troca à meia-noite da loja e ao voltar a aba visível. Usado nas telas que calculam com "hoje" no render
     (Agenda, Operação, ficha da reserva, ficha da peça e calendário, bloqueio, WhatsApp, fallback do Dashboard). Valores iniciais de
     formulário, validações no envio e modais curtos seguem com `todayISO()` (mesmo fuso). Não vem do banco: o relógio do aparelho no
     fuso da loja basta, e o banco revalida as datas com `store_today()`.
  4. **Retry:** `shouldRetryQuery` em `src/lib/queryClient.ts` — até 2 novas tentativas só para falha de rede (erro sem código ou com
     código vazio do supabase-js); `SourceError` (inclusive `SEM_PERMISSAO`, que entrou em `SourceErrorCode`) e erros com código do
     PostgREST/Postgres não repetem. `fromDbError` passou a preservar o `code` do PostgREST (o supabase-js devolve objeto simples).
  5. Pequenas: `npm:@supabase/supabase-js@2.118.0` fixado na Edge Function `admin-users` (mesma versão do app). README "Conectar ao
     Supabase" reescrito (migrations, bucket, seeds, painel: cadastro público, URLs, SMTP, Data API; primeiro admin; banco começa vazio).
     Pendências marcadas nos arquivos `01-fundacao`, `02a` e `03v`.
  6. **PDFs no Storage: não implementado, de propósito.** Hoje contrato e OS são páginas de impressão ("Imprimir / salvar PDF"). Gerar e
     guardar o PDF depende do template definitivo do contrato e dos dados da empresa (decisão do João); o banco já tem o necessário
     (bucket privado + URLs assinadas, como as fotos).
  7. **Seed de dados reais: não faz sentido agora.** O banco real já nasce com o que é configuração (categorias de peça e do financeiro,
     configurações gerais, checklist). Dados de verdade (acervo, clientes) entram pelas telas; se a loja tiver planilhas, o certo é um
     importador dedicado (CSV → RPCs `create_garment`/`create_customer`, que já validam e auditam), não um seed. Dados de exemplo ficam só na prévia.

- Auditoria de segurança, migration `20261027000900_seguranca.sql` (testes em `tests/db/seguranca.test.ts`, um por achado). Decisões:
  1. **Preço da peça (alto):** a tela nunca deixou editar o preço unitário (`ReservationForm` manda o preço congelado do item ou o
     `rentalPrice`), então o banco **ignora** `unitPrice`: `reservation_input_priced(p, reserva)` troca cada preço pelo congelado do item
     que a peça já tem no rascunho ou por `garment.rental_price` (item novo) antes de validar, e `create_reservation_draft` /
     `update_reservation_draft` foram recriadas (mesma assinatura) chamando-a. Item malformado (preço negativo/ausente) ou peça inexistente
     fica como veio e continua recusado com os mesmos erros. A fonte em memória faz igual (`priced()` em `reservas-draft.ts`), então a prévia
     e o banco se comportam igual. `unitPrice` segue no `ReservationInput` (contrato da interface; o valor só não manda mais).
  2. **Exceção com valor (médio):** `exception_authorization.max_amount`; `authorize_exception` ganhou `p_max_amount numeric default null`
     (drop + create; chamadas antigas com 6 argumentos seguem valendo). Obrigatório e > 0 no `desconto_acima_limite`
     (senão PARAMETRO_INVALIDO `maxAmount`), opcional nos outros tipos; negativo → PARAMETRO_INVALIDO. As telas mandam o valor que pedem:
     desconto do formulário, sinal dispensado (`mínimo − sinal`) e saldo em aberto da retirada (`AuthorizeExceptionDialog` prop `maxAmount`
     → `AuthorizeArgs.maxAmount` → `p_max_amount`). No banco, `reservation_exception_consume` recusa valor acima do autorizado com o mesmo
     erro de quando não há exceção (DESCONTO_ACIMA_LIMITE `discount`; SINAL_INSUFICIENTE `amount` com o mínimo; SALDO_EM_ABERTO com o
     saldo) e desfaz tudo; `reservation_exception_usable` não aceita desconto sem valor (exceções antigas). Na fonte em memória a checagem
     fica em `usableException(…, { amount })`. `ExceptionAuthorization.maxAmount` (opcional) só existe na fonte em memória; o JSON da
     reserva do banco não o devolve (nenhuma tela mostra).
  3. **PIN (médio):** além de 5 erros/15 min, **10 erros dentro de 24 h desde o último acerto bloqueiam sem prazo** (PIN_BLOQUEADO até a
     admin trocar o PIN). `set_my_pin` registra um acerto em `pin_attempt` ao gravar o PIN novo — é isso que zera as duas contagens
     (por isso `pin_attempt` passa a ter uma linha `ok` por troca de PIN). Mantidos 4–6 dígitos. Mensagem: "PIN bloqueado por muitas
     tentativas. Tente de novo em 15 minutos; se continuar bloqueado, a administradora precisa redefinir o PIN." Fonte em memória igual
     (sem troca de PIN na prévia).
  4. **Storage (baixo):** policies `pecas_fotos_insert` (só `<id de peça existente>/<arquivo>`, um nível) e `pecas_fotos_delete` (só arquivo
     que não está em `garment_photo` nem `inspection_photo`) recriadas com helpers `security definer` `pecas_fotos_folder_ok(pasta)` e
     `pecas_fotos_unregistered(nome)`. **Precisam ser executáveis por `authenticated`** (as policies rodam com o papel de quem chama), por
     isso entraram na lista do `revisao.test.ts`; ambas exigem `acervo.edit`, então não servem para sondar ids. A ordem do adaptador já era a
     certa: `remove_garment_photo` apaga o registro e devolve o caminho, depois o arquivo é removido; no envio recusado, o arquivo ainda não
     está registrado e pode ser apagado. `add_garment_photo` não aceita nome que comece com `.`. Shim do PGlite ganhou `storage.foldername`.
  5. **Clientes (baixo):** `customer_validate` checa CPF repetido por último (depois de modelo ideal, origem, VIP e preferências): só uma
     entrada inteiramente válida descobre que o CPF existe — e, no `create_customer`, se não existir a cliente é criada (fica rastro).
     `audit_trigger` grava o CPF mascarado (`***XXXXXX**`, helper `audit_mask_cpf`); as linhas de `customer` já gravadas foram mascaradas
     na própria migration.

## Para o João decidir

1. **Contrato e OS:** dados da empresa (razão social, CNPJ, endereço) e template definitivo do contrato. Depois disso: gerar o PDF,
   guardar no Storage com link assinado e anexar ao WhatsApp.
2. **Peça cancelada na janela de higienização:** peça que nunca saiu da loja e teve a reserva cancelada dentro da própria higienização fica
   "Higienização" até alguém liberar na Operação (igual na prévia e no banco). Manter, ou liberar sozinha no cancelamento?
3. **PIN de exceção:** passar para 6 dígitos e registrar na auditoria quando um PIN for bloqueado por tentativas? (hoje 4–6 dígitos, bloqueio
   de 15 min após 5 erros e bloqueio até trocar o PIN após 10 erros em 24 h.)
4. **Exceções por PIN** valem só para quem as pediu (regra do banco a mais que a prévia). Confirmar.
5. **"Orçamento" na ficha da cliente** é estimado pelo ticket das locações. Manter a heurística ou virar campo preenchido pela loja?
6. **Antes de publicar:** domínio de produção (para `ALLOWED_ORIGIN` no CORS da Edge Function `admin-users`, Site URL e Redirect URLs),
   SMTP próprio e um teste de "Esqueci minha senha" com e-mail real (a tela de nova senha precisa dessa conferência).
7. **Refatorações sem pressa** (sem efeito visível; fazer quando mexer nas telas): dividir `CustomerPage.tsx`/`GarmentPage.tsx`, levar
   componentes compartilhados (CustomerPicker, GarmentThumb, gráficos) para `src/ui`, `rgba()` → tokens, tipos `*Summary` e
   `getGarments(ids)` em lote.
8. **Configurações na prévia:** hoje não entra (depende do banco). Vale uma versão de demonstração?
9. **Achados da auditoria de segurança que dependem de decisão (registrados, não alterados):**
   - O **valor de referência da peça** (`retail_reference`, protegido por `acervo.cost` na ficha) aparece no texto do contrato ("Valor de
     referência do acervo cedido") e em `depositSuggested` para quem tem `reserva.view`. Está no contrato que a cliente assina: é segredo
     da equipe ou não? Se for, tirar do contrato e calcular a caução sugerida só para quem tem `acervo.cost`.
   - O **gasto da cliente** (null sem `financeiro.view`) pode ser recomposto somando os totais das reservas dela, que saem com `reserva.view`
     (decisão já registrada na área 3, item 7). Manter?
   - `get_fitting` / `get_reservation` devolvem a cliente completa sem exigir `cliente.view`, e `reservation_alternatives` devolve peças sem
     `acervo.view`. Os perfis padrão (admin e atendimento) têm essas permissões, então só um override que tire `cliente.view`/`acervo.view`
     de quem vê provas/reservas expõe algo. Exigir também essas permissões (e esconder os blocos) ou deixar como está?
