# Plano 1 — Fundação: decisões e pendências

Registro do ledger de execução (2026-10-23). Leitura obrigatória ao escrever os Planos 2–7.

## Decisões tomadas durante a execução
- - Ruling: T1 step 1 (git init/.gitignore/first commit) executed by controller in setup; implementer starts at step 2 — git needed for workspace — cost if wrong: none.
- - Ruling: T2 creates minimal `src/app/router.tsx` (react-router) with public `/preview` and placeholder `/`; T5 wraps non-preview routes in the auth gate; T6 extends router.tsx (Modify, not Create) — keeps /preview reachable without login — cost if wrong: small refactor.
- - Ruling: T2 preview test asserts 7 `agenda-day` columns (Mon first, Sun last) inside a scroller with `data-visible-days="4"` whose CSS sizes columns to 1/4 width, instead of measuring visibility — jsdom limit — cost if wrong: visual check at CHECKPOINT covers it.
- - Ruling: T4 adds RPC `list_active_admins() returns table(id uuid, full_name text, email text)` (security definer, requires authenticated active user) consumed by T7 AuthorizeExceptionDialog — spec requires attendant to request admin PIN; RLS forbids reading admins — cost if wrong: exposes admin names/emails to staff (acceptable, same store).
- Ruling: Task 4 dispatch also fixes Task 3 minors 1–5 in a new migration (20261023000150_acesso_ajustes.sql) — same security domain, cheaper now than in final fix wave — cost if wrong: slightly larger Task 4 diff.
- Ruling: authorize_exception — plan's 'raise on wrong PIN' would roll back pin_attempt insert, making lockout ineffective; implementer free to change return contract (e.g. jsonb) keeping exact error identifiers, must prove lockout across separate transactions — cost if wrong: Task 7 client adapts to stated signature.
- Ruling: PIN_BLOQUEADO reveals an email belongs to an admin — accepted, list_active_admins already exposes admin emails to staff by design — cost if wrong: none material.
- Ruling: Task 5 fix round 1 includes minors (stale guard, single fetch path, catch on getSession/loadUser) with the Important — same function being restructured; fixing separately would rewrite it twice — cost if wrong: slightly larger fix diff.
- Ruling: T6 keeps preview's responsive sidebar (icon rail ≤1024px, top bar ≤560px) instead of plan's 'drawer below 900px' — client already saw it; single Sidebar component shared with PreviewPage — cost if wrong: CSS tweak.
- Ruling: T6 active nav item = solid Beige pill with Cranberry text/icon (what the client saw in the preview screenshots) rather than plan's rgba(.12)+Beige text — both readable; preview is what João is evaluating — cost if wrong: one CSS rule.
- Ruling: T6 fix round 1 folds minors 1 (preview active item), 2 (catch-all route in shell), 4 (brand assertion) — trivial, same files — cost if wrong: none.
- Ruling: T7 Edge Function rolls back auth user if app_user insert fails; 409 on duplicate email; CORS — plan silent, spec requires no orphan users — cost if wrong: none.
- Ruling: accept hookTimeout 30000 for db project — PGlite migrations in beforeEach exceed 10s under parallel load; test-only config — cost if wrong: slower failure detection.
- Ruling: T7 fix round 1 folds minors 3 (has_perm error→500 + server console.error w/o secrets), 4 (log orphan on rollback failure), 6/7 (clear PIN on every path), 8 (stale role/is_active in PermissionsTab save), 9 (password max 72) — cheap security hardening in the same files — cost if wrong: slightly larger fix diff.
- Ruling: final fix wave = I1–I4 + minors M1 (audit noise: diff-based overrides, skip no-op app_user update), M4 (PIN success resets failure count), M5 (advisory lock when config.users overrides change), M6 (drop direct update grant on role/is_active), M7 (perms load error state), T1 .env.local unification + engines node>=22.18 — all foundation/auth, cheaper now — cost if wrong: larger fix diff.
- Ruling: deferred to later plans (carry into their Global Constraints): M2 audit actor names via list_staff()/RPC (Plan 2); M3 consume exception_authorization atomically bound to kind/ref + dialog focus trap (Plan 4); M8 route table + lazy routes (fixes chunk warning) (Plan 2); M9 72-byte bcrypt limit + pin npm version in index.ts (before deploy); M10 consolidate fakeSupabase (Plan 2); T7 CORS ALLOWED_ORIGIN (before deploy); T4 6-digit PIN / lockout audit row (ask João); audit_trigger raise on no-PK tables (Plan 2).

## Pendências adiadas (minors)
- Task 1: minor (deferred): README says .env but .env.example says .env.local — unify on .env.local
- Task 1: minor (deferred): passWithNoTests root-level in vitest.config.ts — remove once db tests exist (Task 3)
- Task 1: minor (deferred): tsconfig baseUrl deprecated; no engines/.nvmrc (jest-dom 7 needs node>=22)
- Task 2: minor (deferred): .field focus style differs from global 2px outline
- Task 2: minor (deferred): .ag-strip focusable div lacks role="region"
- Task 2: minor (deferred): dead controls in preview (Hoje, Novo compromisso, month arrows, #tons, nav 404s)
- Task 2: minor (deferred): calendar role=grid without arrow-key behaviour (plan-mandated)
- Task 2: minor (deferred): smooth scroll may animate on load in agenda strip
- Task 2: minor (deferred): contrast gaps untested — beige-dim on cranberry, nevoa on #F1E2CC (~4.5 borderline), status text on white
- Task 2: minor (deferred): base.css hard-codes #FEEFDC/#F1E2CC; total duplicates FATURAMENTO
- Task 2: minor (deferred): PreviewPage.tsx 486 lines; Field.tsx repeated destructure with eslint-disable
- Task 2: minor (deferred): search aria-label "Buscar" vs visible "Buscar…" (WCAG 2.5.3 nit); aria-label+title redundant
- Task 3: minor (deferred): last-admin trigger FOR UPDATE can deadlock on concurrent changes to two admins — use pg_advisory_xact_lock + count
- Task 3: minor (deferred): last-admin guard not on DELETE (auth.users cascade) — lockout via service_role
- Task 3: minor (deferred): self-revocation of config.users via grant removal ({} overrides) not blocked — recheck has_perm after apply
- Task 3: minor (deferred): unknown override keys raise raw FK error instead of PARAMETRO_INVALIDO
- Task 3: minor (deferred): missing negative tests — anon denied on tables/functions; authenticated cannot update pin_hash or insert overrides directly
- Task 3: minor (deferred): my_permissions order (role−revoked)∪granted — add comment on PK equivalence
- Task 4: minor (deferred): lockout reveals any app_user email (incl. atendimento) — treat ineligible users like nonexistent before lockout check
- Task 4: minor (deferred): lockout DoS by staff / 4-digit PIN slow brute force (~10 days) — consider 6-digit min + audit on lockout (plan-mandated)
- Task 4: minor (deferred): per-column SELECT on app_user hides future columns and breaks app_user(*) embeds — comment + relay to T5/T7
- Task 4: minor (deferred): audit_trigger queries pg_index per row; tables without PK get row_id='' silently
- Task 4: minor (deferred): source-inspection test for advisory lock is brittle
- Task 4: minor (deferred): case-sensitive email match in authorize_exception
- Task 4: minor (deferred): exception_authorization FKs without on delete block deleting auth users with history (intended)
- Task 5: minor (deferred→folded into fix round 1 by ruling): loadUser no staleness guard; double app_user fetch on signIn; getSession/loadUser missing catch
- Task 5: minor (deferred): onForgot not try/catch, `?? {error:null}` success with no client
- Task 5: minor (deferred): unchecked `data as AppUser` cast
- Task 5: minor (deferred): permissions query key lacks user id (safe due to clear())
- Task 5: minor (deferred): authErrors invalidCredentials unused; SetupScreen indentation
- Task 5: minor (deferred): eslint-disable set-state-in-effect at AuthProvider.tsx:152
- Task 5: minor (deferred): reset-password screen missing (redirect lands on /) — needed before go-live
- Task 6: minor (deferred): RestrictedPage "Voltar ao início" should go to first permitted item (latent)
- Task 6: minor (deferred): ≤560px footer hides user name/role
- Task 6: minor (deferred): preview Dashboard link now goes to / (login-gated) instead of staying on /preview
- Task 7: minor (deferred): CORS Allow-Origin * on admin-users (Bearer auth, acceptable) — consider ALLOWED_ORIGIN env
- Task 7: minor (deferred): app_user created via service role → audit actor null ("Sistema") — design follow-up (GUC or RPC)
- Task 7: minor (deferred): dialog lacks focus trap/initial focus/Escape; PinTab no 4-digit client check
- Task 7: minor (deferred): bootstrap --password in shell history (document CI-only); no engines field; deleteUser rollback result unchecked
- Task 7: minor (deferred): aria-controls on inactive tabs point to unrendered panels
- Task 7: minor (deferred): UserForm trusts any body.error string from non-2xx
- Task 7: minor (deferred): build chunk >500kB warning
- Task 7: minor (deferred): USUARIO_NAO_ENCONTRADO has no pt-BR mapping in errorMessages (falls to generic)
- Final: minor (deferred): 72-byte limit message says "caracteres"; possible double recheck in same tick (no loop); recovery page covers loading+loadError; M5 lock test source-only; PASSWORD_RECOVERY may be missed if processed before subscribe — manual check with real reset email

## Antes de ir para produção
- Conectar ao Supabase real (README): link, db push, functions deploy admin-users, bootstrap:admin, login real admin/atendimento.
- Testar recuperação de senha com e-mail real (evento PASSWORD_RECOVERY).
- CORS ALLOWED_ORIGIN na Edge Function; fixar versão do supabase-js em index.ts.
- Decidir com o João: PIN de 6 dígitos e auditoria de bloqueio.
