# Spec de telas — Operação + Financeiro

Fonte: protótipo `SenzieOS_v0.2_3.html` (`UI.VIEWS.operacao` 6441–6546, `UI.ACT.inspect` 6553–6687, `UI.ACT.closeMaint`/`releaseGarment` 4868–4930, `UI.VIEWS.financeiro` 6702–6804, `UI.ACT.addPayment` 6156+, engine `E.registerInspection` 1876, `E.closeMaintenance` 1966, `E.releaseGarment` 1986, `E.balance` 2008, `SZ.metrics.revenueBetween` 4091, seed 2710+) + `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (seções 3.5, 3.6, 3.8 prevalecem).

Convenções: "Senzi" (nunca "Senzie"); moeda `R$ 1.234,56` (`brl`) e `R$ 1.235` sem centavos (`brl0`); datas `dd/mm/aaaa` (`fdy`) ou `dd/mm` (`fd`); código de peça/reserva em fonte mono; pills sempre com rótulo de texto. Itens marcados **(proposta)** não existem no protótipo.

---

# PARTE 1 — OPERAÇÃO

## 1.1 Telas e rotas

| Rota | Tela | Permissão de entrada |
|---|---|---|
| `/operacao` | Fila de operação pós-devolução (única tela) | `operacao.view` |

Modais/ações dentro da tela: Inspeção de devolução, Concluir higienização/manutenção, Confirmação "Liberar peça". Cliques em linhas levam a `/acervo/:garmentId` (ficha da peça). Alertas do dashboard apontam para `/operacao` (`inspecao_pendente`, `manutencao_longa`).

## 1.2 Layout da tela `/operacao`

Ordem vertical:

### Cabeçalho
- Título: **Operação**.
- Subtítulo: `{total} peça(s) no ciclo · {abertas} ordem(ns) em aberto` + (se `can('acervo.cost')`) ` · {brl0(custoMes)} em custos nos últimos 30 dias`.
  - `total` = nº de peças em estado `inspecao + higienizacao + ajuste + manutencao + bloqueado`.
  - `abertas` = nº de ordens (`maintenance`) com estado `aberta` ou `em_andamento`.
  - `custoMes` = soma de despesas de categoria Higienização/Manutenção/Ajuste com data (`incurred_at`) ≥ hoje−30 dias.
- Ação à direita: botão **Atualizar** (ícone refresh). Clique: recalcula/reconcilia estados da peça com o calendário e mostra toast `Atualizado` / `Estados reconciliados com o calendário.` (tom ok). No sistema real é só refetch (a parte `expireHolds` do protótipo some com a pré-reserva).

### Faixa de tiles (5)
| Rótulo | Valor | Descrição | Destaque | Ícone |
|---|---|---|---|---|
| Aguardando inspeção | nº peças `inspecao` | peças paradas até a conferência | classe `alert` se > 0 | alerta |
| Em higienização | nº `higienizacao` | na lavanderia | — | gota |
| Em ajuste | nº `ajuste` | ateliê | — | costura |
| Em manutenção | nº `manutencao` | reparo | — | costura |
| Bloqueadas | nº `bloqueado` | editorial, avaliação ou decisão da gestão | — | tag |

Tiles não são clicáveis.

### Nota informativa (fixa, tom info, ícone alerta)
"**Nenhuma peça nesta tela pode ser reservada.** Enquanto está aqui, ela ocupa o próprio calendário — é o que garante que o Atendimento nunca prometa uma peça que a Operação ainda tem em mãos."

### Grade 2×2 de colunas (cards) — `grid g2` (1 coluna em mobile)
Cada card: cabeçalho `h3 {título}` + pill com a contagem (tom do estado da peça), linha de descrição (texto pequeno, apagado, borda inferior), lista de linhas. Lista vazia: empty-state `Fila vazia.`

| Card | Estado da peça (tom da pill) | Descrição | Botão por linha (permissão) |
|---|---|---|---|
| Aguardando inspeção | `inspecao` (teal) | Peça devolvida. Conferir item a item antes de decidir para onde ela vai. | **Inspecionar** (primário, `operacao.inspect`) → modal de inspeção |
| Em higienização | `higienizacao` (teal) | Na lavanderia. Ao concluir, lance o custo — ele entra no resultado da peça. | se tem ordem aberta: **Concluir** (`operacao.maintenance`) → modal Concluir; senão **Liberar** → confirmação de liberação |
| Em ajuste | `ajuste` (ochre) | Alterações reversíveis feitas para uma cliente específica. | idem higienização |
| Em manutenção | `manutencao` (ochre) | Reparos. Custo lançado aqui abate o resultado econômico da peça. | idem higienização |

Sem a permissão, o botão simplesmente não aparece.

**Linha de peça** (grid 38px | 1fr | ações; clique na miniatura ou no texto → `/acervo/:id`):
- Miniatura 38×50 (foto de capa ou silhueta).
- Linha 1: `{nome}` + `{código}` (mono, apagado).
- Linha 2 (sub): se há ordem aberta/em andamento mais recente da peça (`m`): `m.description` ou, se vazio, `m.kind` (chave crua; no sistema real use o rótulo de `MAINTENANCE_KIND`); senão, se há bloco ativo `bloqueio_manual`/`editorial`: `bloco.note`; senão `{cor primária} · tam. {tamanho etiqueta}`.
- Linha 3 (sub): se há ordem: `há {N} dia(s)` (N = dias inteiros desde `opened_at`; se N ≥ 7: vermelho + negrito); se há próxima locação (primeiro bloco `locacao` ativo com início > hoje): ` · próxima reserva {dd/mm}` em âmbar (separador ` · ` só aparece quando a primeira parte existe — ver nota de fidelidade abaixo).
- Ações à direita.

### Card "Bloqueadas" (condicional)
Só renderiza se houver peças `bloqueado`; ocupa a largura toda (grid de 1 coluna). Título **Bloqueadas** + pill (tom `stone`), descrição "Fora do acervo por decisão da gestão — ensaio, avaliação, empréstimo institucional.". Linha igual às demais (linha 2 mostra a nota do bloqueio). Botão **Devolver ao acervo** (`operacao.release`) → confirmação de liberação.

### Card "Ordens em aberto"
Cabeçalho: `h3 Ordens em aberto` + texto apagado "higienização, ajuste e manutenção em curso". Tabela (sem padding, clique na linha → `/acervo/:id`), ordenada por `opened_at` crescente (mais antiga primeiro):

| Coluna | Conteúdo |
|---|---|
| Peça | código (mono) + quebra de linha + nome (destaque) |
| Tipo | rótulo de `MAINTENANCE_KIND` |
| Descrição | `description` |
| Aberta há | `{N} dia(s)` (≥7 dias: vermelho negrito; alinhado à direita, numérico) |
| Prazo | `due_at` em dd/mm ou `—` |
| Fornecedor | `provider` ou `—` |
| (ação) | **Concluir** (`operacao.maintenance`) → modal Concluir |

Vazio: título `Nenhuma ordem em aberto`, detalhe `Todo o acervo está pronto para locação.`

### Fidelidade / correções a registrar (decisões para o React)
1. Protótipo mostra "há N dia(s)" apenas se existe ordem; peças em `inspecao` não têm ordem, então a idade da espera na fila de inspeção só aparece pelo alerta (`inspecao_parada`: peça em inspeção há ≥ 1 dia, calculado do último `garment_state_history.to_state='inspecao'`). **(proposta)** mostrar "aguarda há N dia(s)" também na fila de inspeção usando esse histórico.
2. Linha 2 usa `m.kind` cru no fallback; usar rótulo.
3. `Liberar` quando não há ordem (peça em `ajuste`/`manutencao`/`higienizacao` sem ordem aberta, ex. estado herdado) chama a liberação direta.
4. `releaseGarment` do protótipo só remove blocos `higienizacao`, `manutencao`, `ajuste`, `inspecao` com `end_date >= hoje` — **não remove** `bloqueio_manual` nem `editorial`, então "Devolver ao acervo" de peça bloqueada muda o estado mas deixa o bloco no calendário. **No sistema real**: ao liberar peça `bloqueado`, liberar também os blocos `bloqueio_manual`/`editorial` ativos que cobrem hoje (a peça só pode voltar ao acervo se o calendário a liberar).

## 1.3 Formulários e modais

### 1.3.1 Modal "Inspeção de devolução" (largo)
- Título: `Inspeção de devolução`. Subtítulo: `{código} · {nome}` + ` · devolvida por {cliente}` se achou reserva.
- Reserva vinculada: entre os `reservation_item` da peça, a reserva em estado `em_inspecao`, `devolvida` ou `aguardando_devolucao` com `returned_at` mais recente. Pode não existir (peça devolvida sem reserva) → `reservation_id = null`.
- Nota info (ícone operacao): "Marque apenas o que estiver **com problema**. A severidade decide o destino da peça: leve segue para higienização, grave abre manutenção bloqueante, e dano com risco de perda vai para avaliação da gestão."
- **Checklist** (itens ativos de `inspection_checklist_item`, ordem `sort_order`): por linha, em grid auto-fit 112px:
  - checkbox + rótulo do item (marcar = "com problema");
  - select severidade (desabilitado até marcar): `leve` (padrão) / `média` (valor `media`) / `grave`; aria-label `Severidade de {item}`;
  - input texto, placeholder `descrição` (desabilitado até marcar); aria-label `Descrição de {item}`.
  - Itens padrão (seed): Manchas; Rasgos e furos; Costuras; Zíper e fechos; Aplicações e pedrarias; Barra; Odor; Desgaste do tecido; Forro; Alças e sustentação.
- **Registro fotográfico**: eyebrow `Registro fotográfico`; 3 botões com ícone câmera: `Devolução`, `Dano`, `Detalhe` (cada clique adiciona uma miniatura 64×80 com rótulo do tipo e botão X "Remover foto"). Vazio: "Nenhuma foto anexada.". (Protótipo simula; real: upload de arquivo para Storage `inspecoes/{inspectionId}/{tipo}-{n}.jpg`, tabela de foto com `kind` ∈ devolucao|dano|detalhe e `inspection_id`.) Remover o texto "Protótipo: a foto é simulada…".
- Campos (grid de 2 colunas):
  - **Tipo de serviço, se houver reparo** (select de `MAINTENANCE_KIND`, padrão `costura`). Usado como `kind` da ordem de manutenção (dano grave) ou da ordem de reparo leve.
  - **Fornecedor** (texto com sugestões: Lavanderia Branca Neve, Ateliê Dona Neuza, Ateliê próprio, Tinturaria Aurora; **proposta**: sugestões vêm de fornecedores cadastrados/usados antes). Opcional.
  - Checkbox (linha inteira): **Abrir ordem de reparo leve além da higienização**. Só visível quando há ≥1 ressalva e nenhuma grave.
  - **Observação geral** (textarea; placeholder `Peça devolvida em boas condições.`).
- Aviso âmbar (visível só com ≥1 ressalva marcada):
  - com grave: "**Dano grave marcado.** A peça vai para **manutenção** e fica bloqueada até o reparo ser concluído. Se houver risco de perda, marque a opção abaixo para enviar à avaliação gerencial."
  - sem grave: "**{n} ressalva(s).** A peça segue para higienização. Marque “abrir ordem de reparo leve” se o ateliê precisar intervir antes de ela voltar à arara."
- Checkbox (visível só com grave): "**Possível perda da peça** — bloquear para avaliação gerencial em vez de mandar para o ateliê".
- Rodapé: **Cancelar** | **Registrar inspeção** (primário).
- Validação: nenhuma obrigatória no protótipo (sem ressalvas = aprovada). Observação vazia → default: `Ressalvas registradas na inspeção.` se houver ressalvas, senão `Peça devolvida em boas condições.`
- Resultado calculado (`result`): `perda` se grave **e** checkbox perda; senão `aprovada` (0 ressalvas); `reprovada` (alguma grave); `ressalva` (só leves/médias).
- Toast (tom ok), título `Inspeção registrada`: perda → `{código} bloqueada para avaliação gerencial.`; grave → `{código} enviada para manutenção.`; demais → `{código} enviada para higienização.`

**Efeitos (ver 1.4)**: cria registro de inspeção + fotos, cria ordem/bloco/estado conforme o resultado, marca o item da reserva como `inspecionado`, finaliza a reserva quando todos os itens estiverem inspecionados.

### 1.3.2 Modal "Concluir higienização" / "Concluir manutenção"
- Título: `Concluir higienização` se `kind = higienizacao`, senão `Concluir manutenção` (inclusive ajuste). Subtítulo `{código} · {nome}`.
- Campos:
  - **Custo (R$)** — número ≥ 0, passo 0,01. Padrão `58` para higienização; `0` para as demais.
  - **Fornecedor** — texto, preenchido com `provider` da ordem. (Protótipo lê mas **não grava** o valor editado; no real, gravar em `provider` da ordem e na despesa.)
  - **Observação** — texto, placeholder `O que foi feito`. Se preenchida, é anexada: `{descrição existente} · {observação}`.
  - Checkbox marcado por padrão: **Liberar a peça para o acervo ao concluir**.
- Rodapé: **Cancelar** | **Concluir** (primário). Sem validação além de custo ≥ 0 (**proposta**: bloquear custo negativo/vazio→0).
- Toast `Concluído`: `{código} · {brl(custo)} lançado no custo da peça` ou `{código} · sem custo`.
- Efeitos: ver 1.4 (`closeMaintenance`, e se marcado, `releaseGarment`).

### 1.3.3 Confirmação "Liberar peça para o acervo"
- Título: `Liberar peça para o acervo`. Texto: "Encerrar higienização, ajuste ou manutenção em aberto de **{nome}** ({código}) e devolvê-la ao acervo? Os bloqueios operacionais atuais serão removidos do calendário." Botão de confirmação: **Liberar peça**.
- Toast `Peça liberada`: `{código} agora está {estado resultante em minúsculas}.` (ex.: "disponível" ou "reservado").
- Nota de histórico enviada: `Liberada pela Operação`.

## 1.4 Regras e cálculos

**Estados da peça no ciclo** (rótulo/tom): `inspecao` Inspeção/teal, `higienizacao` Higienização/teal, `ajuste` Ajuste/ochre, `manutencao` Manutenção/ochre, `bloqueado` Bloqueado/stone. **Higienização e manutenção são estados distintos** (decisão 3.6).

**Entrada na inspeção**: devolução de item (`returnItems`) → item `devolvido`, calendário da peça realinhado na data real de devolução, peça em `inspecao` ("Devolução — {código reserva}"). Multa de atraso é calculada na devolução (fora desta área).

**Inspeção → destino** (`registerInspection`):
| result | Efeito |
|---|---|
| `aprovada` | Cria ordem `higienizacao` (estado `em_andamento`, `blocks_garment=true`, descrição "Higienização pós-locação", custo 0, prazo = hoje + max(1, dias de higienização efetivos da peça), fornecedor se informado). Peça → `higienizacao` (motivo "Enviada para higienização"). |
| `ressalva` | Igual à aprovada. Se "abrir ordem de reparo leve": cria **segunda ordem** `kind` = tipo escolhido (padrão `ajuste` no motor / `costura` no select), estado `aberta`, `blocks_garment=false`, prazo = hoje + max(2, dias higienização + 1), descrição = lista das ressalvas (`rótulo (severidade) — nota; ...`) ou "Reparo leve identificado na inspeção". |
| `reprovada` (alguma grave, sem perda) | Cria ordem `kind` = tipo escolhido, estado `aberta`, `blocks_garment=true`, prazo hoje+5, descrição = lista das ressalvas (ou observação). Cria bloco de calendário `manutencao` (hoje → hoje+5, nota "Manutenção aberta na inspeção") ligado à ordem. Peça → `manutencao` ("Dano identificado na inspeção"). |
| `perda` | Cria bloco `bloqueio_manual` (hoje → hoje+30, nota "Avaliação gerencial — possível perda da peça"). Peça → `bloqueado` ("Dano grave — bloqueada para avaliação gerencial"). Nenhuma ordem criada. |

- Sempre: grava inspeção (`result`, `findings[]` com `{label, ok:false, severity, note}` só dos itens problemáticos, `notes`, inspetor, data/hora), fotos anexadas; histórico de estado da peça com referência (`ref_type`/`ref_id` = inspeção ou ordem).
- Se há `reservation_id`: item da reserva vira `inspecionado`; se todos os itens não cancelados estiverem `inspecionado` ou `nao_entregue` → reserva vai a `finalizada` ("Todas as peças inspecionadas"). Caução devolvida após inspeção é lançada na reserva (estorno de caução; ver parte 2).
- Dias de higienização efetivos (`E.buffer`): peça > categoria > parâmetro do sistema (`default_cleaning_days`, padrão 2). Seed por categoria: Vestido longo 3, midi 2, curto 2, sereia 3, Macacão 2, Conjunto 2, Saia 1, Bolsa & acessório 1.

**Concluir ordem** (`closeMaintenance(id, custo, nota)`):
1. Ordem → `concluida`, `closed_at` = agora, `cost = custo`, descrição ganha a observação.
2. Se custo > 0: cria despesa `{peça, ordem, categoria = higienizacao | ajuste | manutencao (qualquer outro kind), valor, data = hoje, descrição = descrição da ordem ou kind}`. No sistema real (Financeiro novo): essa despesa vira conta a pagar **já paga** (status `paga`, `paidAt` = hoje), categoria de sistema Higienização / Ajuste / Manutenção, mantendo `garmentId` e `maintenanceId` (necessários para a economia/payback da peça).
3. Libera blocos do calendário ligados à ordem (`maintenance_id`).
4. Se "Liberar a peça…" marcado: executa `releaseGarment`.

**Liberar peça** (`releaseGarment(garmentId, nota)`): fecha **todas** as ordens abertas da peça (cada uma com seu `cost` atual, normalmente 0, gerando despesa só se >0); libera blocos ativos `higienizacao|manutencao|ajuste|inspecao` com `end_date >= hoje`; recalcula o estado (`deriveState` partindo de `disponivel`: se há locação ativa/futura → `reservado`; senão `disponivel`); grava no histórico com a nota. Atenção: liberar a peça de uma ordem de higienização também encerra uma ordem de reparo leve aberta da mesma peça.

`deriveState`: estados `baixado|bloqueado|higienizacao|inspecao|ajuste|manutencao` só saem por ação explícita; "o fato vence o plano" (peça na rua em reserva `retirada/em_uso/aguardando_devolucao` → `em_uso`/`aguardando_devolucao`).

**KPIs**: ver cabeçalho e tiles em 1.2. Alertas gerados por esta área: `inspecao_parada` (≥1 dia em inspeção; severidade atenção, rota `/acervo/:id`), `inspecao_pendente` (<1 dia; info, rota `/operacao`), `manutencao_longa` (ordem aberta ≥ 7 dias; atenção; título `{código} há {N} dias em {kind}`, rota `/operacao`).

## 1.5 Dados necessários (TypeScript)

```ts
// Reusa Garment, GarmentState, BlockKind, PhotoKind de src/data/types.ts
export type MaintenanceKind = 'higienizacao'|'costura'|'barra'|'ziper'|'pedraria'|'ajuste'|'mancha'|'restauracao'|'outros'
export const MAINTENANCE_KIND: Record<MaintenanceKind,string> = {
  higienizacao:'Higienização', costura:'Costura', barra:'Barra', ziper:'Zíper', pedraria:'Pedraria',
  ajuste:'Ajuste', mancha:'Mancha', restauracao:'Restauração', outros:'Outros' }

export type MaintenanceState = 'aberta'|'em_andamento'|'concluida'|'cancelada'
export type Maintenance = {
  id: string; garmentId: string; inspectionId: string|null; reservationId: string|null
  kind: MaintenanceKind; state: MaintenanceState
  openedAt: string; dueAt: string|null /* aaaa-mm-dd */; closedAt: string|null
  description: string|null; provider: string|null
  cost: number            // 0 até concluir
  blocksGarment: boolean  // true: higienização e dano grave; false: reparo leve
  createdBy: string
}

export type InspectionResult = 'aprovada'|'ressalva'|'reprovada'|'perda'
export const INSPECTION_RESULT: Record<InspectionResult,{label:string; tone:Tone}> = // (rótulos propostos)
  { aprovada:{label:'Aprovada',tone:'green'}, ressalva:{label:'Com ressalva',tone:'amber'},
    reprovada:{label:'Reprovada (dano)',tone:'red'}, perda:{label:'Possível perda',tone:'red'} }
export type Severity = 'leve'|'media'|'grave'   // labels: leve, média, grave
export type InspectionFinding = { label: string; ok: false; severity: Severity; note: string|null }
export type Inspection = {
  id: string; garmentId: string; reservationId: string|null
  inspectedAt: string; inspectorId: string; inspectorName: string
  result: InspectionResult; findings: InspectionFinding[]; notes: string|null
  photos: { id: string; kind: 'devolucao'|'dano'|'detalhe'; url: string }[]
}
export type ChecklistItem = { id: string; label: string; sortOrder: number; isActive: boolean }

export type InspectionInput = {
  garmentId: string; reservationId: string|null
  findings: InspectionFinding[]; photos: File[]|{kind:string}[]
  perda: boolean; maintenanceKind: MaintenanceKind; provider: string|null
  openRepair: boolean; notes: string|null
}
export type CloseMaintenanceInput = { maintenanceId: string; cost: number; provider: string|null; note: string|null; release: boolean }

export type OperacaoQueue = {
  inspecao: QueueRow[]; higienizacao: QueueRow[]; ajuste: QueueRow[]; manutencao: QueueRow[]; bloqueado: QueueRow[]
  openOrders: (Maintenance & { garmentCode: string; garmentName: string })[]
  costLast30d: number | null   // null sem acervo.cost
}
export type QueueRow = { garment: Garment; order: Maintenance|null; blockNote: string|null; nextRentalStart: string|null; daysOpen: number|null }
```

Tom/rótulo dos estados da peça: ver `SZ.GARMENT_STATE` do protótipo (disponivel Disponível/green; reservado Reservado/wine; retirado Retirado/indigo; em_uso Em uso/indigo; aguardando_devolucao Aguardando devolução/amber; higienizacao Higienização/teal; inspecao Inspeção/teal; ajuste Ajuste/ochre; manutencao Manutenção/ochre; bloqueado Bloqueado/stone; baixado Baixado do acervo/stone). `Tone` = green|amber|wine|indigo|teal|ochre|stone|red.
Rótulo de bloco: Higienização, Inspeção, Ajuste, Manutenção (tag MAN), Bloqueio (BLQ), Editorial (EDIT), Locação (LOC).

Erros de RPC sugeridos: `PECA_NAO_ENCONTRADA`, `ORDEM_NAO_ENCONTRADA`, `ORDEM_JA_CONCLUIDA`, `CUSTO_INVALIDO`, `SEM_PERMISSAO`.

## 1.6 Permissões (catálogo `src/auth/permissions.ts`)

| Elemento | Permissão |
|---|---|
| Rota/menu Operação, ver filas e ordens | `operacao.view` |
| Botão Inspecionar / registrar inspeção | `operacao.inspect` |
| Botões Concluir / Liberar (ordens), ordens em aberto | `operacao.maintenance` |
| Botão Devolver ao acervo (peça bloqueada) e Liberar via ficha | `operacao.release` |
| Custo dos últimos 30 dias no subtítulo | `acervo.cost` |
| Bloquear/remover bloqueio na ficha da peça (fora da tela) | `acervo.block` |

Atendimento tem todas as `operacao.*` (design 3.8) mas **não** `acervo.cost`. Observação: no protótipo `SZ.require` mostra erro ao tentar sem permissão; no real a RPC valida com `has_perm`. No protótipo o botão **Liberar** da fila usa `operacao.maintenance` e o do card "Bloqueadas" usa `operacao.release`, mas a ação `releaseGarment` exige `operacao.release` — **unificar**: Liberar (higienização/ajuste/manutenção sem ordem) exige `operacao.release`.

## 1.7 Dados de exemplo (fixture Operação)

Seed (relativo a hoje `T`, `D(n)` = T+n dias):
- Em **higienização** (2 peças): *Trastevere* (ordem `em_andamento`, aberta há 1 dia, prazo D+1, Lavanderia Branca Neve, "Higienização pós-locação", bloco higienização D-1→D+1) e *Lecce* (aberta há 2 dias, prazo D+2, mesmo fornecedor, bloco D-2→D+2).
- Em **manutenção** (1): *Parma* — ordem `ziper` `em_andamento`, aberta há 9 dias (aparece em vermelho), prazo D+2, Ateliê Dona Neuza, "Zíper invisível rompido na altura do quadril. Substituição completa.", bloco manutenção D-9→D+3, nota "Troca de zíper". Tem reserva confirmada futura (D+3→D+6 = risco, aparece "próxima reserva").
- Em **ajuste** (1): *Assis* — ordem `ajuste` `aberta`, há 2 dias, prazo D+1, Ateliê próprio, "Pences laterais para a prova de quinta.".
- **Bloqueada** (1): *Gênova* — bloco `editorial` D-1→D+4, nota "Ensaio fotográfico da coleção — fotógrafa Marina Dias".
- Peças em **inspeção**: derivadas das devoluções do dia/da semana na seed de reservas (ex.: reserva `rHoje` com *Ostuni* devolução hoje 14:00 vira inspeção após a devolução; fixture deve incluir ao menos 1 peça em `inspecao` com histórico de ontem para exercitar o alerta).
- Checklist de 10 itens (acima). Fornecedores sugeridos: Lavanderia Branca Neve, Ateliê Dona Neuza, Ateliê próprio, Tinturaria Aurora.
- Histórico de 7 meses: cada locação finalizada tem 1 inspeção (86% `aprovada`, 14% `ressalva` com 1 achado leve em Barra/Zíper/Costura/Manchas "Reparo simples realizado no ateliê."), despesa de higienização R$ 38 + 8×(0..6) (R$ 38–86, Lavanderia Branca Neve, "Higienização pós-locação", 1 dia após devolução) e, nas com ressalva, despesa de manutenção R$ 25 + 10×(0..9) (R$ 25–115, Ateliê Dona Neuza, "Reparo identificado na inspeção", 2 dias após a devolução).
- As 3 inspeções mais recentes têm fotos `devolucao` e `detalhe`.

---

# PARTE 2 — FINANCEIRO (financeiro geral da empresa)

## 2.1 Telas e rotas

| Rota | Tela | Origem | Permissão |
|---|---|---|---|
| `/financeiro` | **Visão geral** | protótipo `financeiro` (adaptado) | `financeiro.view`; blocos de resultado exigem `financeiro.consolidated` |
| `/financeiro/receber` | **Contas a Receber** | nova (proposta) | `financeiro.geral` |
| `/financeiro/pagar` | **Contas a Pagar** | nova (proposta) | `financeiro.geral` |
| `/financeiro/categorias` | **Categorias** | nova (proposta) | `financeiro.geral` |

Submenu (navegação secundária em abas no topo da página, ou subitens na sidebar): `Visão geral · Contas a Receber · Contas a Pagar · Categorias`. Item "Financeiro" da sidebar: visível com `financeiro.view` ou `financeiro.geral`; subitens filtrados por permissão.

Conteúdo do protótipo que vai para **Visão geral** (`/financeiro`): título "Financeiro" com seletor de período, os 5 tiles, o gráfico "Faturamento recebido por mês", as tabelas "A receber" e "Formas de pagamento" e "Últimos lançamentos". Adições (proposta): tiles de **Pago** e **Resultado**, "Caução em custódia" separado, atalhos "Ver contas a pagar" / "Ver contas a receber", lista "Vencendo nos próximos 7 dias".

Dashboard (fora desta spec) tem o botão "Ver financeiro completo" → `/financeiro`. Linhas da tabela de reserva levam a `/reservas/:id`.

## 2.2 Layout por tela

### 2.2.1 `/financeiro` — Visão geral

**Cabeçalho**: título **Financeiro**; subtítulo `{brl0(receita)} recebidos nos últimos {dias} dias · {brl0(totalAReceber)} a receber`. Ação: seletor segmentado de período (`seg`): **30 dias** | **90 dias** (padrão) | **12 meses** (valores 30/90/365). `from = hoje − dias + 1`, `to = hoje`. O período afeta tiles, "Formas de pagamento", "Últimos lançamentos"; não afeta "A receber" nem o gráfico de 12 meses.

**Tiles** (protótipo):
| Rótulo | Valor | Descrição | Destaque |
|---|---|---|---|
| Recebido | `brl0(receita)` | `{n} lançamento(s)` | — |
| A receber | `brl0(totalAReceber)` | `{n} reserva(s) em aberto` | `alert` se > 0 |
| Custo operacional | `brl0(oper)` | higienização, ajustes e reparos | — |
| Margem operacional | `pct(1 − oper/receita)` ou `—` se receita = 0 | antes de custo fixo e aquisição | — |
| Investido em acervo | `brl0(aquis)` | no período | — |

**Mudanças aprovadas (3.5), proposta de tiles**: manter os 5 acima e adicionar (proposta) **Pago** (total de contas a pagar pagas no período; "{n} conta(s)"), **Resultado** (`Recebido − Pago`, descrição "regime de caixa · sem caução"; tom vermelho se negativo) e **Caução em custódia** (`brl0`, descrição "retida até a devolução · não entra no resultado"). Em tela estreita os tiles quebram em 2 colunas. Tiles de custo/margem/investido/pago/resultado exigem `financeiro.consolidated` (Atendimento não os vê); Recebido, A receber e Caução exigem `financeiro.view`.

**Card "Faturamento recebido por mês"** — rótulo à direita `últimos 12 meses · regime de caixa`; gráfico de linha 200px, 12 pontos (rótulo = mês abreviado, valor = recebido no mês; o mês corrente vai do dia 1 até hoje). aria: "Faturamento recebido por mês, últimos 12 meses". **(proposta)** com `consolidated`, segunda série "Pago" e "Resultado".

**Grade 2 colunas**
1. Card **A receber** — pill à direita: `brl0(total)` âmbar, ou `nada em aberto` verde. Tabela: colunas **Reserva** (código mono) | **Cliente** | **Retirada** (mono; vermelho negrito se retirada em ≤ 2 dias a partir de hoje, inclusive vencida) | **Total** (`devido`, direita) | **Falta** (`due`, direita, negrito). Ordenada por data de retirada crescente; clique → `/reservas/:id`. Vazio: `Nada a receber` / `Todas as reservas ativas estão quitadas.` Abaixo (se houver cobranças `pendente`): eyebrow `Cobranças lançadas e pendentes` e linhas `{rótulo do tipo} · {cliente} {observação}` com valor à direita em negrito (ex.: multa por atraso pendente).
2. Card **Formas de pagamento** — `últimos {dias} dias`; barras horizontais por forma (PIX, Cartão de crédito, Cartão de débito, Dinheiro, Link de pagamento, Transferência, Outros), ordenadas por valor desc, cor cíclica `cat-1..6`, nota `{n}×` por barra, valor em `brl0`. Vazio: `Sem recebimentos no período`.

**Card "Últimos lançamentos"** — rótulo `{30 ou menos} de {total}`; tabela: **Data** (dd/mm/aaaa mono) | **Reserva** (código ou `—`) | **Cliente** | **Tipo** (Sinal/Saldo/Integral/Caução/Multa por atraso/Estorno) | **Forma** | **Valor** (direita, `brl`). Os 30 mais recentes por `paid_at`, só `state=pago` no período. Clique → reserva. Nota: no protótipo a lista inclui caução e estorno (mostrados, mas fora da soma "Recebido"); manter e **(proposta)** exibir caução com pill "custódia" e estorno com valor negativo.

### 2.2.2 `/financeiro/receber` — Contas a Receber **(proposta)**

Cabeçalho: título **Contas a Receber**; subtítulo `{brl0(abertoTotal)} em aberto · {brl0(vencido)} vencido`; ações: seletor de período (30/90/12 meses/Tudo) e botão primário **Novo lançamento** (modal avulso).
- Tiles: **A receber** (soma em aberto, `{n} parcela(s)`), **Vencido** (tom alert, `{n}`), **Vence em 7 dias**, **Recebido no período**.
- Filtros (linha acima da tabela): abas de status `Em aberto` (padrão) | `Vencidas` | `Recebidas` | `Todas`; select **Origem** (Todas | Reservas | Avulsas); select **Categoria**; busca por cliente/descrição/código da reserva.
- Tabela (linha clicável): **Vencimento** (dd/mm/aaaa; vermelho se vencida) | **Descrição** (ex.: `Saldo · RS-2026-0042`, ou descrição livre) | **Cliente** | **Origem** (pill: `Reserva` wine / `Avulso` stone) | **Categoria** | **Valor** | **Pago** | **Falta** | **Status** (pill) | ações.
  - Linhas de reserva são **geradas automaticamente** (não criadas à mão): `sinal` (vence na confirmação), `saldo` (vence na data de retirada), `multa` (pendente na devolução com atraso), e **caução** aparece separada (aba/linha com tag `Caução — custódia`; não soma no "A receber" de receita nem no resultado). Clique abre a reserva (`/reservas/:id`). Ação: **Registrar pagamento** (abre o modal "Lançar pagamento" da reserva; `financeiro.payment`).
  - Linhas avulsas: ações **Receber** (baixa), **Editar**, **Cancelar**.
- Totalizador no rodapé da tabela (conforme filtros).
- Vazio: `Nada a receber` / `Nenhuma conta em aberto neste filtro.`

### 2.2.3 `/financeiro/pagar` — Contas a Pagar **(proposta)**

Cabeçalho: título **Contas a Pagar**; subtítulo `{brl0(abertoTotal)} em aberto · {brl0(vencido)} vencido`; ações: seletor de período e botão primário **Nova despesa**.
- Tiles: **A pagar** (em aberto), **Vencido** (alert), **Vence em 7 dias**, **Pago no período**.
- Filtros: abas `Em aberto` (padrão) | `Vencidas` | `Pagas` | `Todas`; select **Categoria**; select **Recorrência** (Todas | Única | Recorrente); busca por descrição/fornecedor.
- Tabela: **Vencimento** | **Descrição** (+ ícone de recorrência e nome do fornecedor em texto pequeno; se vinculada a peça: código da peça mono) | **Categoria** | **Valor** | **Status** (pill) | **Pago em** | ações: **Pagar** (baixa), **Editar**, **Excluir** (menu `⋯`; excluir pede confirmação `Excluir despesa` / "Excluir "{descrição}"? Esta ação não pode ser desfeita." / botão **Excluir**). Despesas geradas pela Operação (higienização/manutenção/ajuste) e aquisição de peça aparecem com tag `Automática` e são **somente leitura** (edição só pela ordem/peça de origem; valor pode ser corrigido via "Editar" com auditoria — decisão do builder).
- Vazio: `Nenhuma despesa` / `Lance a primeira despesa da Senzi para acompanhar o que vence.`

### 2.2.4 `/financeiro/categorias` — Categorias **(proposta)**

Cabeçalho: título **Categorias**; subtítulo `{n} categoria(s)`; botão primário **Nova categoria**.
- Duas seções (cards) lado a lado ou empilhadas: **Receitas** e **Despesas**. Cada linha: bolinha de cor, nome, pill `Sistema` (se de sistema), nº de lançamentos, ações **Editar** / **Arquivar** (ou **Excluir** se sem uso). Categorias de sistema não podem ser excluídas nem ter o tipo alterado (nome editável? não — bloqueado).
- Vazio por seção: `Nenhuma categoria` / `Crie categorias para classificar lançamentos.`

## 2.3 Formulários e modais

### 2.3.1 Lançar pagamento (reserva) — existente no protótipo (`addPayment`)
Título `Lançar pagamento`; subtítulo `{código} · saldo {brl(due)}` + ` · caução retida {brl(caucao)}` se houver.
- **Tipo** (select, obrigatório): Sinal | Saldo | Integral | Caução | Multa por atraso | Estorno. Padrão: `saldo` se já há pago > 0, senão `sinal`. Dica abaixo do campo por tipo: sinal "Entrada paga na reserva. Abate o valor devido."; saldo "Restante do valor da locação."; integral "Pagamento único do total."; caução "Garantia retida. NÃO abate o valor devido e deve ser devolvida na finalização."; multa "Cobrança por atraso ou dano."; estorno "Devolução de valor à cliente — inclusive da caução."
- **Forma** (select): PIX | Cartão de crédito | Cartão de débito | Dinheiro | Link de pagamento | Transferência | Outros.
- **Valor (R$)** (número, min 0, passo 0,01): padrão por tipo — caução: caução sugerida da peça ou 10% do devido; estorno: caução retida (ou, sem caução, o pago); demais: saldo em aberto.
- **Referência** (texto, placeholder `E2E do PIX, NSU, link`). **Observação** (texto, placeholder `Sinal recebido na prova`).
- Texto auxiliar: "Caução sugerida para esta peça: {brl} — facultativa." (se houver). Nota info: "Uma reserva aceita vários lançamentos: sinal, saldo, caução, multa e estorno convivem. A caução não abate o valor devido — ela é retida e devolvida no fim." (remover a frase do protótipo sobre gateway).
- Validação: valor > 0 → senão `O valor do pagamento deve ser maior que zero.`; para tipos que não são estorno/caução, valor ≤ saldo em aberto (+ R$ 0,01) → senão `O valor excede o saldo em aberto ({brl(saldo)}).` Erro mostra toast `Revise o lançamento` com a mensagem.
- Efeito: cria pagamento `pago`, `paid_at` = agora, autor; recalcula saldo. Toast `Pagamento lançado`: caução → `Caução de {brl} retida.`; estorno → `Estorno de {brl} registrado.`; senão `Ainda faltam {brl}.` ou `Reserva quitada e confirmada.` (o texto "confirmada" some: no sistema real, confirmar é ação separada exigindo contrato assinado e sinal mínimo — design 3.5/4.1).
- **Baixa de parcela**: o botão **Registrar pagamento** em Contas a Receber abre este mesmo modal, com tipo/valor pré-preenchidos pela parcela (saldo→Saldo, multa→Multa por atraso).
- **(proposta)** Devolução da caução: botão `Devolver caução` na reserva (e atalho em Contas a Receber/caução) cria estorno `origem = caucao` com valor = caução retida ainda não devolvida; só habilitado após a inspeção.

### 2.3.2 Conta a receber avulsa — modal "Novo lançamento" **(proposta)**
Título `Novo lançamento` (edição: `Editar lançamento`).
- **Descrição** * (texto; placeholder "Venda de acessório, aluguel de espaço…"). Erro: `Informe a descrição.`
- **Cliente** (opcional; busca de cliente existente) — ou **Pagador** (texto livre) se sem cliente.
- **Categoria** * (select só de categorias de receita não arquivadas). Erro: `Escolha a categoria.`
- **Valor (R$)** * (> 0). Erro: `Informe um valor maior que zero.`
- **Vencimento** * (data; padrão hoje). Erro: `Informe o vencimento.`
- **Já recebido** (checkbox). Se marcado, aparecem **Recebido em** (data, padrão hoje) e **Forma** (select de formas de pagamento, padrão PIX) e o lançamento já nasce `recebida`.
- **Observação** (opcional).
- Rodapé: **Cancelar** | **Salvar**. Toast: `Lançamento salvo`.

### 2.3.3 Baixa de conta a receber avulsa — modal "Receber" **(proposta)**
Campos: **Valor recebido** (padrão = falta; parcial permitido, ≤ falta → erro `O valor excede o que falta receber ({brl}).`), **Recebido em** (data, padrão hoje; não pode ser futura: `A data não pode ser futura.`), **Forma**, **Observação**. Botão **Confirmar recebimento**. Efeito: soma em `paidAmount`; status `parcial` ou `recebida`. Toast `Recebimento registrado`.

### 2.3.4 Despesa / conta a pagar — modal "Nova despesa" **(proposta)**
Título `Nova despesa` (edição: `Editar despesa`).
- **Descrição** * (texto; placeholder "Aluguel da loja, conta de luz…"). Erro: `Informe a descrição.`
- **Fornecedor** (opcional, texto com sugestões dos já usados).
- **Categoria** * (select só de despesa). Erro: `Escolha a categoria.`
- **Valor (R$)** * (> 0). Erro: `Informe um valor maior que zero.`
- **Vencimento** * (data; padrão hoje).
- **Recorrência** (select): `Não se repete` (padrão) | `Mensal` | `Semanal` | `Anual`. Se ≠ não se repete: **Repetir até** (data opcional; vazio = sem fim) — erro se anterior ao vencimento: `A data final deve ser posterior ao vencimento.`. Efeito: ao pagar uma ocorrência, o sistema cria a próxima (mesma descrição/valor, vencimento +1 período) até a data final; mensal preserva o dia (ajusta para o último dia do mês quando necessário).
- **Já paga** (checkbox): mostra **Pago em** (data, padrão hoje) e **Forma** (select).
- **Observação**.
- Rodapé: **Cancelar** | **Salvar**. Toast `Despesa salva`.

### 2.3.5 Baixa de conta a pagar — modal "Pagar" **(proposta)**
Campos: **Valor pago** (padrão = valor; ≤ valor), **Pago em** (data, padrão hoje, não futura), **Forma**, **Observação**. Botão **Confirmar pagamento**. Efeito: status `paga` (paga integral; pagamento parcial → decisão: v1 só integral, então o campo valor fica fixo e editável apenas para ajustar juros/desconto, registrado em `paidAmount`); gera próxima recorrência se houver. Toast `Pagamento registrado`.

### 2.3.6 Categoria — modal "Nova categoria" **(proposta)**
Título `Nova categoria` (edição: `Editar categoria`).
- **Nome** * (texto, único dentro do tipo, case-insensitive). Erros: `Informe o nome.` / `Já existe uma categoria com esse nome.`
- **Tipo** * (radio: `Receita` | `Despesa`; não editável após criar se houver lançamentos).
- **Cor** (paleta de 6–8 cores, padrão `cat-n` sequencial).
- Rodapé: **Cancelar** | **Salvar**. Arquivar: confirmação `Arquivar categoria` / "Ela deixa de aparecer nos formulários, mas os lançamentos antigos continuam classificados." / **Arquivar**. Excluir só se sem lançamentos; senão botão desabilitado com dica `Há lançamentos nesta categoria — arquive em vez de excluir.`
- Categorias de sistema (seed, não excluíveis): **Receita**: `Locação` (receitas de reserva: sinal/saldo/integral/multa). **Despesa**: `Aquisição de acervo`, `Higienização`, `Manutenção`, `Ajuste`. **(proposta)** livres iniciais de despesa: Aluguel, Energia e água, Internet e telefone, Folha / pró-labore, Marketing, Contabilidade, Impostos, Embalagens e materiais, Outros; de receita: Venda de peça, Outros.

## 2.4 Regras e cálculos (regime de caixa)

**Papéis dos lançamentos**
- Receita de reserva = pagamentos `pago` de tipo `sinal`, `saldo`, `integral`, `multa`. **Caução** (`caucao`) e **estorno** não entram em "Recebido"/faturamento no protótipo.
- Caução: dinheiro em custódia — aparece separada; não entra em faturamento nem resultado (3.5).

**Fórmulas do protótipo (a manter)**
- `Recebido(from,to)` = Σ `amount` de pagamentos com `state='pago'`, `kind ∉ {caucao, estorno}`, data de `paid_at` (dia) em `[from, to]`.
- `Lançamentos` (contagem do tile) = nº de pagamentos `pago` no período **incluindo** caução e estorno (o protótipo conta `pagos.length` sem filtrar tipo; recomendado contar só os que compõem o Recebido).
- `Custo operacional` = Σ despesas de categoria ≠ aquisição com `incurred_at ∈ [from, to]` (no protótipo: higienização, ajuste, manutenção). `Investido em acervo` = Σ despesas de categoria aquisição no período.
- `Margem operacional` = `1 − custoOperacional / Recebido` (— se Recebido = 0).
- Série mensal = `Recebido` de cada um dos 12 meses (início do mês até fim do mês, último mês até hoje).
- Por forma de pagamento = Recebido agrupado por `method`, ordenado por valor desc.
- `A receber` (reserva) = reservas ativas com `due > 0`, Σ `due`.
  - Estados ativos (sem pré-reserva): `confirmada`, `pronta_retirada`, `retirada`, `em_uso`, `aguardando_devolucao`. (Protótipo ainda lista `pre_reserva`, `aguardando_pagamento`: remover. Rascunho não entra.)
  - `E.balance(r)`: `devido = total_net + late_fee`; `pago` = Σ pago de tipos ≠ caução/estorno menos Σ estornos pagos; `caucao` = Σ caução paga; `due = max(0, devido − pago)` (2 casas); status: `nao_pago` (pago ≤ 0, vermelho "Não pago"), `parcial` (âmbar "Parcial"), `pago` (verde "Pago", quando `pago ≥ devido − 0,009`).
  - Cobranças `pendente` (ex.: multa) aparecem na lista "Cobranças lançadas e pendentes"; a multa integra o `devido` via `late_fee`.
- Realizado para economia da peça / inteligência: estados `retirada, em_uso, aguardando_devolucao, devolvida, em_inspecao, finalizada` (usado também na receita por peça, rateada por `net_revenue`; não é parte do caixa).

**Alterações aprovadas (3.5) a implementar**
- **Contas a Receber** = união (a) parcelas geradas da reserva e (b) lançamentos avulsos. Parcelas: `sinal` (vencimento = dia da confirmação; mínimo exigido = `min_signal_percent`, padrão 50% do valor da reserva), `saldo` (**vencimento = data de retirada**, criada na confirmação com valor `total_net − sinal pago`), `multa` (vencimento = hoje quando gerada), `caucao` (valor = `deposit_amount`; **separada**). `status` calculado: `aberto`, `parcial`, `pago`, `vencido` (vencimento < hoje e falta > 0), `cancelado` (reserva cancelada/no-show, ver abaixo).
- **Contas a Pagar** = despesas com `dueDate`, `status` (`aberta`, `paga`, `vencida` derivado, `cancelada`) e recorrência simples (semanal/mensal/anual com data final opcional). Despesas automáticas (higienização/manutenção/ajuste ao concluir ordem; aquisição ao cadastrar peça com custo > 0) nascem `paga`, `paidAt = data do evento`, `source = 'operacao' | 'aquisicao'`.
- **Faturamento (período) = Recebido** das reservas + avulsos recebidos (categorias de receita) por **data de recebimento**; **Pago (período)** = contas pagas por **data de pagamento** (não vencimento, não competência). **Resultado = Recebido − Pago** (todas as categorias incluindo aquisição). Em `Visão geral`, mostrar também **Resultado operacional = Recebido − Pago excluindo `Aquisição de acervo`** (alinha com "Margem operacional" do protótipo). Proposta: estorno de pagamento de receita (não de caução) **subtrai** do Recebido no período (o protótipo ignora estornos, o que superestima; caução devolvida não afeta o resultado).
- **A receber (geral)** = Σ falta das parcelas de reserva em reservas ativas + avulsos em aberto. **A pagar** = Σ contas `aberta`/`vencida`.
- **Caução em custódia** = Σ caução paga − Σ estornos de caução, nas reservas ainda não encerradas (mais precisamente, enquanto não devolvida). Exibida em card/tile próprio; fora de receitas/resultado.
- **Reserva cancelada com sinal recebido**: o sinal permanece na caixa (já recebido); eventual devolução entra como `estorno` e é refletida conforme proposta acima. Parcelas pendentes da reserva cancelada → `cancelado`.
- **Período**: segmentado 30 dias / 90 dias / 12 meses (padrão 90); `from = hoje − dias + 1`. Em Contas a Receber/Pagar o filtro de período atua sobre o vencimento (abas Em aberto/Vencidas ignoram o período por padrão: sempre mostram tudo).
- Vencida: `dueDate < hoje` e status em aberto/parcial. "Vence em 7 dias": `hoje ≤ dueDate ≤ hoje+7`.
- Datas puras `aaaa-mm-dd` no fuso America/Araguaina; instantes ISO.

## 2.5 Dados necessários (TypeScript)

```ts
export type PaymentKind = 'sinal'|'saldo'|'integral'|'caucao'|'multa'|'estorno'
export const PAYMENT_KIND: Record<PaymentKind,string> = {
  sinal:'Sinal', saldo:'Saldo', integral:'Integral', caucao:'Caução', multa:'Multa por atraso', estorno:'Estorno' }
export type PaymentMethod = 'pix'|'credito'|'debito'|'dinheiro'|'link'|'transferencia'|'outro'
export const PAYMENT_METHOD: Record<PaymentMethod,string> = {
  pix:'PIX', credito:'Cartão de crédito', debito:'Cartão de débito', dinheiro:'Dinheiro',
  link:'Link de pagamento', transferencia:'Transferência', outro:'Outros' }
export type PaymentState = 'pendente'|'pago'|'cancelado'

export type Payment = {                 // pagamento de reserva (como no protótipo)
  id: string; reservationId: string; kind: PaymentKind; method: PaymentMethod
  amount: number; state: PaymentState; paidAt: string|null; dueAt: string|null /* aaaa-mm-dd, pendente */
  reference: string|null; notes: string|null; createdBy: string
  refundOf?: 'caucao'|'receita'  // proposta: só para kind='estorno'
}
export type PayStatus = 'nao_pago'|'parcial'|'pago'
export const PAYSTATUS: Record<PayStatus,{label:string; tone:Tone}> = {
  nao_pago:{label:'Não pago',tone:'red'}, parcial:{label:'Parcial',tone:'amber'}, pago:{label:'Pago',tone:'green'} }
export type ReservationBalance = { devido:number; pago:number; caucao:number; due:number; status:PayStatus }

export type FinCategoryType = 'receita'|'despesa'
export type FinCategory = {              // proposta
  id: string; name: string; type: FinCategoryType; color: string
  isSystem: boolean; archived: boolean; usageCount?: number
}

export type Recurrence = 'nenhuma'|'semanal'|'mensal'|'anual'
export const RECURRENCE: Record<Recurrence,string> = { nenhuma:'Não se repete', semanal:'Semanal', mensal:'Mensal', anual:'Anual' }
export type PayableStatus = 'aberta'|'paga'|'cancelada'            // 'vencida' é derivado
export const PAYABLE_STATUS = { aberta:{label:'Em aberto',tone:'amber'}, vencida:{label:'Vencida',tone:'red'},
  paga:{label:'Paga',tone:'green'}, cancelada:{label:'Cancelada',tone:'stone'} } as const
export type Payable = {                   // substitui `expense` do protótipo
  id: string; description: string; supplier: string|null; categoryId: string
  amount: number; dueDate: string; status: PayableStatus
  paidAt: string|null; paidAmount: number|null; method: PaymentMethod|null
  recurrence: Recurrence; recurrenceEnd: string|null; recurrenceParentId: string|null
  source: 'manual'|'operacao'|'aquisicao'
  garmentId: string|null; maintenanceId: string|null; reservationId: string|null
  notes: string|null; createdBy: string; createdAt: string
}

export type ReceivableStatus = 'aberto'|'parcial'|'pago'|'cancelado'   // 'vencido' derivado
export const RECEIVABLE_STATUS = { aberto:{label:'Em aberto',tone:'amber'}, vencido:{label:'Vencida',tone:'red'},
  parcial:{label:'Parcial',tone:'amber'}, pago:{label:'Recebida',tone:'green'}, cancelado:{label:'Cancelada',tone:'stone'} } as const
export type Receivable = {                // linha unificada (view): parcelas da reserva + avulsos
  id: string; source: 'reserva'|'avulso'
  kind: PaymentKind|'avulso'            // sinal | saldo | multa | caucao | avulso
  description: string; categoryId: string|null
  reservationId: string|null; reservationCode: string|null
  customerId: string|null; customerName: string|null; payerName: string|null
  amount: number; paidAmount: number; dueDate: string
  status: ReceivableStatus; receivedAt: string|null; method: PaymentMethod|null
  isCustody: boolean                    // true para caução
  notes: string|null
}

export type FinanceRange = '30'|'90'|'365'
export type FinanceOverview = {
  range: FinanceRange; from: string; to: string
  received: number; receivedCount: number
  toReceive: number; toReceiveReservations: number
  paid: number | null                       // requer consolidated
  operatingCost: number | null; operatingMargin: number | null  // 1 - oper/received, null se received = 0
  acquisitionInvested: number | null
  result: number | null; operatingResult: number | null
  custody: number
  monthly: { k: string; v: number; paid?: number|null }[]       // 12 meses
  byMethod: { method: PaymentMethod; label: string; total: number; count: number }[]
  receivableRows: { reservationId: string; code: string; customerName: string; pickupDate: string; devido: number; due: number }[]
  pendingCharges: { kind: PaymentKind; customerName: string; notes: string|null; amount: number }[]
  latest: { paidAt: string; reservationId: string|null; code: string|null; customerName: string|null; kind: PaymentKind; method: PaymentMethod; amount: number }[]
}
```
Erros sugeridos: `DESCRICAO_OBRIGATORIA`, `CATEGORIA_OBRIGATORIA`, `VALOR_INVALIDO`, `VENCIMENTO_OBRIGATORIO`, `DATA_FUTURA`, `VALOR_EXCEDE_SALDO`, `CATEGORIA_DUPLICADA`, `CATEGORIA_EM_USO`, `CATEGORIA_SISTEMA`, `RECORRENCIA_FIM_INVALIDO`.

Tons de pill: green/amber/wine/indigo/teal/ochre/stone/red; texto sempre presente.

## 2.6 Permissões (catálogo `src/auth/permissions.ts`)

| Elemento | Permissão |
|---|---|
| Ver `/financeiro` (Recebido, A receber, Caução, Formas de pagamento, Últimos lançamentos, tabela A receber) | `financeiro.view` |
| Tiles Pago, Resultado, Custo operacional, Margem, Investido em acervo, gráfico de resultado | `financeiro.consolidated` |
| Lançar pagamento / registrar pagamento de parcela de reserva, devolver caução | `financeiro.payment` |
| `/financeiro/receber`, `/financeiro/pagar`, `/financeiro/categorias` (ver, criar, editar, baixar, excluir) | `financeiro.geral` |
| Alerta de dashboard "Pagamento pendente" | `financeiro.view` |
| Valores de receita por peça na reserva | `financeiro.view` |
| Custo de aquisição/payback na ficha da peça | `acervo.cost` |

Atendimento (design 3.8): `financeiro.view` + `financeiro.payment` (ver e lançar pagamentos da reserva); **sem** `financeiro.consolidated` nem `financeiro.geral` → não vê contas a pagar, categorias, resultado nem custos. Administrador: tudo. Quando só `financeiro.view`: submenu oculto, apenas Visão geral reduzida. A autorização real é do banco (`has_perm` nas RPCs/RLS); front só esconde.

## 2.7 Dados de exemplo (fixture Financeiro)

Seed do protótipo (PRNG com semente `20260913`):
- Parâmetros: `late_fee_daily_percent` 20, `deposit_percent` 0 (caução padrão; no sistema real, `min_signal_percent` 50), `discount_limit_percent` 15.
- Acervo de ~60 peças (cada uma com despesa `aquisicao` no `acquired_at`, valor = custo de aquisição, ex.: Gênova 2.200 / ref. 5.700 / locação 690; Urbino 1.300 / 3.300 / 470; Nápoles 720 / 1.800 / 280; Carrara 620 / 1.600 / 180), fornecedor "Aquisição de acervo", descrição "Compra da peça".
- Sete meses de locações finalizadas, cada uma com: pagamento `sinal` = 50% do líquido (`round(net*0.5)`), forma sorteada entre pix (2×), crédito, débito, dinheiro, link, pago na criação da reserva; pagamento `saldo` = restante, mesma forma, pago na data de retirada às 10:30; desconto às vezes (percentual sorteado). Códigos de reserva `RS-{ano}-{0001...}`.
- Despesas operacionais por locação (ver 1.7) → base do "Custo operacional".
- Casos de teste fixos: reserva multi-peça com `sinal` de R$ 400 (pix, há 9 dias) e saldo em aberto; reserva parcial com `integral` pago e **multa pendente** de `20% × valor × 1 dia` ("1 dia(s) de atraso · 1 peça(s) ainda na rua", vencimento hoje); reserva com autorização de exceção (sinal = metade da locação, há 11 dias); reservas de risco com `integral` e `sinal` de R$ 325 (casamento civil) e retiradas em D+2/D+3 (aparecem em vermelho em "A receber"); reserva "Lecce" paga integral.
- **Fixture sugerida para as novas telas (proposta)**: categorias de sistema + livres acima; ~8 contas a pagar (aluguel mensal recorrente R$ 3.200 dia 5; energia R$ 380 recorrente; internet R$ 140 recorrente; contador R$ 450 mensal; 1 vencida há 3 dias; 1 paga hoje; 1 vencendo em 5 dias; 1 única de marketing R$ 600); 3 receitas avulsas (venda de clutch R$ 120 recebida; aluguel de espaço fotográfico R$ 300 em aberto; uma vencida); parcelas de reserva derivadas das reservas ativas do seed (saldo com vencimento = retirada).
- Usuários do seed: Beatriz Mourão (Administradora), Larissa Camargo (gestora), Yasmin Prado e Renata Aguiar (atendimento; Renata sem `reserva.cancel`), Cleide Barros e Dandara Vilela (operação; Dandara com `acervo.cost` extra). No sistema real só existem os papéis Administrador e Atendimento.
