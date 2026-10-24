# Telas: Agenda + Provas

Fonte: `SenzieOS_v0.2_3.html` (`UI.VIEWS.agenda` ~4297, `UI.VIEWS.provas` ~7138, `E.agendaFor` ~2154, `E.*Fitting*` ~2297–2404, `SZ.FITTING_STATE`/`SZ.FIT_OUTCOME` ~786–805, seed ~3456–3577 e ~3249–3304) + `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (seção 3 prevalece). Tipos já existentes (`src/data/types.ts`): `Garment`, `Customer`, `CustomerInput`, `CustomerMeasurement`, `CustomerFavorite`, `SizeEquiv`, `SourceError`. Não redefinir.

Convenções do protótipo usadas abaixo: datas puras `aaaa-mm-dd`, instantes ISO; exibição `dd/mm` (`fd`), `dd/mm/aaaa` (`fdy`), `HH:MM` (`ftime`), `dd/mm HH:MM` (`fdt`), "terça, 5 de maio" (`fdweek`, dia da semana minúsculo e mês por extenso minúsculo); `R$ 1.250` (`brl0`, sem centavos); porcentagem sem casas (`pct`, ex. `42%`). Busca sempre sem acento e sem diferenciar maiúsculas (`norm`). Nome da empresa: "Senzi".

---

## 1. Telas e rotas

| Rota | Tela | Para que serve | Permissão de entrada |
|---|---|---|---|
| `/agenda` | Agenda geral | Kanban por dia dos compromissos (automáticos + manuais) e do que o acervo está fazendo. | `agenda.view` |
| `/agenda?data=aaaa-mm-dd` (sugerido) | Agenda aberta num dia | Destino do clique no mini calendário do Dashboard (spec 3.1): rola e centra a coluna do dia. | `agenda.view` |
| `/provas` | Lista de provas | KPIs de conversão, filtro por situação, tabela das sessões. | `prova.view` |
| `/provas/:id` | Ficha da prova | Cliente, peças separadas, resultado por peça, observações, encerrar, gerar reserva. | `prova.view` |
| modal | Novo compromisso | (NOVO, spec 3.2) criar compromisso manual. | `agenda.manage` |
| modal | Agendar prova | Criar sessão de prova (exige cliente completa, spec 3.4). | `prova.manage` |
| modal | Separar peça para a prova | Escolher peças do acervo para a sessão. | `prova.manage` |
| modal | Observação da prova | Nota por peça + "precisa de ajuste". | `prova.manage` |
| modal | Encerrar prova | Fechar sessão sem conversão / concluída / no-show. | `prova.manage` |

No protótipo "Agendar prova" também é disparado da ficha da cliente (aba Provas, botão "Agendar", já com a cliente pré-selecionada) e a agenda do Dashboard ("Agenda de hoje") usa `E.agendaFor(hoje)` com botão "Abrir prova". Essas entradas devem existir (a aba Provas da ficha da cliente e a aba Provas da ficha da peça pertencem a outros specs, mas consomem os mesmos dados — ver 4.9).

---

## 2. Layout por tela

### 2.1 Agenda (`/agenda`)

**Mudanças do spec sobre o protótipo (3.2)**
- Protótipo: três visões (Dia / Semana / Mês) com grade de colunas, semana começando no domingo. NOVO: **um único kanban por dia, 4 colunas visíveis por vez**, os demais dias por **rolagem horizontal com snap por coluna e setas**; **abre centrado em hoje**; **semana começa na segunda, domingo é o último dia**.
- Protótipo não tem botão de criar compromisso. NOVO: **Novo compromisso** (ver 3.1).
- Pré-reserva removida: não existe bloco/tipo "Pré-reserva" na agenda.
- O seletor Dia/Semana/Mês e a grade mensal do protótipo ficam fora do kanban. Decisão sugerida: remover o seletor; manter navegação por setas/“Hoje”. Se quiser conservar a visão mensal, ela era uma grade 7 colunas (seg..dom agora) com até 3 etiquetas por dia (`HH:MM` + 6 primeiras letras do rótulo) e "+N" (ver 2.1.5). Não é exigida pelo spec.

**Cabeçalho**
- Título `Agenda`; subtítulo = período visível, primeira letra maiúscula (protótipo: semana `dd/mm – dd/mm/aaaa`; mês `Outubro de 2026`). No kanban: mostrar o intervalo dos 4 dias visíveis no mesmo formato `dd/mm – dd/mm/aaaa`.
- Ações à direita: `‹` (aria-label "Anterior"), botão `Hoje`, `›` (aria-label "Próximo"), e botão primário `+ Novo compromisso` (só com `agenda.manage`).
- `‹`/`›` movem a janela visível (sugestão: 1 coluna por clique ou 4; o snap alinha à coluna). `Hoje` recentra em hoje (no protótipo `Hoje` zera a data base).

**Filtro por tipo (chips, acima do kanban)**: `Todos` + um chip por tipo de compromisso, na ordem: `Prova`, `Retirada`, `Devolução`, `Atendimento`, `Evento`, `Serviço` (+ NOVO `Interno`, ver 4.1). Um chip ativo por vez (classe `on`); filtra os cartões de todos os dias por `kind`. Padrão: `Todos`. Não filtra os blocos de acervo (2.1.3).

**Coluna de dia (cartão)**
- Topo: eyebrow com 3 primeiras letras do dia (`seg`, `ter`, `qua`, `qui`, `sex`, `sáb`, `dom` — `DIAS[dow].slice(0,3)`), título `dd/mm` (fonte display 15px). Se for hoje: pill `hoje` (tom wine) e contorno de destaque (acento 1.5px).
- Corpo (mín. altura 120px, itens com espaço 7px):
  - Lista de compromissos do dia (`E.agendaFor(dia)` filtrada), ordenada por horário crescente. Cada cartão: borda esquerda 2.5px na cor do tipo; linha 1 horário `HH:MM` (mono, pequeno, apagado); linha 2 rótulo do tipo (12.5px, peso 550); linha 3 nome da cliente, ou, sem cliente, o `title` do compromisso (pequeno, apagado). Clique: se tem reserva vai a `/reservas/:id`; senão se tem cliente vai a `/clientes/:id`; senão sem ação. **Ajuste sugerido**: se `kind = prova` e tem sessão, ir a `/provas/:id` (o protótipo da agenda não faz isso, mas o Dashboard sim: destino = prova > reserva > cliente).
  - Sem compromissos: texto `—`.
  - **Compromissos concluídos** (`state = concluido`) aparecem (só `cancelado` é omitido); o Dashboard os marca com classe `done`. Aplicar visual esmaecido/riscado no kanban.
  - **Cartão Interno** (NOVO): visual distinto (ex.: fundo tracejado/neutro, ícone de casa/empresa e rótulo `Interno`), cliente opcional; mostra título/observação no lugar do nome.
  - Rodapé de blocos de acervo (se houver; ver 2.1.3).

**2.1.3 Blocos do acervo no dia** — abaixo dos compromissos, separado por linha tracejada: para cada bloco de calendário de peça **ativo** (não liberado) cujo intervalo inclui o dia (`start_date <= dia <= end_date`) e `kind` em `higienizacao`, `manutencao`, `ajuste`, `bloqueio_manual`, `editorial` (locação e inspeção NÃO entram): linha pequena na cor do tipo `CÓDIGO · Rótulo` (código em mono), clique leva a `/acervo/:garmentId`. Máximo 4 linhas; se houver mais: `+N peças` (N = total − 4). Rótulos: Higienização, Manutenção, Ajuste, Bloqueio, Editorial.

**2.1.5 Visão mensal (opcional, só se mantida)**: cabeçalho de dias `seg ter qua qui sex sáb dom` (protótipo era `dom…sáb`); células vazias de padding antes do dia 1 = índice do dia da semana Monday-first; cada dia mostra o número, até 3 tags `HH:MM Xxxxxx` (cor do tipo, fundo `-bg`) e `+N` se passar de 3; célula de hoje marcada.

**Estado vazio**: não há texto de estado vazio na agenda (cada coluna mostra `—`).

### 2.2 Provas — lista (`/provas`)

- Cabeçalho: título `Provas`; subtítulo `{N} sessões · {taxa} de conversão` (N = total de sessões, taxa = 4.4). Botão primário `+ Agendar prova` (só `prova.manage`) abre o modal 3.2.
- 4 tiles (cartões de KPI):
  1. `Em aberto` = nº de sessões `agendada` ou `em_curso`; legenda `agendadas ou em curso`.
  2. `Convertidas` = nº `convertida`; legenda `viraram reserva`.
  3. `Sem conversão` = nº `perdida` (não conta `no_show`); legenda `cliente não fechou`.
  4. `Taxa de conversão` = `{pct}`; legenda `sobre {fechadas} provas encerradas`.
- Chips de filtro (um ativo; padrão `Em aberto`): `Em aberto` (`agendada`+`em_curso`), `Convertidas` (`convertida`), `Sem conversão` (`perdida`+`no_show`), `Todas` (inclui `concluida`; `concluida` só aparece em `Todas`).
- Tabela (ordenada por `scheduled_at` decrescente — mais recente/futura primeiro). Colunas: `Prova` | `Cliente` | `Quando` | `Peças` | `Resultado` | `Situação`.
  - `Prova`: código (mono pequeno), ex. `PR-2026-0004`.
  - `Cliente`: nome (destaque) e embaixo, apagado, o tipo de evento (`event_type` ou vazio); cliente ausente = `—`.
  - `Quando`: `dd/mm HH:MM` (mono).
  - `Peças`: nº de peças separadas (alinhado à direita).
  - `Resultado`: se há peças: `{X} aprovada(s) · {Y} descartada(s)` onde X = itens com outcome `positive === true` e Y = `positive === false`; se não há peças: `sem registro` (apagado). (Itens `nao_provou` não entram em nenhum.)
  - `Situação`: pill com rótulo/tom do estado da prova (4.5).
  - Linha inteira clicável → `/provas/:id`.
- Vazio (filtro sem linhas): título `Nenhuma prova neste filtro`, descrição `Agende uma prova a partir da ficha da cliente ou da agenda.`
- Paginação/busca no servidor (spec seção 5): sugerido paginar a tabela; tiles e taxa vêm de agregação no servidor sobre TODAS as sessões (não só a página).

### 2.3 Provas — ficha (`/provas/:id`)

- Não encontrada: título `Prova não encontrada`, vazio `Prova não encontrada`.
- Cabeçalho: título `Prova {código}`; subtítulo `{Nome da cliente} · {dia da semana, d de mês} às {HH:MM}`. Ações (da esquerda p/ direita), todas só se a prova está **aberta** (`agendada` ou `em_curso`) e `prova.manage`, exceto onde indicado:
  - `+ Gerar reserva` (primário): se há ≥1 peça aprovada (outcome positivo) **e** `reserva.create`. Ação 4.7.
  - `Separar peça` (ícone acervo): abre modal 3.3.
  - `Encerrar prova` (ícone check): abre modal 3.5.
  - Se `reservation_id`: botão-link com o código da reserva → `/reservas/:id` (qualquer estado da prova).
- Faixas de aviso no topo (conforme estado):
  - `convertida` com reserva: nota verde `Prova convertida em reserva.` + link do código da reserva + ` — {cliente da reserva}, evento em {dd/mm/aaaa}.`
  - `perdida`: nota info `Prova encerrada sem conversão.` + `outcome_notes` ou `Sem motivo registrado.`
  - `no_show`: nota vermelha `Cliente não compareceu.` + `outcome_notes`.
  - `concluida`: sem faixa.
- Layout em duas colunas: barra lateral (esq.) + conteúdo (dir.).

**Barra lateral (um cartão)**
- Linha `Situação` + pill do estado.
- Avatar com iniciais da cliente + nome (link `/clientes/:id`) + abaixo `{cidade} · tamanho {usual_size ou —}` (usa a medição mais recente da cliente).
- Lista chave/valor: `Atendente` (nome ou `—`) · `Evento` (tipo ou `—`) · `Data do evento` (`dd/mm/aaaa` ou `—`) · `Orçamento` (`até R$ X` ou `não informado`) · `Medidas` (`busto / cintura / quadril` em cm da medição mais recente, ou `—`).
- Se a cliente tem cores preferidas: nota info (ícone coração) `Prefere {cores em minúsculas separadas por vírgula}` + `; evita {cores evitadas}` + `.` + (se há preferência de modelagem) ` Modelagem {fit_preference}.`
- Até 2 observações fixadas (pinned) da cliente (`customer_interaction.pinned`), texto com barra à esquerda.
- Se `notes` da prova: nota info (ícone editar) com o texto.

**Conteúdo**
- Cartão `Peças separadas`: contador `{n} peça(s) · {m} aprovada(s)`; botão `+ Separar` (aberta + `prova.manage`). Corpo: uma linha por peça (ordenada por `position`) — ver "Linha de peça"; vazio: `Nenhuma peça separada` / `Separe as peças que a cliente vai experimentar.`
- Cartão `O que a cliente disse` (subtítulo `alimenta a inteligência de compra`) — só aparece se algum item tem `note`. Linha do tempo: para cada item com nota: código da peça (mono), marcador na cor do resultado, texto da nota, e embaixo `{nome da peça} · {rótulo do resultado}` + ` · precisa ajuste` se `needs_alteration`.

**Linha de peça** (cartão `ag-item`): miniatura 46×60 (silhueta/foto; clique → `/acervo/:id`); título `{nome} {código}` + coração se é favorita da cliente; sub `{cor} · tam. {labelSize} · R$ {aluguel}` + ` · {rótulo de caimento}` se `fit_runs` (4.5); se há nota: `“{nota}”`. Quando editável (aberta+`prova.manage`): chips de resultado `Favorita`, `Serviu`, `Gostou`, `Precisa ajuste`, `Ficou apertada`, `Ficou larga`, `Não gostou`, `Descartada` (o ativo = `on`; `Não provou` não é chip, é o estado inicial). À direita: pill do resultado atual; botão ícone editar (title `Observação da atendente`, aria `Observação`) → modal 3.4; botão coração (title `Marcar como favorita` / `Remover dos favoritos`, só com `cliente.edit`, alterna favorito manual; toast `Marcada como favorita` / `Removida dos favoritos` com `{código} · {nome}`); botão X (title `Retirar da prova`, aria `Retirar`) remove a peça da prova sem confirmação.

---

## 3. Formulários e modais

### 3.1 Novo compromisso (NOVO — spec 3.2; layout a critério do builder)

Permissão `agenda.manage`. Campos:
| Campo | Tipo | Obrigatório | Padrão | Observação |
|---|---|---|---|---|
| Data | date | sim | dia da coluna clicada/hoje | |
| Horário | time | sim (sugerido) | `09:00` | protótipo usa `HH:MM` |
| Interno | checkbox/flag | não | desmarcado | "compromisso da empresa" |
| Cliente | busca/seleção de cliente existente | **sim, exceto com Interno** | vazio | com Interno é opcional |
| Observação | textarea | não (sugerido: obrigatória com Interno se não houver cliente, para o cartão ter título) | vazio | grava em `notes`; título do cartão = primeira linha/ `Interno` |

Validações sugeridas (mensagens no estilo do protótipo, toast de erro): `Informe a data`, `Informe o horário`, `Selecione a cliente` (quando não Interno). Salvar: insere `appointment` com `kind` (`atendimento` para com cliente; `interno` para Interno — ver 4.1), `state = agendado`, `starts_at = data + 'T' + horário + ':00'`, `customer_id` (ou null), `title`, `notes`, `assigned_to = usuário logado`; fecha modal; recarrega agenda. Este compromisso não vincula reserva nem prova. Edição/cancelamento de compromisso manual: o protótipo não tem; spec diz "Criar e editar compromissos" (`agenda.manage`) — prever editar e cancelar (`state = cancelado`) apenas dos manuais.

### 3.2 Agendar prova (modal; título `Agendar prova`, sub `A prova não bloqueia o calendário das peças — ela registra o que a cliente experimentou`)

Campos (grade 2 colunas; `*` = obrigatório):
| Rótulo | Tipo | Obrig. | Padrão | Notas |
|---|---|---|---|---|
| `Cliente *` | select (protótipo, `— selecionar —`, ordenado por nome, `{nome} · {código}`) | sim | cliente pré-selecionada se veio da ficha da cliente | **MUDA (spec 3.4)**: busca de cliente existente (nome/CPF/telefone/código, server-side) OU cadastro ali mesmo |
| `Data *` | date | sim | amanhã (hoje + 1) | |
| `Horário` | time | não | `15:00` | vazio ⇒ `15:00` |
| `Atendente` | select de usuários ativos | não | usuário logado | |
| `Evento pretendido` | texto com sugestões (datalist) | não | — | placeholder `Casamento`; sugestões: Casamento, Formatura, Aniversário, Festa corporativa, Baile de gala, Casamento civil, Premiação |
| `Data do evento` | date | não | — | |
| `Orçamento até (R$)` | número (min 0, passo 10) | não | — | placeholder `900`; 0/vazio ⇒ null |
| `Observações` | textarea | não | — | placeholder `Quer ver longos em tons neutros. Só consegue vir depois das 19h.` |

Rodapé: `Cancelar` · `Agendar prova` (primário).

**Cadastro de cliente na hora (NOVO, spec 3.4)**: ação `Cadastrar nova cliente` no campo Cliente abre sub-formulário/seção com `Nome`, `Telefone`, `Nascimento`, `CPF`, todos **obrigatórios**. Validação (de `CustomerInput`/`SourceError`): `NOME_CLIENTE_OBRIGATORIO`, `TELEFONE_INVALIDO`, `NASCIMENTO_INVALIDO`, `CPF_INVALIDO` (dígito verificador), `CPF_DUPLICADO` (único) — textos pt-BR em `src/lib/errorMessages.ts`. Telefone/CPF aceitos com ou sem máscara, gravados só com dígitos. Não existe pré-cadastro/lead: a prova só é criada com cliente completa. Cliente cadastrada ali já fica selecionada.

Validação do formulário (toasts de erro, título + descrição):
- sem cliente: `Selecione a cliente`
- sem data: `Informe a data`
- `Data do evento` < `Data` da prova: `Datas incoerentes` / `O evento não pode ser antes da prova.`

Salvar: `E.createFitting` (4.2); toast ok `Prova agendada` / `{código} · dd/mm`; fecha modal; navega para `/provas/:id`. Permite escolher a prova mesmo no passado (sem validação).

### 3.3 Separar peça para a prova (modal largo; título `Separar peça para a prova`, sub `{código} · a peça não fica bloqueada — prova não ocupa calendário`)

- Campo de busca `Buscar por código, nome ou cor…` (debounce 260ms). Texto de apoio: com busca `busca livre`; sem busca e cliente com tamanho usual: `filtrado pelo tamanho {X} da cliente`; senão `todo o acervo`.
- Lista (rolável, máx. 320px, até 40 itens, ordenada por código): peças não baixadas, fora as já separadas nesta prova. Sem busca e com tamanho usual da cliente: só `size_equiv === usual_size`. Com busca: filtra por `código nome cor tecido` (sem acento) em todo o acervo (ignora tamanho). Cada linha: miniatura 34×44, `{nome} {código}`, `{cor} · tam. {labelSize} · R$ {aluguel}`, pill do estado da peça (qualquer estado, inclusive alugada — não bloqueia). Vazio: `Nada encontrado.`
- Clicar numa linha adiciona a peça (toast `Peça separada` / `{código} · {nome}`), modal permanece aberto atualizado. Rodapé: `Concluir` fecha.
- Peça duplicada na mesma prova: ignorada.

### 3.4 Observação da prova (título `Observação da prova`, sub `{código} · {nome}`)
- `O que a cliente disse ou a atendente observou` (textarea, placeholder `Marcando muito a cintura. Gostou do comprimento, mas quer sem manga.`), pré-preenchida com a nota atual.
- Checkbox `Precisa de ajuste para servir` (pré-marcado conforme `needs_alteration`).
- `Cancelar` / `Salvar`. Salvar chama `setFittingOutcome` mantendo o outcome atual (ver 4.3), grava nota + needs_alteration; toast `Observação registrada` / `Ela aparece na ficha da peça e da cliente.`

### 3.5 Encerrar prova (título `Encerrar prova`, sub `{código}`)
- Se há itens `nao_provou`: nota âmbar `{N} peça(s) sem resultado registrado.` + `Sem isso a Inteligência não consegue dizer o que encanta e não converte.` (não bloqueia).
- `Como terminou` (select): `Sem conversão — cliente não fechou` (`perdida`, padrão/primeiro) · `Concluída — decisão pendente` (`concluida`) · `No-show — cliente não compareceu` (`no_show`).
- `Motivo / observação` (textarea, placeholder `Achou o preço acima do orçamento. Vai pensar até sexta.`; opcional).
- `Cancelar` / `Encerrar`. Toast `Prova encerrada` / `{código}`.

### 3.6 Gerar reserva (a partir da prova)
Sem modal próprio: abre o fluxo "Nova reserva" (outro spec) pré-preenchido com: cliente da prova; peças aprovadas (outcome positivo, na ordem da prova); `fitting = id da prova`; tipo e data do evento da prova. Ao criar a reserva, o fluxo chama `linkFittingToReservation` (4.7). **Mudança (spec 3.3)**: a reserva nasce como `rascunho`; a prova vira `convertida` no momento em que a reserva é criada (como no protótipo, linha 6107), não só na confirmação.

---

## 4. Regras e cálculos

### 4.1 `E.agendaFor(date)` — itens da agenda de um dia
- Entrada `aaaa-mm-dd`. Percorre todos os `appointment` com `starts_at` (ISO local) cujos 10 primeiros caracteres = data e `state !== 'cancelado'` (concluídos e no_show aparecem).
- Para cada um devolve: `id`, `time` (`HH:MM` de `starts_at`), `kind`, `customer` (por `customer_id` ou null), `reservation` (por `reservation_id` ou null), `garments` (peças dos itens da reserva — via `reservation_item`; vazio sem reserva), `fitting` (por `fitting_id`), `title` (`title` ou `kind`), `state`, `appointment`. Ordenado por `time` crescente (string).
- **Os compromissos automáticos NÃO são derivados em leitura: são linhas `appointment` criadas pelos eventos de negócio** (spec: "continuam sendo gerados pelo sistema"):
  - Criar prova → `appointment kind=prova`, `title='Prova'`, `starts_at = scheduled_at`, `fitting_id`, `assigned_to = atendente`, `notes = notes da prova`.
  - Criar reserva → se há `event_date`: `kind=evento`, `starts_at = event_date T19:00:00`, `title = event_type || 'Evento'`; sempre `kind=retirada`, `T10:00:00`, `title='Retirada'` (data = `pickup_date`); sempre `kind=devolucao`, `T11:00:00`, `title='Devolução'` (data = `return_due_date`). Todos com `reservation_id` e `customer_id`, `state=agendado`.
  - Cancelar reserva → seus `appointment` com `state=agendado` viram `cancelado` (somem da agenda).
  - Retirada: appointments `retirada` agendados da reserva viram `concluido` quando todos os itens foram retirados (retirada parcial os mantém `agendado`). Devolução: `devolucao` agendado vira `concluido` quando a devolução é completa.
  - Prova encerrada/convertida: ver 4.2.
- Compromissos manuais (`atendimento`, `servico`; NOVO `interno`): criados pela tela. No protótipo só existiam no seed (ex.: `Atendimento — primeira visita`, `Coleta da lavanderia`).
- Estados do appointment: `agendado`, `concluido`, `cancelado`, `no_show`. Só a agenda do Dashboard marca `concluido` como `done` esmaecido.

**`E.AG_KIND`** (rótulo / tom):
| kind | Rótulo | Tom |
|---|---|---|
| `prova` | Prova | indigo |
| `retirada` | Retirada | wine |
| `devolucao` | Devolução | teal |
| `atendimento` | Atendimento | stone |
| `evento` | Evento | amber |
| `servico` | Serviço | ochre |
| `interno` (NOVO) | Interno | sugestão: stone com borda tracejada ou tom próprio (aprovar na prévia visual) |

### 4.2 `E.createFitting(input)` — criar prova
- Código `PR-{ano corrente}-{seq 4 dígitos}`: seq = (nº de sessões cujo código contém o ano) + 1 (no banco usar sequência/contagem por ano atômica).
- Cria `fitting_session`: `state='agendada'` (ou `input.state`), `scheduled_at` (`aaaa-mm-ddTHH:MM:00`), `started_at=null`, `ended_at=null`, `attendant_id` (padrão: usuário logado), `event_type`, `event_date`, `budget`, `notes` (nulos se vazios), `outcome_notes=null`, `reservation_id=null`, `created_by`.
- Adiciona peças iniciais se `garment_ids` (posição = índice) — a tela não usa isso ao agendar.
- Cria o `appointment` `prova` (4.1). Prova **não** cria bloco no calendário da peça e não muda estado de peça/cliente.

### 4.3 Itens da prova
- `addFittingGarment(fitting, garment, position)`: ignora duplicata (retorna null); cria `fitting_item` com `outcome='nao_provou'`, `needs_alteration=false`, `note=null`, `position` (padrão 0), `recorded_by/at = null`. Obs.: a tela não atribui posições crescentes (todas 0): usar `max(position)+1` no sistema novo.
- `removeFittingGarment`: apaga o item (sem validação de estado).
- `setFittingOutcome(fitting, garment, {outcome, needs_alteration, note})`: atualiza o item (`needs_alteration` boolean; `note` ou null — **sobrescreve a nota**: o clique num chip de resultado envia sem `note`, o que **apaga a nota existente**; no sistema novo preservar a nota quando não enviada), `recorded_by = usuário`, `recorded_at = agora`. **Transição**: se a prova está `agendada` → vira `em_curso` com `started_at = agora` (qualquer resultado registrado inicia a prova). Se `outcome === 'favorita'`: `setFavorite(customer, garment, true, 'prova', note)` — cria `customer_favorite` com `source='prova'` (se já existe, só atualiza nota/fonte; **desfavoritar não ocorre ao trocar o resultado para outro**).
- O chip `Precisa ajuste` envia `needs_alteration=true`; os demais chips enviam `false` (apaga a marca). No modal de observação o checkbox define o flag livremente.
- Modal de observação em item `nao_provou`: o protótipo grava `outcome = it.outcome` (permanece `nao_provou`), não `gostou`; só o fallback `gostou` vale para item inexistente. Manter `nao_provou`.

### 4.4 Taxa de conversão (lista de provas)
- `fechadas` = sessões com estado `convertida`, `perdida` ou `no_show` (NÃO `concluida`, NÃO abertas). `taxa = convertidas / fechadas` (0 se não há fechadas). Exibida `pct` sem decimais. No-show conta como fechada e não-convertida. A Inteligência recalcula o mesmo indicador por período.

### 4.5 Tabelas de enumeração
**`SZ.FITTING_STATE`** (estado da sessão): `agendada` Agendada (indigo) · `em_curso` Em curso (amber) · `concluida` Concluída (teal) · `convertida` Convertida (green) · `perdida` Sem conversão (stone) · `no_show` No-show (red). Aberta = `agendada|em_curso`.

**`SZ.FIT_OUTCOME`** (resultado da peça na prova): rótulo / tom / ícone / `positive`
- `favorita` Favorita / wine / coração / true
- `serviu` Serviu / green / check / true
- `gostou` Gostou / green / check / true
- `precisa_ajuste` Precisa ajuste / ochre / costura / true
- `apertada` Ficou apertada / amber / alerta / false
- `larga` Ficou larga / amber / alerta / false
- `nao_gostou` Não gostou / stone / x / false
- `descartada` Descartada / red / x / false
- `nao_provou` Não provou / stone / relógio / **null** (neutro; estado inicial)

**`SZ.FIT_RUNS`** (caimento da peça, mostrado na linha de peça): `menor` "Veste menor que a etiqueta" · `fiel` "Veste fiel à etiqueta" · `maior` "Veste maior que a etiqueta" (`Garment.fitRuns`).

**`SZ.BLOCK_KIND`** (blocos do acervo; sem `pre_reserva`): `locacao` Locação wine LOC · `higienizacao` Higienização teal HIG · `inspecao` Inspeção teal INSP · `ajuste` Ajuste ochre AJU · `manutencao` Manutenção ochre MAN · `bloqueio_manual` Bloqueio stone BLQ · `editorial` Editorial indigo EDIT. Na agenda só aparecem os cinco listados em 2.1.3. Tipo `BlockKind` já existe em `types.ts`.

**Tons** (`--t-{tom}` e `--t-{tom}-bg`): wine, indigo, green, teal, amber, ochre, red, stone — dessaturados na nova paleta (spec 6), sempre com rótulo textual.

### 4.6 `E.closeFitting(fitting, state, outcome_notes)` — encerrar
- Define `state` ∈ {`perdida`, `concluida`, `no_show`} (a tela só oferece esses), `ended_at = agora`, `outcome_notes = informado || o existente`. Auditoria "Prova encerrada como {rótulo}".
- Appointments `prova` da sessão com `state=agendado`: viram `no_show` se a prova é no_show, senão `concluido`.
- Sem validação de peças sem resultado (só aviso na tela). Só disponível para provas abertas.
- Quirk: `concluida` ("decisão pendente") sai da lista "Em aberto", não é "fechada" para a taxa, e a ficha deixa de oferecer `Gerar reserva`/editar. Se se quiser permitir converter depois, reabrir é decisão nova (não existe no protótipo).

### 4.7 `E.linkFittingToReservation(fitting, reservation)` — conversão
- Chamado ao criar a reserva vinda da prova: `reservation_id = reserva`, `state='convertida'`, `ended_at = agora` (auditoria "Prova convertida em reserva"); appointment `prova` agendado → `concluido`.
- **O que muda em peças/clientes**: nada de estado de peça (prova não bloqueia). Na cliente: favoritos criados ao marcar `favorita` (`source='prova'`); medidas e preferências não são alteradas pela prova. Na peça: a prova alimenta `fittingStats` (4.8) e a aba Provas da ficha da peça.
- Peças aprovadas = itens com outcome `positive===true` (favorita, serviu, gostou, precisa_ajuste), enviadas ao fluxo de reserva; o usuário pode ajustar lá. Se a reserva é cancelada depois, a prova continua `convertida` (o protótipo não reverte).

### 4.8 `E.fittingStats(garmentId)` — conversão por peça (usada na ficha da peça, lista de acervo e Inteligência)
- `tried` = itens da peça com `outcome !== 'nao_provou'`. `converted` = nº de itens de `tried` cuja sessão tem `reservation_id` e essa reserva contém a peça (`reservation_item`). `rate = converted/fittings` (null se 0). `favorites` (outcome favorita), `discards` (`descartada` + `nao_gostou`), `alterations` (`needs_alteration` ou `precisa_ajuste`), `reasons` = últimas 4 notas (`{outcome, note}`). `apertada`/`larga` entram em `fittings`, não em `discards`.
- Regras de leitura da Inteligência: "muito provada, pouco alugada" = ≥4 provas e (rate nulo ou <35%); alerta na ficha: rate <30% com ≥4 provas.

### 4.9 Alerta e busca que dependem de provas
- `E.alerts` "prova_sem_resultado": para cada sessão aberta com data ≤ hoje: severidade `atencao` se a data é anterior a hoje, `info` se é hoje; título `Prova de {cliente} sem resultado registrado`; detalhe `{código} · dd/mm HH:MM` + ` · {n} peça(s) sem avaliação` se há itens `nao_provou`; rota `/provas/:id`.
- Busca global: tipo `Prova`, label `{código} · {cliente}`, sub `{estado} · dd/mm HH:MM · {n} peça(s)`; casa por código, nome da cliente ou código/nome de qualquer peça; rota `/provas/:id`.
- Aba Provas da ficha da cliente: lista de sessões (desc.), cada uma com código (link), `dd/mm/aaaa · {evento}`, pill do estado, chips `{nome da peça} — {rótulo do resultado}` (link da peça, tooltip = nota), `outcome_notes` abaixo, e botão `+ Agendar` (pré-seleciona a cliente). Vazio: ver spec Clientes.
- Dashboard "Agenda de hoje": mesmos itens de `agendaFor(hoje)`, botões contextuais `Retirar` (retirada com itens pendentes + `reserva.pickup`), `Devolver` (devolução com itens retirados + `reserva.return`), `Abrir prova` (`prova.view`). Vazio: `Nenhum compromisso hoje` / `A agenda aparece aqui automaticamente ao criar reservas e provas.`; botão `Ver semana`.

### 4.10 Regras de data
- Semana Monday-first: índice do dia = `(getDay()+6) % 7` (0=segunda … 6=domingo). Início da semana de uma data = data − índice. Tudo em `America/Araguaina` (UTC−3). Evitar `toISOString` para datas puras (bug do dia a menos): montar `aaaa-mm-dd` pelos componentes locais.
- "Abrir centrado em hoje": com 4 colunas visíveis, posicionar o scroll de modo que hoje fique entre as colunas centrais (ex.: hoje na 2ª ou 3ª coluna visível); janela total sugerida: ~±30 dias (carregar mais ao rolar/seta) com snap por coluna.

---

## 5. Dados necessários

```ts
// NOVOS (Agenda + Provas)
export type AppointmentKind = 'prova' | 'retirada' | 'devolucao' | 'atendimento' | 'evento' | 'servico' | 'interno'
export type AppointmentState = 'agendado' | 'concluido' | 'cancelado' | 'no_show'

export type Appointment = {
  id: string
  kind: AppointmentKind
  /** instante ISO local; a agenda agrupa pelos 10 primeiros caracteres (data) */
  startsAt: string
  title: string | null            // "Prova", "Retirada", "Devolução", nome do evento, texto livre
  notes: string | null
  state: AppointmentState
  customerId: string | null       // obrigatório se kind != 'interno' (manual) ; opcional se interno
  reservationId: string | null
  fittingId: string | null
  garmentId: string | null        // usado em alguns seeds de retirada/devolução
  assignedTo: string | null       // userId
  /** NOVO: compromisso da empresa */
  internal: boolean               // true <=> kind === 'interno'
  createdBy: string | null
}

/** Item da agenda já resolvido para a tela (retorno de agendaFor) */
export type AgendaItem = {
  id: string; time: string /* HH:MM */; kind: AppointmentKind
  customer: Pick<Customer, 'id' | 'fullName'> | null
  reservation: { id: string; code: string } | null
  fitting: { id: string; code: string } | null
  garments: Pick<Garment, 'id' | 'code' | 'name'>[]
  title: string; notes: string | null; state: AppointmentState; internal: boolean
}

/** Bloco do acervo exibido no rodapé do dia (não é compromisso) */
export type AgendaGarmentBlock = { garmentId: string; garmentCode: string; kind: Extract<BlockKind,'higienizacao'|'manutencao'|'ajuste'|'bloqueio_manual'|'editorial'> }

export type FittingState = 'agendada' | 'em_curso' | 'concluida' | 'convertida' | 'perdida' | 'no_show'
export type FitOutcome = 'favorita' | 'serviu' | 'gostou' | 'precisa_ajuste' | 'apertada' | 'larga' | 'nao_gostou' | 'descartada' | 'nao_provou'

export type FittingSession = {
  id: string
  code: string                    // PR-2026-0001
  customerId: string              // cliente completa (nome, telefone, nascimento, CPF)
  state: FittingState
  scheduledAt: string             // ISO
  startedAt: string | null
  endedAt: string | null
  attendantId: string | null
  eventType: string | null
  eventDate: string | null        // aaaa-mm-dd
  budget: number | null           // R$ (numeric(12,2))
  notes: string | null
  outcomeNotes: string | null
  reservationId: string | null    // preenchido na conversão
  createdBy: string | null
}

export type FittingItem = {
  fittingSessionId: string
  garmentId: string               // único por sessão
  position: number
  outcome: FitOutcome             // padrão 'nao_provou'
  needsAlteration: boolean
  note: string | null
  recordedBy: string | null
  recordedAt: string | null
}

export type FittingListRow = FittingSession & {
  customerName: string
  itemCount: number; approvedCount: number; discardedCount: number
}
export type FittingKpis = { open: number; converted: number; lost: number /* só perdida */; closed: number; rate: number /* 0..1 */; total: number }
export type FittingFilter = 'abertas' | 'convertidas' | 'perdidas' | 'todas'
export type AgendaFilter = 'todos' | AppointmentKind

export type FittingGarmentStats = { fittings: number; converted: number; rate: number | null; favorites: number; discards: number; alterations: number; reasons: { outcome: FitOutcome; note: string }[] }
```

Reutilizados de `types.ts`: `Garment` (código, nome, cor `colorPrimary`, `labelSize`, `rentalPrice`, `state`, `fitRuns`, `photos`, `sizeEquiv`), `GarmentState`, `BlockKind`, `Customer` (nome, `birthDate`, `cpf`, `phone`, `city`, `measurements[0]`: `usualSize`, `bustCm`, `waistCm`, `hipCm`; `preferences.preferredColors/avoidedColors`; `interactions` com `pinned`; `favorites`), `CustomerInput` (cadastro inline), `CustomerFavorite` (`source: 'manual' | 'prova'`), `SizeEquiv`, `SourceError`. Observação: o protótipo lê `fit_preference` da preferência da cliente ("Modelagem …"), mas `CustomerPreferences` atual não tem esse campo (tem `sleeve`/`neckline`/`preferredLengths`); decidir se exibir `preferredLengths`/`sleeve` no lugar. Também usa `app_user` (nome do atendente) e `Reservation` (outro spec: id, code, customer, eventDate).

Regras de dados: um `fitting_item` por (sessão, peça); no máximo uma `appointment` `prova` por sessão; excluir sessões nunca (só encerrar). Spec: nenhuma prova sem cliente completa.

---

## 6. Permissões (`src/auth/permissions.ts`)

| Chave | Efeito nestas telas |
|---|---|
| `agenda.view` | Ver `/agenda` e o bloco de agenda do Dashboard. |
| `agenda.manage` | Botão `Novo compromisso`; criar/editar/cancelar compromissos manuais. |
| `prova.view` | Ver `/provas`, `/provas/:id`, botão `Abrir prova` na agenda do Dashboard, aba Provas das fichas. |
| `prova.manage` | `Agendar prova`, `Separar peça`, mudar resultado (chips), observação, retirar peça, `Encerrar prova`. |
| `reserva.create` | Mostrar `Gerar reserva` (além de `prova.manage` e ≥1 aprovada) e executar a conversão. |
| `cliente.create` | Cadastrar cliente dentro do modal Agendar prova (sugerido exigir; o spec não detalha). |
| `cliente.view` | Buscar/ver clientes no seletor; ficha da cliente e link do nome; CPF/telefone só para quem tem. |
| `cliente.edit` | Botão coração (favorita manual) na linha de peça; ação `toggleFav`. |
| `reserva.view` | Navegar para a reserva a partir de cartões/links (`/reservas/:id`). |
| `acervo.view` | Links para a peça (miniatura, bloco do acervo na agenda), busca de peças no modal Separar. |
| `reserva.pickup` / `reserva.return` | Botões `Retirar`/`Devolver` na agenda do Dashboard (não na tela Agenda). |

Atendimento tem `agenda.*` e `prova.*` (spec 3.8); Administrador tudo. Toda checagem tem de existir também no banco (RLS/RPC).

---

## 7. Dados de exemplo (seed do protótipo)

Datas relativas a hoje (`D(n)` = hoje + n dias; `T` = hoje).

**Compromissos (`appointment`)** — ~16 de reservas e extras:
- Hoje: Retirada 10:30 (cliente 5 Firenze), Devolução 14:00 (Ostuni), `Atendimento — primeira visita` 16:00 (obs. "Formatura da filha em dezembro. Ver midi e longo tamanho G."), `Serviço` `Coleta da lavanderia` 17:30 (obs. "2 peças em higienização", sem cliente, atribuído a operação), prova de hoje 09:00 (em curso).
- D+1 retirada 11:00; D+2 retirada 10:00, devolução 11:00 (autorização de exceção), prova agendada 15:00; D+3 retirada 14:00, devolução 10:00; D+6 retirada 09:30; D+7 `Evento` 19:00 `Casamento`; D+9 devolução 11:00; D+12 retirada 10:00; D+19 retirada 10:00.
- Seed deve ter pelo menos um compromisso `interno` (novo) e um dia lotado (>4 cartões) e um dia com ≥5 blocos de acervo para testar `+N peças`.
- Blocos de acervo ativos (higienização/manutenção/ajuste/bloqueio/editorial) vêm do seed do Acervo.

**Provas (`fitting_session`)** — cerca de 17 no total:
1. `PR-…-0001` convertida (D−21 19:30): cliente 0 (Mariana), Casamento (evento D+7), orçamento 1000, reserva vinculada; peças: Verona favorita ("Amou o comprimento e a fenda…"), Amalfi não gostou ("Achou a manga pesada para novembro."), Modena apertada ("Marcou no quadril; não quis ajuste."); `outcome_notes`: "Fechou o Verona na hora."; atendimento: obs. "Trouxe o sapato do evento.".
2. Perdida (D−12 18:00): cliente 9, Premiação, orçamento 700; Portofino favorita ("Apaixonou-se, mas disse que passava do orçamento."), Bolonha gostou, Milano larga (ajuste); `outcome_notes` "Ficou de voltar depois do 13º. Peça favorita R$ 1.250, acima do orçamento de R$ 700."
3. Em curso hoje 09:00: cliente 5, "Jantar de noivado", evento D+25, orçamento 650, obs. "Quer ver midi e curto, tons sóbrios. Executiva, prefere fora do horário comercial."; Siena serviu ("Serviu bem; achou o vermelho forte para o ambiente."), Milano e Bari `nao_provou` (gera alerta "prova sem resultado").
4. Agendada D+2 15:00: cliente 12, "Casamento civil", evento D+10, orçamento 950; Bolonha e Firenze `nao_provou`.
5. Seis provas da peça Milano (cliente 2, 5, 7, 8, 10, 1; datas D−100 + 13·i, 16:00): resultados larga/nao_gostou/apertada/gostou/descartada/precisa_ajuste com notas; as que "converteram" (quando a cliente tem locação finalizada) ficam `convertida` com a outra peça marcada `favorita` ("Provou junto e levou esta."), as demais `perdida` — produz "peça muito provada, nunca alugada".
6. Até cinco convertidas normais (Firenze −60, Lecce −47, Toscana −33, Sorrento −25, Ostuni −17, 18:30), peça única `favorita` "Fechou na prova.", `outcome_notes` "Saiu daqui com a reserva feita.", orçamento ≈ 1,2× aluguel arredondado a 50.
- Cada prova tem seu `appointment` `prova` (`agendado` se agendada, `no_show` se no_show, senão `concluido`) e favoritos `source='prova'` para itens `favorita`. O seed não tem prova `concluida` nem `no_show`: incluir uma de cada no fixture. Atendentes alternam entre os dois usuários de atendimento. Nomes de eventos (`EVENTOS`): Casamento, Formatura, Aniversário de 15 anos, Festa corporativa, …
- Favoritos manuais extras (`source='manual'`): 4 (ex.: cliente 0 Firenze "Salvou no Instagram e pediu para guardar.", cliente 2 Toscana "Quer para o casamento da irmã em dezembro.", cliente 4 Lecce "Marcou na vitrine.", cliente 7 Ostuni "Pediu para avisar quando liberar.").
- Taxa de conversão do seed ≈ convertidas/(convertidas+perdidas+no_show) em torno de 50–60%.
