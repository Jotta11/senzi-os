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
