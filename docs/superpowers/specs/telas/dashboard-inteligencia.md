# Spec de conteúdo — Dashboard + Inteligência

Fonte: `SenzieOS_v0.2_3.html` (`UI.VIEWS['']` 4101–4282; `UI.VIEWS.inteligencia` 6810–7116; motor `E.*` 1218–2700; seed 2710–3615), alterado por `docs/superpowers/specs/2026-10-23-senzi-os-design.md` (§3.1, §3.3, §3.7, §3.8, §4). Tudo em pt-BR; textos entre aspas são literais. Onde o protótipo e o design divergem, vale o design. Marcações: **[proto]** = igual ao protótipo; **[design]** = vem do design doc; **[proposta]** = sugestão deste spec, a confirmar; **[atenção]** = comportamento esquisito do protótipo que o builder deve decidir.

Convenções de data: hoje = data local `America/Araguaina`. `diffDays(a,b) = b − a` em dias inteiros. "Realizada" = reserva em `retirada, em_uso, aguardando_devolucao, devolvida, em_inspecao, finalizada` (REALIZED). "Ativa" = `confirmada, pronta_retirada, retirada, em_uso, aguardando_devolucao` (ACTIVE — **sem** `pre_reserva`/`aguardando_pagamento`, removidos [design]). Peça "do acervo" = estado ≠ `baixado`.

---

## 1. Telas e rotas

| Tela | Rota | Permissão de rota | Item de menu |
|---|---|---|---|
| Dashboard ("Hoje") | `/` | `dashboard.view` | "Dashboard" |
| Inteligência | `/inteligencia` | `inteligencia.view` | "Inteligência" |

Links de saída citados abaixo (rotas do React; o protótipo usa `#/…`):
`/reservas/:id`, `/acervo/:id`, `/clientes/:id`, `/provas/:id`, `/operacao`, `/agenda` (+ dia, ver 2.1), `/financeiro`, `/clientes` (novo, ver 2.1), `/provas` (lista).
Ações do cabeçalho do dashboard abrem modais/rotas existentes: Agendar prova (`prova.manage`), Nova cliente (`cliente.create`), Nova reserva (`reserva.create`).

---

## 2. Layout por tela

### 2.1 Dashboard (`/`)

**Cabeçalho** [proto]: eyebrow "Hoje"… no protótipo é `UI.header('Hoje', <data por extenso>)`; na prévia aprovada (`src/preview/PreviewPage.tsx`): eyebrow "Dashboard", título "Hoje" (fonte display), subtítulo = data por extenso com primeira letra maiúscula ("Sexta-feira, 23/10/2026"; protótipo: "sexta-feira, 23 de outubro" → capitalizada). Ações à direita, cada uma só se tiver permissão:
- "Agendar prova" (ícone prova, secundário) — `prova.manage`
- "Nova cliente" (ícone clientes, secundário) — `cliente.create`
- "Nova reserva" (ícone plus, primário) — `reserva.create`

**Ordem das seções** [design §3.1 + prévia]: (A) Alertas → (B) KPIs do dia (tiles) → (C) Bloco da agenda expandido com mini-calendário → (D) grade de 2 colunas: Faturamento | Ciclo operacional. A prévia aprovada não desenha os tiles; **[proposta]** manter os 5 tiles (protótipo menos Pré-reservas) numa faixa entre Alertas e Agenda, discretos. Se o João preferir sem tiles, remover a seção B — nenhum dado das tiles é usado em outro lugar.

#### A. Alertas (topo) [design]
- Cartão/seção "Alertas" (prévia: `<h2>Alertas</h2>` + texto "N pendências" em `muted tiny`). No protótipo o título era "Alertas operacionais" com pill à direita: `"{n} crítico(s)"` (tom red; singular "1 crítico", plural "2 críticos") se houver crítico; senão pill "tudo sob controle" (green).
- Cada alerta = linha/box clicável inteiro (link) → `route` do alerta (tabela 3.1). Conteúdo: ícone num quadradinho com cor do tom, **título em negrito**, detalhe numa linha secundária, chevron à direita.
- Tom por severidade: `critico` → red; `atencao` → amber; `info` → stone. (Rótulo textual: o título já descreve; **[proposta]** adicionar eyebrow/pill "Crítico / Atenção / Info" para não depender só de cor — requisito de acessibilidade do design §6.)
- Ordenação: crítico → atenção → info; dentro da mesma severidade, ordem de geração (reservas, peças, manutenções, clientes, depois riscos) [proto, sort estável].
- Protótipo mostra no máximo 14 (`slice(0,14)`) numa lista rolável de 430 px. **[proposta]**: linha horizontal/wrap de boxes com os 6 primeiros (críticos primeiro) + botão "Ver todos (N)" que expande; nada é descartado.
- Estado vazio: título "Nenhum alerta", descrição "Devoluções, pagamentos e prazos estão em dia." (e pill "tudo sob controle").
- Alertas filtrados por permissão: `pagamento_pendente` só aparece com `financeiro.view` [proto]. **[proposta]** também omitir alertas cujo destino o usuário não pode abrir (ex.: sem `reserva.view`, sem `operacao.view`).

#### B. KPIs do dia (tiles) [proto]
Cinco tiles (o sexto, "Pré-reservas", **removido** [design]). Cada tile: rótulo, valor, detalhe; tile "Atrasadas" com estilo de alerta quando > 0.

| Tile | Valor | Detalhe (n>0 / n=0) | Ícone | Clique |
|---|---|---|---|---|
| "Retiradas hoje" | `retiradasHoje.length` | primeiros nomes das clientes separados por vírgula / "nenhuma agendada" | presente | **[proposta]** → `/agenda` do dia |
| "Devoluções hoje" | `devolucoesHoje.length` | "previstas até 18h" / "nenhuma prevista" | relogio | **[proposta]** → `/agenda` do dia |
| "Atrasadas" | `atrasadas.length` | "ação imediata" (estilo alert) / "nada em atraso" | alerta | **[proposta]** → `/reservas` filtrada por atraso |
| "Eventos hoje" | `eventosHoje.length` | "peças em uso na rua" / "agenda livre" | agenda | → `/agenda` |
| "Peças disponíveis" | `n('disponivel')` | "de {totalAcervo} no acervo" | acervo | **[proposta]** → `/acervo?estado=disponivel` |

(No protótipo os tiles não são clicáveis; os destinos são proposta, coerente com "cada box leva à página respectiva".)

#### C. Agenda de hoje + mini-calendário [design §3.1, prévia]
Bloco largo, 2 colunas: lista "Agenda de hoje" (esquerda, maior) e card de calendário do mês (direita).

**Lista "Agenda de hoje"**
- Cabeçalho: título "Agenda de hoje"; meta "{n} compromisso(s)" ("1 compromisso" / "N compromissos"); ação "Ver semana" (ghost, seta) → `/agenda` [proto]; prévia usa rótulo "Ver agenda" com ícone — usar **"Ver agenda"** (o novo kanban da §3.2 não é só semanal).
- Cada item (ordenado por horário `HH:MM`): hora (mono) · título `"{Rótulo do tipo} — {nome da cliente}"` (sem " — cliente" se não houver cliente; compromisso Interno mostra só o título) · subtítulo: `"{códigos das peças, mono} · {observação ou título}"` · pill do tipo (tom do tipo) · botões de ação.
- Tipos (`AG_KIND`) [proto + design §3.2]: Prova (indigo), Retirada (wine), Devolução (teal), Atendimento (stone), Evento (amber), Serviço (ochre), **Interno** (stone, estilo distinto — novo [design]). Item concluído (`state = concluido`) aparece esmaecido (`done`). Compromissos cancelados não aparecem.
- Clique no item → destino: prova → `/provas/:id`; senão reserva → `/reservas/:id`; senão cliente → `/clientes/:id`; sem vínculo → sem clique.
- Botões inline por item [proto]: "Retirar" (kind=retirada, reserva vinculada, `reserva.pickup`, e ainda há itens pendentes de retirada: `itemSummary.pendente > 0`) → abre fluxo de retirada; "Devolver" (kind=devolucao, `reserva.return`, `itemSummary.retirado > 0`) → fluxo de devolução; "Abrir prova" (kind=prova, `prova.view`) → `/provas/:id`.
- Estado vazio: "Nenhum compromisso hoje" / "A agenda aparece aqui automaticamente ao criar reservas e provas."
- Origem dos dados: `appointment` com `starts_at` no dia, `state ≠ cancelado`, juntando cliente, reserva (+ peças dos itens) e prova.

**Mini-calendário do mês** (card à direita) [design; layout na prévia]
- Título display = nome do mês ("Outubro"), meta = ano; botões ícone "Mês anterior" / "Próximo mês" (aria-labels).
- Grade `role="grid"` com semana **começando na segunda e domingo por último** [design §3.2]; cabeçalho dos dias da semana; dias fora do mês vazios.
- Hoje destacado (`today`), dias passados esmaecidos (`past`), marcador nos dias com compromisso (aria-label `"dd/mm/aaaa, com compromissos"`). Legenda abaixo (texto `muted tiny`, ex.: "hoje" e "com compromissos").
- Clique num dia → `/agenda` aberta **naquele dia** [design]. **[proposta]** `/agenda?dia=aaaa-mm-dd` (a Agenda lê o parâmetro; sem parâmetro abre em hoje).
- Dados: lista de datas do mês com ≥1 compromisso não cancelado (consulta leve: `select distinct date(starts_at)` no intervalo do mês). Trocar de mês refaz a consulta.

#### D1. Faturamento recebido [proto + design]
- Visível só com permissão financeira: protótipo usa `financeiro.view`; **[proposta]** usar `financeiro.consolidated` ("Ver resultado consolidado…") porque o design diz que Atendimento não vê resultado financeiro, mas vê/lança pagamentos de reserva (`financeiro.view`).
- Cabeçalho: título "Faturamento recebido"; meta "7 meses · corrente parcial"; seletor segmentado de período (ações): **"Últimos 7 dias"** (7), **"Este mês"** (30 → do dia 1 do mês até hoje), **"90 dias"** (90). Padrão: "Este mês". Botão novo **"Ver financeiro completo"** (secundário, sm) → `/financeiro` [design].
- Três números (eyebrow + valor display, BRL sem centavos): `{rótulo do período}` = faturamento recebido (ex.: "Este mês"); "Ticket médio"; "Locações".
- Gráfico: série de 7 pontos — 6 meses fechados + mês corrente parcial (até hoje); rótulos de mês abreviados em minúsculas ("jan", "fev", …, "dez"); valor do último ponto destacado; linha no protótipo, barras na prévia (`pv-bars`, último = `current`). Aria: "Faturamento recebido por mês". Eixo Y com 0, metade e topo "bonito" (potência de 10/2); tooltip "{mês} — R$ X".
- Sem permissão financeira o protótipo troca o cartão por **"Provas de hoje e amanhã"** (ação "Ver todas" → `/provas` se `prova.view`): lista de provas `agendada|em_curso` com data ≤ amanhã, ordenada por `scheduled_at`; cada linha: hora · nome da cliente · `"{código} · {n} peça(s) separada(s)"` · pill do estado da prova; clique → `/provas/:id`; vazio: "Nenhuma prova em aberto" / "As provas aparecem aqui ao serem agendadas." **Manter** (é o que o Atendimento vê).

#### D2. Ciclo operacional [proto + design]
- Título "Ciclo operacional"; botão novo **"Ver operação"** (ghost/secondary, seta) → `/operacao` (protótipo: "Abrir").
- Se houver peças em `inspecao`: nota âmbar no topo: **"{n} peça(s) aguardando inspeção."** + "Enquanto não forem inspecionadas, não voltam ao acervo e não podem ser reservadas." (prévia usa também o alerta "3 peças aguardando inspeção").
- Lista de 5 linhas (pill do estado + contagem em negrito): Inspeção, Higienização, Ajuste, Manutenção, Bloqueado (tons da prévia: Inspeção amber, Higienização teal, Ajuste ochre, Manutenção red, Bloqueado stone).
- Separador, depois 3 linhas rótulo/valor:
  - "Comprometidas com reservas futuras" = `n(reservado)` (protótipo somava `pre_reservado`, removido).
  - "Fora da loja agora" = `n(em_uso) + n(retirado) + n(aguardando_devolucao)`.
  - "Taxa de ocupação do acervo" = `1 − n(disponivel)/max(1, totalAcervo)`, % sem casas.
- Contagens sobre peças do acervo (≠ baixado).

#### Responsividade
Desktop/tablet: alertas em linha, agenda+calendário lado a lado, grade 2 colunas; em ≤ tablet estreito empilhar (calendário abaixo da lista).

### 2.2 Inteligência (`/inteligencia`)

**Cabeçalho** [proto]: título "Inteligência"; subtítulo dinâmico `"{locações} locações · {faturamento R$} · ticket {R$} nos últimos {dias} dias"`; à direita seletor segmentado de período: **"90 dias"** (90), **"6 meses"** (180, padrão), **"12 meses"** (365). `from = hoje − dias + 1`; janela = `[from, hoje]` inclusive.

Visível só com `inteligencia.view` (Administrador) [design §3.8]. Colunas/blocos de custo exigem também `acervo.cost` (Admin tem ambos).

#### 2.2.1 Inventário completo do protótipo (nada pode sumir)

**Tiles (7)**
| Rótulo | Valor | Detalhe | Estilo |
|---|---|---|---|
| "Locações" | nº de itens-locação no período | "no período" | — |
| "Faturamento" | `receita` BRL sem centavos | "valor das locações" | — |
| "Ticket médio" | `ticket` | "por locação" | — |
| "Clientes ativas" | `comLocacao.length` | "de {totalClientes} cadastradas" | — |
| "Taxa de recorrência" | `taxaRec` % | "{recorrentes} clientes voltaram" | — |
| "Peças paradas" | `semLocacao.length` | "sem locação há 90+ dias" | alert se > 0 |
| "Conversão de prova" | `taxaProva` % ou "—" | "{fechadasPeriodo} provas encerradas" | — |

**Bloco "Inteligência de acervo"** — subtítulo "o que os dados operacionais dizem sobre a próxima compra": lista de frases acionáveis (ícone em tom + texto com negritos + linha "porquê" em cinza). 12 tipos de insight (regras e textos exatos em 3.3).

**Gráficos / tabelas (11 cards)**
1. "Receita por peça" — meta "top 8 no período": barras horizontais; cada barra: nome da peça (link → `/acervo/:id`), nota "{n}×", valor BRL, cor da barra = cor real da peça (`color_hex`); rodapé "A barra usa a cor real da peça."; vazio "Sem locações no período".
2. "Cores mais procuradas" — meta "locações por cor": barras (top 8 cores), valor "{n}×", nota "{k} no acervo", cor da barra = hex; vazio "Sem dados no período".
3. "Tamanhos mais procurados" — meta "locações no período": colunas verticais, rótulo "Tam. {PP|P|M|G|GG|U}", valor "{n}×", cores cíclicas (6 categorias); ordenado desc; vazio "Sem dados".
4. "Ocupação por categoria" — meta "dias alugados ÷ dias disponíveis": barras, valor % com 1 casa, nota "{n} peça(s)", ordenado desc.
5. "Conversão de prova por peça" — meta "quem encanta e fecha": barras (top 6 por taxa) valor %, nota "{convertidas}/{provas}", link → `/acervo/:id`, cor da peça; vazio "Ainda sem provas suficientes" / "Registre o resultado das provas para alimentar este indicador."
6. "Encanta e não fecha" — meta "muita prova, pouca locação": tabela colunas **Peça** (código mono + nome), **Provas**, **Locações**, **Conversão** (vermelho, "0%" se nula), **Sinal** (texto: "{n} pediram ajuste" | "{n} descarte(s)" | "sem sinal claro"); até 8 linhas; clique → `/acervo/:id`; vazio "Nenhuma peça nesse padrão" / "Quem prova, leva."
7. "Pressão do acervo por tamanho" — meta "procuras por peça — não volume absoluto": tabela **Tamanho | Peças | Locações | Provas | Ocupação | Pressão** (ocupação % 1 casa; pressão "{x,y}×"); nota rodapé: "Pressão = (locações + metade das provas) ÷ peças do segmento. Um tamanho com muitas locações pode simplesmente ter muitas peças; a pressão corrige isso."
8. "Pressão por categoria" — meta "onde falta acervo": tabela **Categoria | Peças | Ocupação | Pressão**.
9. "Clientes que mais alugam": tabela **Cliente** (nome + cidade) | **Locações** | **Total** | **Ticket**; top 8 por gasto; clique → `/clientes/:id`.
10. "Capital parado" — meta "peças sem locação recente": tabela **Peça | Estado (pill) | Custo | Receita | Parada há** ("{n} dias" ou "nunca alugada"); ordenada por custo desc; clique → `/acervo/:id`; vazio "Acervo inteiro girando" / "Nenhuma peça parada há mais de 90 dias."
11. (embutido nos insights) payback/"pagas".

Obs.: `E.pressure('color', dias)` existe no motor mas **não é exibido**; pode alimentar a proposta "pressão por cor" (opcional).

#### 2.2.2 Reorganização proposta por pergunta de negócio **[proposta]** — nada se perde

Cabeçalho + filtros fixos: período (90 dias / 6 meses / 12 meses — mantidos) **[proposta]** + filtro "Categoria" (todas | uma) aplicado a tudo menos tiles de cliente/prova global, + (opcional) período personalizado. Tiles (os 7) permanecem em faixa no topo, agora clicáveis: rolam/ativam a seção respectiva.

Navegação por abas ou âncoras (uma tela, 5 seções; ordem sugerida):

**1. "Como está o negócio?"** (visão geral)
- Tiles Locações, Faturamento, Ticket médio.
- Gráfico novo: faturamento e locações por mês dentro do período (linha/barras) — usa os mesmos itens-locação **[proposta]**.
- Insight: "Maior valor médio por locação" (categoria) e ticket por categoria (tabela/barras novas, derivadas de `porCategoria`).

**2. "O que devo comprar?"** (demanda × oferta)
- Insights: tamanho top; cores com giro ≥ 2,5×; categorias com maior ocupação; tamanho com maior pressão.
- Cards: Tamanhos mais procurados; Cores mais procuradas; Ocupação por categoria; Pressão por tamanho; Pressão por categoria.
- Visual novo: dispersão "pressão × ocupação" por tamanho/categoria (canto superior direito = comprar mais); coloração por zona. Ver legenda do limiar "Acima de 25% é sinal de que falta acervo".

**3. "Quais peças não estão rendendo?"** (capital e retorno)
- Tile Peças paradas; insight "peças sem locação nos últimos 90 dias"; insight "poucoProvadas"; insights de payback ("recuperou o investimento").
- Cards: Capital parado (tabela com ordenação por custo/parada há); Receita por peça (top 8; **[proposta]** alternar entre "Top" e "Bottom" e ordenar por payback); lista "Peças que já se pagaram" (a partir de `economics.paid_back`) com payback x, investimento e receita (mostrar todas, não só 2).
- Filtros locais: categoria, estado da peça.

**4. "As provas viram locação?"** (funil de prova)
- Tile Conversão de prova; insights "taxa de provas encerradas viraram reserva", "Encanta e não fecha" (peças), "Quase nunca provadas".
- Cards: Conversão de prova por peça; Encanta e não fecha; (parte de poucoProvadas como tabela "Quase nunca provadas": Peça | Provas | Locações — novo, dado já calculado).
- Visual novo: funil provas agendadas → realizadas → convertidas no período (mesmas contagens de 3.3).

**5. "Quem são as clientes?"**
- Tiles Clientes ativas e Taxa de recorrência; insight de recorrência.
- Cards: Clientes que mais alugam (tabela); **[proposta]** barra "Receita de recorrentes vs. novas" com os números já usados no insight.

Os 12 insights seguem existindo como bloco "Leitura do período" no topo (cada frase com tag da seção e clique que rola até o card de origem). Ícones e tons mantidos (ver 3.3). Cada card mantém título, meta, rótulos, vazios, e link de linha → `/acervo/:id` ou `/clientes/:id`.

---

## 3. Regras e cálculos

### 3.1 Alertas (`E.alerts` = alertas base + `E.riskAlerts`) — derivados ao vivo, sem job

Entrada: reservas, itens, clientes, peças, `garment_state_history`, `garment_maintenance`, `garment_calendar_block`, provas. Formato `Alert = {sev, kind, icon, title, detail, route}`. Texto de `detail` usa `fd` = `dd/mm`; BRL com centavos (`brl`).

| kind | Condição | Severidade | Título (`title`) | Detalhe (`detail`) | Ícone | Rota |
|---|---|---|---|---|---|---|
| `devolucao_atrasada` | reserva em `retirada|em_uso|aguardando_devolucao` e `d = hoje − return_due_date > 0` | critico | `Devolução atrasada — {nome cliente}` | `{código} · {d} dia(s) · prevista {dd/mm}` | alerta | `/reservas/:id` |
| `devolucao_hoje` | mesmos estados, `d = 0` | atencao | `Devolução hoje — {nome}` | `{código}` | relogio | `/reservas/:id` |
| `retirada_amanha` | reserva em `confirmada|pronta_retirada` e `pickup_date − hoje = 1` (`aguardando_pagamento` removido) | info | `Retirada amanhã — {nome}` | `{código} · {dd/mm}` | presente | `/reservas/:id` |
| `pagamento_pendente` | mesmo conjunto de estados, `saldo(due) > 0` e `d = pickup − hoje ≤ 3` (inclui retiradas atrasadas/hoje: d ≤ 0) **e** usuário com `financeiro.view` | `d ≤ 1` → critico; senão atencao | `Pagamento pendente — {nome}` | `{código} · falta {R$ saldo} · retirada {dd/mm}` | moeda | `/reservas/:id` |
| `inspecao_parada` | peça `inspecao`, dias desde a última entrada em `inspecao` (`garment_state_history.to_state='inspecao'`, mais recente; 0 se não houver histórico) `≥ 1` | atencao | `{código} aguarda inspeção há {dias} dia(s)` | nome da peça | alerta | `/acervo/:id` |
| `inspecao_pendente` | peça `inspecao` com dias < 1 (devolvida hoje) | info | `{código} devolvida — aguardando inspeção` | nome da peça | operacao | `/operacao` |
| `manutencao_longa` | `garment_maintenance` em `aberta|em_andamento` com `floor((agora − opened_at)/dia) ≥ 7` | atencao | `{código} há {dias} dias em {kind}` (kind cru: higienizacao, ziper…; **[proposta]** usar rótulo `MAINTENANCE_KIND`, ex. "Zíper") | descrição da OS | costura | `/operacao` |
| `aniversario` (hoje) | `birth_date` mm-dd = hoje (ano corrente) | info | `Aniversário hoje — {nome}` | "Boa hora para um contato" | presente | `/clientes/:id` |
| `aniversario` (próximos) | dias até o aniversário no ano corrente em 1..3 | info | `Aniversário em {d} dia(s) — {nome}` | `{dd/mm}` | presente | `/clientes/:id` |
| `peca_em_risco` | peça em `inspecao|higienizacao|ajuste|manutencao|bloqueado` e existe bloco `locacao` ativo (não liberado, não expirado, não histórico) com `end_date ≥ hoje`; pegar o de menor `start_date`; `dias = start − hoje ≤ 7` | `dias ≤ 2` → critico, senão atencao | `{código} está em {estado em minúsculas} e tem retirada {hoje|amanhã|em N dias}` | `{nome peça}{ · código reserva[ — cliente]} · retirada {dd/mm}` | alerta | `/acervo/:id` |
| `atraso_com_fila` | reserva atrasada (return_due < hoje, estados de devolução) e, para cada item, existe outro bloco `locacao` ativo de outra reserva com `start_date ≥ hoje` (menor início) | critico | `Atraso de {primeiro nome} compromete a próxima reserva de {código}` | `{código} venceu {dd/mm} · {código2} — {cliente2} retira {dd/mm}` | alerta | `/reservas/:id` (da reserva atrasada) |
| `item_nao_entregue` | `reservation_item.item_state='nao_entregue'` em reserva ativa | atencao | `{código|"Peça"} não foi entregue na retirada` | `{código reserva} — {cliente} · {pickup_note}` | alerta | `/reservas/:id` |
| `prova_sem_resultado` | prova `agendada|em_curso` com data ≤ hoje | data < hoje → atencao; = hoje → info | `Prova de {nome} sem resultado registrado` | `{código prova} · {dd/mm HH:MM}[ · N peça(s) sem avaliação]` (N = itens com outcome `nao_provou`) | prova | `/provas/:id` |

- **Removido** [design]: `pre_reserva_expirando`.
- Ordem final: severidade (critico 0, atencao 1, info 2), estável.
- `saldo` (`E.balance`): `devido = total_net + late_fee`; `pago = Σ payments(pago, kind ∉ {caucao, estorno}) − Σ estorno(pago)`; `due = max(0, round2(devido − pago))`; status `nao_pago (pago ≤ 0) | parcial | pago (pago ≥ devido − 0,009)`. **Caução não entra.** [design §3.5]
- **[atenção]** Aniversários: só ano corrente (em 29–31/dez não alerta aniversário de 1–3/jan; dia 29/02 em ano não bissexto). **[proposta]** tratar virada de ano e 29/02 → 28/02.
- **[atenção]** `pagamento_pendente` no modelo novo: o saldo é conta a receber com vencimento na retirada [design §3.5]; manter a regra de 3 dias; e `confirmada` exige sinal mínimo, portanto "Pagamento pendente" é saldo, não sinal.
- Evitar duplicidade: uma mesma reserva pode gerar vários alertas (ex.: pagamento + retirada amanhã); mantidos separados [proto].

### 3.2 KPIs e agregações do Dashboard

Datas por `YYYY-MM-DD`; `hoje` fixo.

- **retiradasHoje** = reservas com `pickup_date = hoje` e estado ∈ {`confirmada`, `pronta_retirada`} (protótipo incluía `aguardando_pagamento`, removido).
- **devolucoesHoje** = `return_due_date = hoje` e estado ∈ {`retirada`, `em_uso`, `aguardando_devolucao`}.
- **atrasadas** = `return_due_date < hoje` e mesmos estados.
- **eventosHoje** = `event_date = hoje` e estado ∈ ACTIVE.
- **disponiveis** = peças do acervo com estado `disponivel`; **totalAcervo** = peças ≠ `baixado`.
- **Faturamento recebido(from,to)** = Σ `payment.amount` com `state='pago'`, `kind ∉ {caucao, estorno}`, `paid_at::date ∈ [from,to]` (regime de caixa [design §3.5]; inclui sinal, saldo, integral e multa). **[atenção]** o protótipo apenas *exclui* estornos, não os subtrai. **[proposta]** subtrair estornos pagos na data do estorno (`− Σ estorno`), documentando a decisão; manter a versão do protótipo se o João preferir paridade.
- **Locações (card)** = nº de **reservas** realizadas com `pickup_date ∈ [from,to]` (aqui conta reservas, não itens).
- **Ticket médio (card)** = `Σ total_net` dessas reservas ÷ nº de reservas; 0 se nenhuma. (Usa valor da reserva, não pagamentos.)
- **Período**: `7` → `[hoje−6, hoje]`; `30` ("Este mês") → `[dia 1 do mês, hoje]`; `90` → `[hoje−89, hoje]`. Padrão "Este mês".
- **Série mensal**: para i = 6..0, mês `m = mês corrente − i`; valor = Faturamento recebido(dia 1 de m, min(último dia de m, hoje)); rótulo = abreviação do mês. Cobre 7 meses; o último é parcial.
- **Ciclo**: contagem por estado de peça (≠ baixado) como em 2.1-D2; "Taxa de ocupação do acervo" = `1 − disponiveis/max(1,totalAcervo)`.
- **Provas hoje e amanhã** (perfil sem financeiro): `fitting_session.state ∈ {agendada, em_curso}` e `date(scheduled_at) ≤ hoje+1`, ordenadas; qtd peças = `count(fitting_item)`.
- **Compromissos do dia**: ver `E.agendaFor`.

### 3.3 Cálculos e insights da Inteligência

**Conjuntos base** (período = `[hoje−dias+1, hoje]`):
- `itens` = `reservation_item` com reserva REALIZED (e peça existente — inclui peças baixadas, **[atenção]**: pode gerar divisão por zero em "estoque"; ver cores).
- `noPeriodo` = itens com `reserva.pickup_date` no período. **"Locação" na Inteligência = item (linha), não reserva.**
- `receita` = Σ `net_revenue` dos itens (fallback `line_total`, fallback `unit_price − discount`; `E.itemRevenue`). Receita líquida já com desconto rateado (`E.prorate`: desconto do pedido distribuído proporcionalmente à base do item, centavos truncados, resto no maior item).
- `ticket` = `receita / noPeriodo.length` (0 se vazio). **Difere do ticket do Dashboard** (por reserva); rotular claramente "por locação (item)".
- `clientes` = todas as clientes; `stats(c)` = `E.customerStats`: `rentals` = reservas REALIZED da cliente (**todo o histórico, não só o período**), `spent` = Σ `total_net` dessas reservas, `ticket = spent/rentals` (0 se 0).
- `comLocacao` = clientes com `rentals > 0` → tile "Clientes ativas" (ativas = já alugaram alguma vez).
- `recorrentes` = `rentals ≥ 2`; `taxaRec = recorrentes/comLocacao` (0 se `comLocacao = 0`). **Não** filtrado por período.
- `topClientes` = clientes com `rentals>0` por `spent` desc, 8 primeiras.

**Agregações no período** (por item):
- `porTamanho[size_equiv]` = contagem. `porCor[color_primary]` = {n, hex, receita}. `porCategoria[nome]` = {n, receita} (nome "—" se sem categoria). `porPeca[garment]` = {n, receita}.
- `topPecas` = `porPeca` por receita desc, 8.
- `corRows` = `porCor` por `n` desc.
- **Ocupação por categoria**: para cada categoria com ≥1 peça do acervo: `ocupados` = Σ sobre peças da categoria e blocos `kind='locacao'` de `[max(start, from), min(end, hoje)]` (dias inclusivos `diff+1`, se fim ≥ ini); `taxa = ocupados / (nPeças × dias)`. **[atenção]** protótipo não filtra `released_at` nem reserva cancelada (blocos liberados de reservas canceladas/no-show inflam a ocupação) nem sobreposição de blocos; **[proposta]** considerar só blocos ativos, de reservas não canceladas (ou histórico realizado), e clamp 0–100%. Na versão SQL: agregação por `daterange` ∩ período.
- **Peças paradas (`semLocacao`)** = peças do acervo com `economics.rentals = 0` **ou** `idle_days > 90` (constante 90; o parâmetro `idle_alert_days` existe em `E.cfg()` mas não é usado aqui — **[proposta]** usar o parâmetro, padrão 90). Inclui peças em qualquer estado (inclusive nunca alugadas e as recém-cadastradas — **[proposta]** ignorar peças cadastradas há < N dias).
- `E.economics(g)` (por peça, **todo o histórico**): itens REALIZED da peça → `revenue = Σ itemRevenue`, `cleaning = Σ expense(kind=higienizacao)`, `maintenance = Σ expense(kind ∈ manutencao, ajuste)`, `acquisition = acquisition_cost`, `result = revenue − acquisition − cleaning − maintenance`, `payback = acquisition>0 ? revenue/acquisition : null`, `paid_back = acquisition>0 ∧ revenue ≥ acquisition`, `rentals_to_payback = ceil(acquisition/rental_price)` (se ambos > 0), `avg = revenue/rentals` (0 se 0), `margin = revenue>0 ? result/revenue : 0`, `last_rental = max(event_date ?? pickup_date)`, `idle_days = diffDays(last_rental, hoje)` (null se nunca alugada). Compõe-se de `reservation_item` + `expense` (view `v_garment_economics`). A despesa de aquisição também aparece em `expense(kind=aquisicao)` mas **não** é somada em `cleaning/maintenance`; o custo vem de `garment.acquisition_cost` [design §3.5]. Requer `acervo.cost`.
- `pagas` = peças com `paid_back` (ordem do acervo).
- **Provas** (`E.fittingStats(garment)`, todo o histórico): `tried` = `fitting_item` da peça com `outcome ≠ 'nao_provou'`; `fittings = |tried|`; `converted` = nº de itens provados cuja sessão tem `reservation_id` e essa reserva possui a mesma peça em `reservation_item`; `rate = fittings>0 ? converted/fittings : null`; `favorites` (outcome favorita); `discards` (descartada|nao_gostou); `alterations` (needs_alteration ou outcome `precisa_ajuste`); `reasons` = últimas 4 notas não vazias {outcome, note}.
  - `conv` = peças com `fittings>0`.
  - `melhorConversao` = `conv` com `fittings ≥ 3`, por `rate` desc, top 6.
  - `muitoProvadaPoucoAlugada` = `fittings ≥ 4` e (`rate` nula ou `< 0,35`), por `fittings` desc; tabela mostra 8; texto do "Sinal": `alterations>0 → "{n} pediram ajuste"`, senão `discards>0 → "{n} descarte(s)"`, senão "sem sinal claro"; taxa nula exibida "0%".
  - `poucoProvadas` = peças com `fittings ≤ 1` e `economics.rentals ≤ 1`.
- **Taxa de conversão de prova (período)**: `fittingsPeriodo` = sessões com `date(scheduled_at) ∈ período`; `fechadas` = estado ∈ {`convertida`, `perdida`, `no_show`} (**`concluida` não conta**); `taxaProva = convertidas/fechadas`, `null` se `fechadas=0` (tile mostra "—"; insight omitido).
- **Pressão (`E.pressure(dim, dias)`, dim ∈ size | category | color [color não exibido])**: segmento = `size_equiv` / nome da categoria / `color_primary` (rótulo "—" se vazio) sobre peças do acervo; por segmento: `pecas` (nº), `locacoes` (itens REALIZED com pickup no período), `provas` (fitting_items `≠ nao_provou` com sessão no período), `diasOcupados` (mesma conta da ocupação por categoria), `receita` (Σ itemRevenue no período). `pressao = pecas>0 ? (locacoes + 0,5·provas)/pecas : 0`; `ocupacao = pecas>0 ? diasOcupados/(pecas·dias) : 0`. Ordenado por `pressao` desc. Tabelas exibem `ocupacao` em % (1 casa) e `pressao` com 1 casa + "×".

**Insights ("Inteligência de acervo")** — ordem de geração (cada um é opcional). `pct` = %, `num(x,1)` = 1 casa decimal pt-BR, BRL sem centavos (`brl0`). Negrito = `<b>`.

| # | Condição | Tom / ícone | Texto | Porquê |
|---|---|---|---|---|
| 1 | há locações no período; `tamTop` = tamanho com mais locações | green / subir | "Tamanho **{T}** concentra **{p%}** das locações do período ({n} de {N})." | "O acervo tem {peças do tamanho} peças nesse tamanho, de {totalAcervo}. Próximas compras deveriam respeitar essa proporção." |
| 2 | para cada uma das **2 cores** mais locadas: `demandaPorPeca = n/estoque ≥ 2,5` (`estoque` = peças do acervo na cor; **[atenção]** 0 → ∞; tratar `estoque=0` como "sem estoque ativo") | amber / raio | "**{cor}** gira {x,y}× por peça — alta procura com estoque baixo." | "{n} locações distribuídas em apenas {estoque} peça(s). Cada nova peça nessa cor tende a alugar sozinha." |
| 3 | para cada uma das **2 categorias** de maior ocupação: `taxa > 0,14` | green / inteligencia | "Categoria **{nome}** está com **{p%}** de ocupação nos últimos {dias} dias." | "{dias ocupados} dias de peça alugados sobre {peças×dias} dias disponíveis ({peças} peças). Acima de 25% é sinal de que falta acervo." |
| 4 | `semLocacao.length > 0` | red / descer | "**{n} peça(s)** sem locação nos últimos 90 dias." | "{até 4 códigos}{…} — {R$ Σ custo de aquisição} de capital parado. Avaliar redução de preço, reposicionamento na vitrine ou baixa." |
| 5 | **2 primeiras** peças de `pagas` | green / moeda | "**{código} — {nome}** recuperou o investimento após {ceil(custo/(avg || preço de locação))} locações." | "{R$ receita} de receita sobre {R$ custo} de custo. A partir daqui, cada locação é margem quase integral." |
| 6 | `recorrentes.length > 0` | green / clientes | "**{taxaRec%}** das clientes que já alugaram voltaram pelo menos uma segunda vez." | "{recorrentes} de {comLocacao}. Clientes recorrentes respondem por {R$ Σ spent recorrentes} — {pct = Σspent recorrentes / max(1, Σspent todas)} da receita acumulada." |
| 7 | até **2** peças de `muitoProvadaPoucoAlugada` | amber / descer | "**{código} — {nome}**: {n} provas e {**nenhuma** virou locação | apenas {c} virou locação} — {rate%} de conversão." | "Alta experimentação e baixa conversão. [{k} clientes precisaram de ajuste. ][A equipe registrou: “{última nota}”. ]Revisar caimento, preço, conservação ou posicionamento na arara." |
| 8 | `pressaoAlta` = 1ª linha de `pressaoTam` com `pecas ≥ 2`; `pressao > 0` | amber / raio | "Tamanho **{T}** tem a maior pressão do acervo: {x,y} procuras por peça." | "{locações} locações e {provas} provas distribuídas em {peças} peças, com {ocupação%,1} de ocupação. Pressão mede procura por peça — não volume absoluto, que só reflete quantas peças existem naquele tamanho." |
| 9 | `poucoProvadas.length ≥ 2` | stone / olhoOff | "**{n} peça(s)** quase nunca são sequer provadas." | "{até 4 códigos}{…} — pouca prova costuma indicar exposição ruim, foto fraca ou posição desfavorável na loja, não falta de demanda. Antes de baixar do acervo, vale testar reposicionamento." |
| 10 | `taxaProva ≠ null` | green se ≥ 0,5, senão amber / prova | "**{p%}** das provas encerradas no período viraram reserva." | "{convertidas} conversões em {fechadas} provas encerradas. Cada ponto dessa taxa vale mais que um ponto de tráfego: a cliente já está na loja e já vestiu a peça." |
| 11 | categoria de maior ticket (`receita/n` do período) existe | stone / tag | "Maior valor médio por locação: **{categoria}**, a {R$ ticket}." | "{n} locações no período. Comparar com o ticket médio geral de {R$ ticket geral} ao decidir a próxima compra." |

(São 11 regras; os #2, #3, #5, #7 podem gerar 2 linhas cada.) Os insights 4 e 5 usam custo → ocultar sem `acervo.cost`. **[atenção]** divergência de limiar no #3: gera com taxa > 14%, o texto cita 25%; **[proposta]** manter 14% como gatilho de aviso e mostrar duas faixas ("atenção > 14%", "falta acervo > 25%").

**Borda/divisão por zero**: `ticket` (0 sem locações), `taxaRec`, `taxaProva` (null), `demandaPorPeca` (estoque 0), `rate` nula, `margin` (0 se receita 0), `payback` null sem custo, `% receita recorrentes` (denominador `max(1,…)`), ocupação sem peças (categoria sem peças é omitida), `max(1, …)` nos gráficos para escala.

**Implementação** [design §3.7, §5]: computar tudo em views/funções SQL (`v_garment_economics`, funções por período para ocupação/pressão/conversão); o front só recebe o relatório pronto. Resultados devem bater com os do protótipo para o seed.

---

## 4. Dados necessários (tipos)

```ts
// Datas 'aaaa-mm-dd'; instantes ISO.
type Tone = 'red' | 'amber' | 'stone' | 'green' | 'indigo' | 'teal' | 'ochre' | 'wine'
type Severity = 'critico' | 'atencao' | 'info'

type AlertKind =
  | 'devolucao_atrasada' | 'devolucao_hoje' | 'retirada_amanha' | 'pagamento_pendente'
  | 'inspecao_parada' | 'inspecao_pendente' | 'manutencao_longa' | 'aniversario'
  | 'peca_em_risco' | 'atraso_com_fila' | 'item_nao_entregue' | 'prova_sem_resultado'
  // 'pre_reserva_expirando' REMOVIDO

type Alert = {
  sev: Severity; kind: AlertKind; icon: string  // nome de ícone do design system
  title: string; detail: string
  route: string              // '/reservas/:id' | '/acervo/:id' | '/clientes/:id' | '/provas/:id' | '/operacao'
}   // fonte: reservation, reservation_item, payment, garment, garment_state_history,
    // garment_maintenance, garment_calendar_block, customer.birth_date, fitting_session/fitting_item

type AgendaKind = 'prova' | 'retirada' | 'devolucao' | 'atendimento' | 'evento' | 'servico' | 'interno'
type AgendaItem = {
  id: string; time: string /* HH:MM */; kind: AgendaKind; state: 'agendado' | 'concluido' | 'no_show'
  title: string; notes: string | null; internal: boolean
  customer: { id: string; fullName: string } | null
  reservation: { id: string; code: string; pendingPickupItems: number; itemsOut: number } | null
  fitting: { id: string } | null
  garmentCodes: string[]
}   // fonte: appointment (+ reservation_item, garment, customer, fitting_session)

type DashboardSummary = {
  today: string
  tiles: { pickupsToday: { count: number; firstNames: string[] }; returnsToday: number; overdue: number
           eventsToday: number; availableGarments: number; totalGarments: number }
  alerts: Alert[]                       // já ordenado
  agendaToday: AgendaItem[]
  agendaMonthDays: string[]             // datas do mês exibido com compromisso (mini-calendário)
  cycle: { inspecao: number; higienizacao: number; ajuste: number; manutencao: number; bloqueado: number
           reservado: number; foraDaLoja: number; occupancyRate: number }   // garment.state
  finance: null | {                     // null sem financeiro.consolidated
    range: '7' | '30' | '90'; revenue: number; ticket: number; rentals: number
    series: { label: string /* 'jan'… */; month: string; value: number }[]   // 7 pontos
  }                                     // fonte: payment (pago, ≠ caucao/estorno), reservation
  fittingsSoon?: { id: string; code: string; at: string; customerName: string; itemCount: number; state: FittingState }[]
                                        // só quando finance === null
}

type IntelPeriod = 90 | 180 | 365
type IntelReport = {
  period: { days: IntelPeriod; from: string; to: string }
  kpis: { rentals: number; revenue: number; avgTicket: number
          activeCustomers: number; totalCustomers: number; recurrenceRate: number; recurrentCount: number
          idleGarments: number; fittingConversion: number | null; closedFittings: number }
  insights: { tone: Tone; icon: string; html: string; why: string; group: IntelGroup; ref?: string }[]
  revenueByGarment: { garmentId: string; name: string; hex: string; rentals: number; revenue: number }[]   // top 8
  colors: { color: string; hex: string; rentals: number; inStock: number; revenue: number }[]
  sizes: { size: string; rentals: number }[]
  occupancyByCategory: { category: string; garments: number; occupiedDays: number; rate: number }[]
  fittingConversionByGarment: { garmentId: string; name: string; hex: string; fittings: number; converted: number; rate: number }[]  // top 6
  fittedNotRented: { garmentId: string; code: string; name: string; fittings: number; converted: number
                     rate: number | null; alterations: number; discards: number; lastNote: string | null }[]
  rarelyFitted: { garmentId: string; code: string; name: string; fittings: number; rentals: number }[]
  pressureBySize: PressureRow[]; pressureByCategory: PressureRow[]
  topCustomers: { customerId: string; name: string; city: string | null; rentals: number; spent: number; ticket: number }[]
  idleCapital: { garmentId: string; code: string; name: string; state: GarmentState
                 cost: number | null; revenue: number; idleDays: number | null /* null = nunca alugada */ }[]   // custo só com acervo.cost
  paidBack: { garmentId: string; code: string; name: string; revenue: number; cost: number; payback: number; rentalsToPayback: number }[]
  ticketByCategory: { category: string; rentals: number; avgTicket: number }[]
}
type IntelGroup = 'negocio' | 'comprar' | 'rendimento' | 'provas' | 'clientes'   // [proposta]
type PressureRow = { key: string; garments: number; rentals: number; fittings: number; occupiedDays: number
                     revenue: number; pressure: number; occupancy: number }
```
Origem dos dados: reservas/itens (locações, receita, ticket, clientes, tamanhos/cores/categorias), pagamentos (faturamento, saldo), peças (estado, custo, preço, categoria, cor, tamanho), provas (`fitting_session`, `fitting_item`), manutenção (`garment_maintenance`, alertas), despesas (`expense`: higienização/manutenção/ajuste na economia da peça), blocos de calendário (ocupação, risco), clientes (aniversário, recorrência), agenda (`appointment`).

---

## 5. Permissões (catálogo `src/auth/permissions.ts`)

| Recurso | Permissão |
|---|---|
| Abrir `/` | `dashboard.view` |
| Botões do cabeçalho | `prova.manage`, `cliente.create`, `reserva.create` |
| Botões "Retirar"/"Devolver"/"Abrir prova" na agenda | `reserva.pickup`, `reserva.return`, `prova.view` |
| Ver Agenda / criar compromisso | `agenda.view` / `agenda.manage` |
| Card Faturamento | `financeiro.consolidated` **[proposta]** (protótipo: `financeiro.view`) |
| Botão "Ver financeiro completo" | `financeiro.view` (rota `/financeiro` aplica a própria checagem) |
| Alerta `pagamento_pendente` | `financeiro.view` |
| Botão "Ver operação" / ciclo | `operacao.view` (contagens do ciclo visíveis a quem vê o dashboard) |
| Abrir `/inteligencia` | `inteligencia.view` |
| Custo, receita por peça no capital parado, payback, insights 4 e 5 | `acervo.cost` (+ `inteligencia.view`) |
| Links de linha | `acervo.view`, `cliente.view`, `reserva.view`, `prova.view` |

Perfis [design §3.8]: **Administrador** vê tudo. **Atendimento** vê o Dashboard (sem card Faturamento → vê "Provas de hoje e amanhã"; vê alertas exceto os que dependam de permissão que não tenha), **não** vê Inteligência (nem item de menu). Permissões extras/revogadas por usuário valem. A checagem real é no banco (RPC/view com `has_perm()`); no front é só conveniência. Dados de cliente (nome) só com `cliente.view` — **[proposta]** se não tiver, mostrar apenas código da reserva nos alertas/agenda.

---

## 6. Dados de exemplo (o que o seed do protótipo produz)

Seed determinístico (PRNG 20260913): 28 peças (códigos `SZ-{(idx+1)*7+100}`, ex.: SZ-0107 Verona), 34 clientes (14 de relacionamento + 20 de cauda longa), ~7 meses de locações finalizadas sem sobreposição (peças com `pop` 3/2/1 alugam a cada 11–26 / 24–52 / 58–96 dias; 3 peças com `pop 0` nunca alugadas: Turim, Nápoles, Rimini), 2 reservas encerradas sem locação (cancelada, no_show), sinal 50% + saldo, expenses de higienização/manutenção. Alertas no dia de hoje (equivalentes ao novo modelo, sem pré-reservas):
- Atrasadas: Portofino com Vitória Sampaio (2 dias, crítico) e reserva parcial de Tatiane Lopes (1 dia, crítico; ainda com a clutch Umbria).
- Devolução hoje: Ostuni com Fernanda Queiroz (atenção). Retirada hoje: Firenze com Larissa Menezes (tudo pago). Evento hoje: reserva com Aline Barreto (retirada com saldo autorizada).
- Retirada amanhã + pagamento pendente: Sorrento/Camila Nogueira (falta R$ 780,00 de R$ 1.180, crítico). Pagamento pendente atenção: Parma/Juliana Tavares (retira em 3 dias, falta R$ 325).
- Peça em risco: Lecce em higienização com retirada em 2 dias (crítico); Parma em manutenção com retirada em 3 dias (atenção). `manutencao_longa`: Parma há 9 dias (zíper). `inspecao_parada`: Modena e Ravello (devolvidas ontem).
- Prova sem resultado: Patrícia Rocha com prova em curso hoje (2 peças sem avaliação, info).
- Aniversários ±3 dias: depende da data; nenhum em 24/10.
- Pré-reservas (Bolonha, Capri) **não existem** no novo seed; Bolonha/Capri ficam `disponivel`; "Siena" prova agendada vira rascunho/prova.
- Agenda de hoje (5 itens): 09:00 Prova (Patrícia, concluída/em curso), 10:30 Retirada (Larissa, Firenze), 14:00 Devolução (Fernanda, Ostuni), 16:00 Atendimento "primeira visita" (Juliana), 17:30 Serviço "Coleta da lavanderia".
- Tiles aproximados: Retiradas hoje 1, Devoluções hoje 1, Atrasadas 2, Eventos hoje 1, Peças disponíveis ≈ 10 de 28; ciclo: Inspeção 2, Higienização 2, Ajuste 1 (Assis), Manutenção 1, Bloqueado 1 (Gênova, editorial); comprometidas ≈ 7; fora da loja 4; ocupação ≈ 64%.
- Inteligência: peça "encanta e não fecha" = **Milano** (6+ provas de clientes reais, conversões ≈ 0–1); Turim, Nápoles, Rimini (+ peças `pop 1` com última locação > 90 dias) em Capital parado; categorias dominantes: vestido longo/sereia; cores com giro alto: preto, verde esmeralda, vinho; taxa de conversão de prova em torno de 60–70% (5 convertidas "normais" + Verona; 2 perdidas); recorrência < 100% graças às 20 clientes de cauda longa; payback atingido por peças `pop 3` de custo baixo (ex.: Siena, Verona).
- Valores exatos dependem da data de execução (seed relativo a `hoje`); o novo seed deve manter as mesmas situações relativas (offsets D±n) e remover as de pré-reserva, `aguardando_pagamento`, `atendimento`, `prova_agendada`.
