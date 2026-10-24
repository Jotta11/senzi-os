# Plano 2A — Visual de Acervo e Clientes: decisões e pendências

Registro do ledger (2026-10-24). Leitura obrigatória ao escrever o Plano 2B (banco) e os planos seguintes.

## Decisões tomadas durante a execução
- Ruling: Atendimento HAS acervo.block — spec 3.8 says Atendimento = prototype atendimento ∪ operacao (operacao has acervo.block); plan 2A global constraint was wrong; SQL/spec wins — cost if wrong: one permission toggle.
- Ruling: recommendations drop avoided-color garments entirely (stronger than -5) — matches what João was told ("evitando as cores que ela não gosta") — cost if wrong: weight tweak.
- Ruling: Acervo header counts ACTIVE pieces (excludes baixado: "27 peças") and investidos likewise — deliberate deviation from prototype (which counted baixado); written-off pieces shouldn't inflate the collection; matches nav count — cost if wrong: one-line change. Fix round 1 only adds a documenting comment + restricts ?st to chip groups.
- Ruling: fix round 1 folds minors: photo label focus-within ring; spy test that atendimento edit never sends cost keys; busy count via boolean — cheap, same files.
- Ruling: T4 fix round 1 folds minors 2 (hide "Maior gasto" sort without financeiro.view) and 3b (strip leading 55 on 12–13 digit phone paste) — permission leak + data correctness, cheap.
- Ruling: rental price on suggestion/favorite cards is visible without financeiro.view — it's the garment's public price, not customer money — cost if wrong: hide prices for some users.
- Ruling: Important #2–#5 (Summary types, nullable withheld fields, error vs not-found + SourceError retry predicate, SEM_PERMISSAO code) become the FIRST task of Plan 2B — interface change best done with the DB adapter — cost if wrong: small refactor of screens then.
- Ruling: other later items carried to Plan 2B pendências: getGarments batch, fitNotes in RPC, cleaning 0–15 CHECK, signed URL expiry, DataSourceProvider + RequirePerm in real app, permissions isLoading window, consolidate shared CSS/helpers, lazy routes + exclude preview from prod bundle, single useToday, code-vs-digits search, Orçamento heuristic (ask João), caret on masked inputs, BlockModal past dates/baixado.

## Pendências adiadas
- Task 1: minor (deferred→T3): Modal focus lost when clicking non-focusable content (panel tabIndex=-1 / document keydown); no scroll lock
- Task 1: minor (deferred→T2): searchGarments lacks per-state-group counts — add optional counts before screens depend on it
- Task 1: minor (deferred): getGarments(ids) batch for favorites (DB version)
- Task 1: minor (deferred→T4): Date.parse accepts 2026-02-31 — round-trip check in validation
- Task 1: minor (deferred): mockSource history/createdAt use new Date() not injected today
- Task 1: minor (deferred): no validation on fit/measurement numbers (negative/NaN)
- Task 1: minor (deferred): inert QueryClient workaround in usePermissions
- Task 1: minor (deferred): "Ver como" resets on reload; dashboard shortcuts leave preview
- Task 2: minor (deferred→2B): mock returns acquisitionCost to all roles (UI-gated only); 2B search_garments must not return cost
- Task 2: minor (deferred): card link accessible name verbose
- Task 2: minor (deferred): payback for 0 rentals shows "0,0×" — consider "—"
- Task 3: minor (deferred): calendar grids aria-hidden; expose "N de 45 dias livres" to AT
- Task 3: minor (deferred): GarmentPage shows not-found on query error
- Task 3: minor (deferred): object URLs not revoked when source discarded (preview only)
- Task 3: minor (deferred): no toasts after save/block; FitInput carries fitNotes (2B RPC must accept); cleaning days 0–15 must be mirrored in DB
- Task 4: minor (deferred): masked inputs move caret to end on mid-edit
- Task 4: minor (deferred): pending tag text lost on implicit Enter submit
- Task 4: minor (deferred): phoneDigits strips 55 when DDD-55 (RS) number overflows to 12 digits — cap first if starts with valid DDD
- Task 5: minor (deferred→T6): age test time-dependent (fails from 2027-03-21) — inject today / setSystemTime
- Task 5: minor (deferred→T6): Recommendations skeleton forever on error
- Task 5: minor (deferred): TabLabel aria-label on span; not-found on query error; Orçamento derived from ticket
- Task 6: minor (deferred): retry button no pending state; role=alert wraps button; prod QueryClient retry setting may delay error; 0.5px inset dividers; medidas fix not recaptured at 820/admin

## Primeira tarefa obrigatória do Plano 2B
- Tipos GarmentSummary/CustomerSummary para busca e recomendação; campos ocultáveis como null (retailReference, stats.spent, ticket); SEM_PERMISSAO em SourceErrorCode; distinguir erro de 'não encontrado' + predicado de retry que não repete SourceError; getGarments(ids) em lote.
- Montar telas no app real: DataSourceProvider no AppShell, RequirePerm por rota, janela de carregamento de permissões; rotas lazy e prévia fora do bundle de produção.
