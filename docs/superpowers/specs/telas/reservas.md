# Senzi OS — Spec de tela: Reservas

Fonte: protótipo `SenzieOS_v0.2_3.html` (`UI.VIEWS.reservas` 5653–6431, engine `E.*` 1218–2700, `SZ.*` 744–833, seed 2710+) + design `2026-10-23-senzi-os-design.md` (seções 3 e 4 prevalecem).
Convenções: textos de UI em português, verbatim do protótipo. **[MUDA]** = alteração do design sobre o protótipo. **[NOVO]** = não existe no protótipo, necessário pelo design. **[DECIDIR]** = lacuna do protótipo/design; a proposta aqui é o default sugerido. Nome da empresa sempre "Senzi" (protótipo escreve "Senzie"). Datas `dd/mm/aaaa` (`fdy`), curtas `dd/mm` (`fd`), `dd/mm hh:mm` (`fdt`), longa "12 de outubro" (`fdlong`). Moeda BRL (`brl` = R$ 1.234,56; `brl0` = R$ 1.235 sem centavos).

---

## 1. Telas e rotas

| Rota | Tela | Permissão mínima |
|---|---|---|
| `/reservas` | Lista de reservas (filtros em chips, tabela) | `reserva.view` |
| `/reservas/:id` | Ficha da reserva (resumo lateral, peças, abas Pagamentos / Contrato / Histórico) | `reserva.view` |
| Modal "Nova reserva" (largo) | Abre da lista (botão), da ficha da cliente, da ficha da peça, e da conversão de prova. Parâmetros de entrada: `customer`, `garment`, `garments` (ids separados por vírgula), `fitting` (id da prova a converter), `eventDate`, `eventType`. [DECIDIR] pode virar rota `/reservas/nova?customer=&garments=&fitting=&eventDate=&eventType=`; também reaproveitado para **Editar rascunho** [NOVO]. | `reserva.create` |
| Modais da ficha | Confirmar reserva [MUDA], Lançar pagamento, Registrar retirada, Registrar devolução, Cancelar, Visualizar contrato, Autorizar exceção (PIN) | ver §7 |

Links de saída da ficha: cliente `/clientes/:id`, peça `/acervo/:id`, prova de origem `/provas/:id`, Operação `/operacao` (devolução e "Inspecionar peças"; no protótipo `UI.state.opFocus = reservationId` foca a reserva na Operação).
Busca global indexa reserva por `code`, nome da cliente, número do contrato e peças contidas ("Verona" devolve as locações dela); rótulo `RS-2026-0007 · Nome`, sub `Estado · evento dd/mm`.

---

## 2. Layout por tela

### 2.1 Lista `/reservas`

**Cabeçalho**: título "Reservas"; subtítulo `{n} em curso` + (se `financeiro.view`) ` · R$ X a receber` (`n` = reservas em estados ativos; "a receber" = Σ `saldo` das ativas, `brl0`). Ação à direita: botão primário `+ Nova reserva` (só `reserva.create`).

**Filtros** (chips, um ativo por vez, default `ativas`; estado do filtro persiste na sessão) — card único acima da tabela:

| chave | rótulo | regra no protótipo | **[MUDA] regra nova** |
|---|---|---|---|
| `ativas` | Ativas | estados ativos + `em_inspecao` + `prova_agendada` | `rascunho`, `confirmada`, `pronta_retirada`, `retirada`, `em_uso`, `aguardando_devolucao`, `devolvida`, `em_inspecao` |
| `hoje` | Hoje | `pickup_date`, `return_due_date` ou `event_date` = hoje | igual |
| `pre` | Pré-reservas | `pre_reserva` | **REMOVIDO** → novo chip `rascunho` rótulo **Rascunhos** (`state = rascunho`) |
| `pagamento` | Aguardando pagamento | `aguardando_pagamento` ou ativa com saldo>0 | **[MUDA]** rótulo **Com saldo** (estado ativo, não rascunho, `saldo > 0`) — `aguardando_pagamento` não existe mais. Só aparece para `financeiro.view` [DECIDIR] |
| `rua` | Fora da loja | `retirada`, `em_uso`, `aguardando_devolucao` | igual |
| `inspecao` | Em inspeção | `devolvida`, `em_inspecao` | igual |
| `futuras` | Futuras | estado ativo e `pickup_date > hoje` | igual (ativo = sem `rascunho`? [DECIDIR]: incluir rascunho) |
| `encerradas` | Encerradas | `finalizada`, `cancelada`, `no_show` | igual |
| `todas` | Todas | sem filtro | igual |

Ordem dos chips: Ativas, Hoje, Rascunhos, Com saldo, Fora da loja, Em inspeção, Futuras, Encerradas, Todas.
Ordenação: por `pickup_date` (fallback `created_at`) **crescente**; em `encerradas` **decrescente**.
Paginação/busca no servidor (design §5) — o protótipo não pagina.

**Tabela** (linha inteira clicável → `/reservas/:id`). Colunas:
1. **Reserva** — `code` mono pequeno (`RS-2026-0007`).
2. **Cliente** — nome (destaque; "—" se ausente).
3. **Peças** — uma linha por item: `{code mono} {nome sem o prefixo "Vestido |Macacão |Conjunto |Saia |Clutch "}`.
4. **Evento** — `dd/mm` + linha secundária (dim) com `event_type`.
5. **Retirada → Devolução** — `dd/mm → dd/mm` mono; se atrasada (estado `retirada|em_uso|aguardando_devolucao` e `return_due_date < hoje`): linha vermelha negrito `{n}d de atraso`.
6. **Estado** — pílula do estado da reserva (§6).
7. (só `financeiro.view`) **Pagamento** — pílula: Não pago (vermelho) / Parcial (âmbar) / Pago (verde); "—" para `cancelada`, `no_show` (e `rascunho` [MUDA]: "—").
8. (só `financeiro.view`) **Valor** (direita) — `total_net` `brl0`; abaixo, dim `falta R$ X` se saldo>0 e não cancelada/no_show (e não rascunho [DECIDIR]).

**Estado vazio**: título "Nenhuma reserva neste filtro", texto "Troque o filtro acima ou crie uma nova reserva."

### 2.2 Ficha `/reservas/:id`

**Não encontrada**: cabeçalho "Reserva não encontrada" + card vazio "Reserva não encontrada".

**Cabeçalho**: título = `code`; subtítulo = `{cliente} · {event_type || 'Evento'} em {fdlong(event_date)}`; ações (botões, ordem abaixo; cada uma só se estado + permissão batem). **[MUDA]** estados:

| Botão (rótulo exato) | Ícone | Condição de estado | Permissão | Estilo | Ação |
|---|---|---|---|---|---|
| **Editar rascunho** [NOVO] | editar | `rascunho` | `reserva.create` | normal | reabre modal Nova reserva preenchido |
| **Confirmar reserva** | check | `rascunho` | `reserva.confirm` | primário | abre modal de confirmação (§3.2) |
| **Registrar pagamento** | moeda | `confirmada`, `pronta_retirada` (e `rascunho` não: sinal entra na confirmação) com `saldo > 0` | `financeiro.payment` | normal | modal Lançar pagamento |
| **Registrar retirada** / **Retirar o restante** | presente | `confirmada`, `pronta_retirada`, `retirada` e há item `pendente` ou `nao_entregue`; rótulo "Retirar o restante" se já há item `retirado` | `reserva.pickup` | primário se saldo≤0 | modal retirada |
| **Registrar devolução** | refresh | há item `retirado` | `reserva.return` | primário | modal devolução |
| **Inspecionar peças** | operacao | `devolvida`, `em_inspecao` | `operacao.inspect` | primário | `/operacao` focando a reserva |
| **Marcar como pronta para retirada** [NOVO, DECIDIR] | check | `confirmada` | `reserva.pickup` | normal | transição `confirmada → pronta_retirada` (o protótipo só tem o estado vindo do seed; nenhuma ação o cria) |
| **Marcar no-show** [NOVO, DECIDIR] | x | `confirmada`/`pronta_retirada` com `pickup_date < hoje` | `reserva.cancel` | normal | confirma → `no_show`, libera blocos como cancelar, `cancel_reason = 'Não compareceu para a retirada'` |
| **Cancelar** | x | qualquer estado fora de `finalizada`, `cancelada`, `no_show` | `reserva.cancel` | normal | modal cancelar |
| **Enviar no WhatsApp** [NOVO] | seta | `rascunho` não; `confirmada`+ | `reserva.view` + `cliente.view` | normal | abre `wa.me` (§5.4) |
| **Gerar PDF da OS** [NOVO] | doc | `confirmada`+ | `reserva.view` | normal | gera/abre PDF (§5.3) |

**Avisos no topo** (faixas `note`), em ordem:
- Vermelha (`red`, ícone alerta), se atraso > 0 (estado `retirada|em_uso|aguardando_devolucao`): `**Devolução atrasada em {n} dia(s).** Prevista para {dd/mm/aaaa}. A multa contratual é de {late_fee_percent}% ao dia sobre {brl(total_net)} — {brl(total_net × pct/100 × n)} até agora. As peças seguem bloqueadas para novas reservas.`
- ~~Âmbar de pré-reserva expirando~~ **REMOVIDO**. [NOVO] Âmbar em `rascunho` com conflito: `**Há conflito de agenda.** {peça}: {Locação|Higienização|…} de {dd/mm – dd/mm}{ — reserva RS-…}. O rascunho não bloqueia a peça; a confirmação vai falhar enquanto o conflito existir.` (recalculado ao abrir a ficha).
- Info (`info`, ícone x), se `cancelada`: `**Reserva cancelada.** {cancel_reason}`.
- Info, se a reserva nasceu de prova: `Esta reserva nasceu da prova {PR-code} de {dd/mm/aaaa}.` (link para a prova).
- Âmbar (ícone escudo) para **cada** exceção autorizada: `**Exceção autorizada.** {Retirada com saldo de | Desconto de} {brl(amount)} autorizado por {nome} — {perfil}, em {dd/mm hh:mm}.` linha 2: `Motivo: {motivo | 'não informado'}`. **[MUDA]**: três tipos agora — `retirada_com_saldo` ("Retirada com saldo de"), `desconto_acima_limite` ("Desconto de"), `dispensa_sinal_minimo` ("Dispensa do sinal mínimo de" + valor faltante).

**Layout**: duas colunas (`profile`): lateral esquerda estreita (`side`) + coluna principal.

**Lateral — card "Estado"**:
- Cabeçalho: eyebrow "Estado" + pílula do estado.
- Lista `dl`: Cliente (link para ficha) · Contato (`whatsapp || phone || '—'`; só com `cliente.view`) · Evento (`event_type || '—'`) · Data do evento (`dd/mm/aaaa`) · Local (`event_venue || '—'`) · Retirada (`dd/mm/aaaa` + dim relativo: `hoje | amanhã | ontem | em N dias | há N dias`) · Devolução (idem) · Canal (`channel || '—'`: `loja | whatsapp | instagram`).
- Se `financeiro.view`: separador e bloco de valores: `Locação` (total_gross) · `Desconto` `− R$` (se >0) · `Multa por atraso` (vermelho, se >0) · **Total** (= `devido` = total_net + late_fee) · `Pago` (líquido) · **Saldo** (vermelho se >0, verde se 0). [NOVO] linha dim `Caução retida: R$ X` quando há caução paga; linha `Sinal mínimo para confirmar: R$ X` em `rascunho`.
- Se `notes`: nota info com ícone editar e o texto.

**Coluna principal**

**Card "Peças da reserva"**: cabeçalho `Peças da reserva` + dim `{n} item(ns) · {k} com a cliente · {m} de volta` (k = itens `retirado`; m = `devolvido`+`inspecionado`). Uma linha por item (grade `52px | 1fr | auto`):
- Miniatura 52×68 (foto de capa; silhueta da peça se não houver) → clica para `/acervo/:id`.
- Centro (clicável → peça): **nome** + código mono; dim `{cor} · tam. {label_size} · estado da peça: {rótulo do GARMENT_STATE}`; ocre com ícone costura `alteration_notes` (se houver); `Retirada: {pickup_note}`; `Devolução: {return_note}`; dim `saiu dd/mm hh:mm` ou `ainda na loja` + ` · voltou dd/mm hh:mm`.
- Direita: pílula do estado do item (§6); se `financeiro.view`: valor líquido do item (`net_revenue`) em negrito e, se `allocated_order_discount > 0`, dim `{gross_amount} − {allocated_order_discount} de rateio`.
- [NOVO] em `rascunho`: botão `Remover` por linha e botão `Adicionar peça` no cabeçalho do card (modal §3.3).

**Abas** (`UI.tabs('r', …)`): `Pagamentos` (contador = nº de lançamentos; só `financeiro.view`), `Contrato`, `Histórico`. Aba inicial: Pagamentos se visível, senão Contrato.

**Aba Pagamentos** (`financeiro.view`): cabeçalho "Pagamentos" + pílula do status (Não pago/Parcial/Pago) + botão `+ Lançar` (pequeno; exige `financeiro.payment`). Tabela: **Data** (`dd/mm/aaaa` do `paid_at`, ou `vence dd/mm` se pendente com `due_at`, ou "—") · **Tipo** (Sinal/Saldo/Integral/Caução/Multa por atraso/Estorno) · **Forma** (PIX, Cartão de crédito, Cartão de débito, Dinheiro, Link de pagamento, Transferência, Outros) · **Situação** (Pago verde; Pendente âmbar; Parcial/Estornado/Cancelado pedra) · **Referência** (`notes || reference`, dim) · **Valor** (direita). Ordenação: `paid_at || created_at` decrescente. Vazio: "Nenhum pagamento lançado" / "Registre o sinal ou o valor integral."
[NOVO] Para pagamento `pendente` do tipo `saldo`/`multa`: ação de linha "Receber" (abre Lançar pagamento preenchido). [DECIDIR]

**Aba Contrato**: cabeçalho "Contrato de locação" + dim mono `{CT-…}` + ` · assinado dd/mm/aaaa` ou ` · não assinado`. Botões pequenos: `Visualizar` (modal §3.8), **[MUDA]** `Copiar texto` mantido, **[NOVO]** `Imprimir / PDF` (gera PDF §5.1), `Marcar como assinado` (abre §3.7; vira `Assinado em dd/mm/aaaa por {quem}` com opção "Desfazer" só para admin [DECIDIR]), `Enviar no WhatsApp` (cópia). Corpo:
- Nota info: "O contrato é gerado a partir dos dados da reserva no momento da confirmação e guardado como **snapshot imutável** — mudar o preço da peça depois não altera o contrato já emitido." **[MUDA]**: o contrato nasce com o rascunho e é **regerado** (versão+1) enquanto não assinado; ao marcar assinado vira imutável (protótipo: `viewContract` reescreve `body_rendered` só se `!signed_at`). Texto sugerido: "O contrato acompanha os dados da reserva enquanto não for assinado. Depois de marcado como assinado, vira snapshot imutável."
- ~~Botões desabilitados "Gerar PDF", "Assinatura eletrônica", "Enviar por WhatsApp" + "previstos na arquitetura · fora do escopo deste pré-MVP"~~ **REMOVIDOS** (PDF e WhatsApp agora existem; assinatura eletrônica é não-objetivo).
- Nota âmbar se a cliente não tem CPF: "A cliente ainda não tem CPF cadastrado. O contrato sai com o campo em branco — completar cadastro." (link edita cliente). **[MUDA]**: CPF é obrigatório no cadastro, então o aviso só existe para dados legados; manter como defesa.

**Aba Histórico**: cabeçalho "Histórico da reserva". Linha do tempo (mais recente primeiro): data `dd/mm hh:mm` · marcador colorido pelo tom do estado `to_state` · título = rótulo do estado · sub = `{reason}` + ` · {primeiro nome do usuário}`. Entradas de exceção usam `from_state=null` e `reason = 'Exceção autorizada: {motivo|kind} ({nome})'`.

---

## 3. Formulários e modais

### 3.1 Nova reserva / Editar rascunho (modal largo)

Título "Nova reserva" ([NOVO] "Editar rascunho"); sub: "A disponibilidade é verificada contra o calendário de cada peça, incluindo o buffer de higienização". O corpo é reconstruído a cada mudança de campo (mantém scroll). Estado inicial `S`:

| Campo | Tipo | Obrig. | Default | Observação |
|---|---|---|---|---|
| **Cliente \*** (`nr-cust`) | select (nome · código), ordenado por nome | sim | `customer` da URL ou vazio ("— selecionar cliente —") | **[MUDA]** vira busca (combobox) com paginação servidor; cliente precisa estar completa (nome, telefone, nascimento, CPF — já obrigatórios no cadastro). Opção "Cadastrar nova cliente" [DECIDIR] |
| Nota da cliente | info | — | — | ao escolher: `**{Nome}** — tamanho {usual_size|'não registrado'}{ · busto/cintura/quadril}.` + ` Prefere {cores}.` + ` Evita {cores}.` + 1ª observação fixada (`pinned`) |
| **Data do evento \*** (`nr-ev`) | date | sim | hoje + 10 dias (ou `eventDate`) | |
| **Retirar quantos dias antes** (`nr-pk`) | select 0–5 | — | 2 | opção 0 = "no dia"; demais "N dia(s)" |
| **Devolver quantos dias depois** (`nr-rt`) | select 1–4 | — | 1 | "N dia(s)" |
| **Tipo de evento** (`nr-type`) | input + datalist | — | "Casamento" (ou `eventType`) | sugestões: Casamento, Formatura, Aniversário, Festa corporativa, Baile de gala, Casamento civil, Premiação |
| **Desconto (R$)** (`nr-disc`) | number ≥0 step 0.01 | — | 0 | **[MUDA]** habilitado só com `reserva.discount` |
| **Período ocupado** | somente leitura | — | `dd/mm → dd/mm` + dim " + higiene" | |
| Peças | lista selecionável | ≥1 | `garment` da URL, `garments` (da prova) | ver abaixo |
| **Observações da reserva** (`nr-notes`) | textarea | — | vazio | placeholder "Combinações, ajustes prometidos, condições especiais" |

`pickup_date = event_date − pickup_offset`; `return_due_date = event_date + return_offset`. (Data de devolução por padrão é 1 dia depois; datas livres [DECIDIR]: protótipo só permite offsets.) [NOVO] campo `Local do evento` (`event_venue`) e `Canal` (loja/whatsapp/instagram) — existem no modelo e na ficha mas o protótipo não os edita; recomendado incluir.

**Seletor de peças**: eyebrow "Peças" + dim à direita (`busca livre` | `filtrado pelo tamanho {X} da cliente` | `todas as peças`). Input `nr-q` com placeholder "Buscar peça por código, nome ou cor… (limpe para voltar ao tamanho da cliente)", debounce 280 ms; busca normalizada (sem acento/caixa) em `código nome cor tecido`. Sem busca e cliente com `usual_size`: lista só `size_equiv = usual_size` **ou já selecionadas**; senão todas não-baixadas. Ordenação: livres primeiro, depois por código. Máximo 40 itens exibidos; área rolável (250 px). Cada linha: miniatura 34×44, `{nome} {código}`, sub `{cor} · tam. {label_size} · {brl0(rental_price)}`, pílula verde `livre no período` ou vermelha com `{rótulo do bloco} {dd/mm – dd/mm}` do 1º conflito (ou `reason`: "Peça baixada do acervo."/"Peça inexistente."), e ícone check se selecionada. Clique alterna seleção. Vazio: "Nenhuma peça corresponde à busca."
**[MUDA]** conflito vira **aviso**, não impede criar rascunho: a pílula vermelha continua, mas a seleção é permitida. Considerar também conflito com **outros rascunhos** (pílula âmbar `rascunho RS-… dd/mm – dd/mm`).

**Faixa de conflito** (uma por peça selecionada em conflito): vermelha [MUDA: âmbar "aviso"] `**{nome} ({código}) não está disponível.**` + por conflito `{Locação|Higienização|…} de {dd/mm – dd/mm}{ — reserva RS-…}.` + `A janela pedida vai de {dd/mm} a {dd/mm}, já incluindo {N} dia(s) de higienização.` + `**Alternativas semelhantes livres:** {nome (código)} · …` (links que trocam a peça) ou `Não há peça semelhante livre nesse período.` Alternativas: até 4, mesma categoria, não baixadas, livres no período, ordenadas por pontuação (§4.5).

**Resumo** (rodapé do corpo): `{n} peça(s)` valor bruto · `Desconto − R$` (se >0) · **Total** (22 px serifado). Com >1 peça e desconto>0: bloco "Rateio do desconto entre as peças" com `{código} {nome}   {bruto} − {rateio} = **{líquido}**` e nota "É essa receita líquida que alimenta ROI, payback e margem de cada peça."
Caixa de erros (`nr-erros`, oculta): `**Corrija antes de continuar:**` + `• {erro}` por linha; faz scroll até ela; toast "Revise a reserva" + 1º erro.

**Rodapé**: esquerda dim **[MUDA]** "O rascunho não bloqueia a peça. O calendário só é reservado ao confirmar."; botões `Cancelar` e **`Criar rascunho`** (primário). (~~"Criar pré-reserva"~~ e ~~"Confirmar reserva"~~ do rodapé removidos: confirmar é feito na ficha.) [DECIDIR] atalho "Criar e confirmar" não existe — confirmar exige contrato assinado, que só existe depois.

**Validações (`E.validateReservation`, mensagens verbatim)**, todas coletadas:
1. sem cliente: `Selecione a cliente — toda reserva pertence a alguém.`
2. sem peça: `Selecione ao menos uma peça.`
3. sem data do evento: `Informe a data do evento.`
4. devolução < retirada: `A devolução não pode ser anterior à retirada.`
5. evento < retirada: `O evento não pode acontecer antes da retirada.`
6. evento > devolução: `O evento não pode acontecer depois da devolução prevista.`
7. retirada < hoje−1: `A retirada está no passado. Revise as datas.`
8. desconto < 0: `O desconto não pode ser negativo.`
9. desconto > bruto: `O desconto ({brl(desc)}) é maior que o valor das peças ({brl(bruto)}).`

**Desconto acima do limite**: se `desconto > 0` e `desconto / bruto > discount_limit_percent/100` (default 15%) e ainda sem autorização → abre diálogo de exceção (§3.9) com `kind='desconto_acima_limite'`, título "Desconto acima do limite", detalhe `O desconto de {brl} representa {pct 1 casa} do valor das peças, acima do limite de {N}% da casa.` Ao autorizar, grava reserva e depois a exceção (`amount = desconto`).

**Efeito ao salvar (criar rascunho)** [MUDA — E.createReservation]:
1. Valida (acima). Conflitos **não** bloqueiam (avisados).
2. Insere `reservation`: `code = RS-{ano}-{seq 4 dígitos}`, `state='rascunho'`, `customer_id`, `event_date/type/venue`, `pickup_date`, `return_due_date`, `channel` (default 'loja'), `total_gross = Σ unit_price`, `discount`, `total_net = gross − discount`, `deposit_amount` (0 ou sugerido §4.4), `late_fee = 0`, `notes`, `created_by`.
3. Insere um `reservation_item` por peça com `unit_price = rental_price`, rateio de desconto (§4.2), `item_state='pendente'`.
4. **Não** cria blocos de calendário, **não** muda estado de peça (protótipo: bloco `pre_reserva`/`locacao` + `reservado`/`pre_reservado`).
5. Insere `reservation_state_history(null → rascunho, 'Reserva criada')`.
6. Gera o contrato (`contract` versão 1, número `CT-…`, corpo renderizado do template) — protótipo fazia na criação.
7. Se veio de prova: vincula `fitting_session.reservation_id`, estado da prova `convertida`, `ended_at = agora`, fecha compromissos da prova.
8. Agenda: protótipo cria 3 compromissos (`evento` 19:00 se há data, `retirada` 10:00, `devolucao` 11:00). **[MUDA/DECIDIR]** criar na **confirmação** (rascunho não promete horário); em edição de rascunho nada a sincronizar.
9. Fecha modal, toast "Reserva criada" (`{code} · rascunho`) e vai para `/reservas/:id`.
Editar rascunho: mesmos campos; recalcula totais/rateio, regera contrato (`version+1`, `generated_at`), registra auditoria.

### 3.2 Confirmar reserva [MUDA] (modal; `reserva.confirm`)

Pré-condições mostradas como checklist no topo:
- `Contrato assinado` ✔/✘ (link "Marcar como assinado" abre §3.7). Sem contrato assinado o botão `Confirmar reserva` fica desabilitado; erro de servidor `CONTRATO_NAO_ASSINADO` → "Marque o contrato como assinado antes de confirmar."
- `Sinal mínimo` — `min_signal_percent`% de `total_net` (default 50%): `Sinal mínimo: {brl}`.

Campos do sinal (cria o pagamento junto, atômico):
| Campo | Tipo | Obrig. | Default |
|---|---|---|---|
| Valor do sinal (R$) | number step 0.01 | sim | `total_net × min_signal_percent/100` (2 casas) |
| Forma | select (§6 PAYMENT_METHOD) | sim | PIX |
| Referência | input | não | placeholder "E2E do PIX, NSU, link" |
| Observação | input | não | placeholder "Sinal recebido na prova" |

Regras: valor > 0 e ≤ total_net (`O valor excede o saldo em aberto ({brl}).`). Se valor < mínimo → mostra nota âmbar "Sinal abaixo do mínimo ({brl}). Só o Administrador pode dispensar." e o botão vira `Dispensar sinal mínimo e confirmar` → abre §3.9 com `kind='dispensa_sinal_minimo'` (detalhe: `{cliente} vai confirmar {code} com sinal de {brl}, abaixo do mínimo de {brl} ({N}%).`). Exceção gravada com `amount = mínimo − sinal`.
Efeito (RPC única, transação com lock): (1) valida contrato assinado; (2) valida **todas** as peças contra o calendário ignorando blocos da própria reserva; (3) se alguma falha → nada muda, auditoria `Confirmação recusada: {n} peça(s) em conflito. Nenhum bloco foi alterado.` e o modal "Confirmação recusada"; (4) senão: cria blocos por peça (§4.5), `garment.state='reservado'` com histórico `Reserva {code} confirmada`, registra pagamento `sinal` (`state='pago'`, `paid_at=agora`), cria o `saldo` pendente (`kind='saldo'`, `state='pendente'`, `amount = total_net − sinal`, `due_at = pickup_date`, só se >0), cria compromissos de agenda, transição `rascunho → confirmada` (motivo `Confirmação da reserva`), registra exceção se houver. Toast: `Reserva confirmada` / `{code} · peças bloqueadas com buffer de higienização.`
**Modal "Confirmação recusada"** (sub `{code} · nada foi alterado`): faixa vermelha `**O rascunho continua intacto.** {n} peça(s) entraram em conflito desde que o rascunho foi criado — e o sistema não confirma nada pela metade: ou todas as peças passam, ou nenhuma é alterada.` + uma faixa âmbar por peça: `**{código} — {nome}**` + conflitos `{tipo} de {dd/mm – dd/mm}{ — reserva RS-…}.` + `{reason}`; faixa info: `Remova a peça em conflito, mude as datas ou troque por uma alternativa livre — e confirme de novo.`; botão `Entendi`. Toast de erro "Confirmação recusada" `Conflito em {códigos}. Nenhum bloco foi alterado.`

### 3.3 Adicionar peça / Remover peça [NOVO, só em `rascunho`]
Modal reutiliza o seletor de peças da §3.1 (busca, pílulas de disponibilidade, alternativas). Ao salvar: insere `reservation_item` (`unit_price = rental_price`), recalcula `total_gross`, `total_net`, rateio, regera contrato. Remover: apaga o item (mín. 1 peça; senão erro "Selecione ao menos uma peça."). Itens de reserva confirmada não são editáveis na v1 (protótipo também não): para trocar peça, cancelar e recriar. [DECIDIR]

### 3.4 Lançar pagamento (modal; `financeiro.payment`)
Título "Lançar pagamento"; sub `{code} · saldo {brl(due)}` + ` · caução retida {brl}` se houver.
| Campo | Tipo | Default / opções |
|---|---|---|
| **Tipo** (`pg-kind`) | select | Sinal, Saldo, Integral, Caução, Multa por atraso, Estorno. Default `saldo` se já há pagamento líquido > 0, senão `sinal`. Dica abaixo muda por tipo (ver abaixo). |
| **Forma** (`pg-method`) | select | PIX (default 1ª), Cartão de crédito, Cartão de débito, Dinheiro, Link de pagamento, Transferência, Outros |
| **Valor (R$)** (`pg-amount`) | number step 0.01 min 0 | sinc. ao mudar tipo: `caucao` → caução sugerida (§4.4); `estorno` → `caução retida || pago`; demais → saldo (`due`) |
| **Referência** (`pg-ref`) | input | placeholder "E2E do PIX, NSU, link" |
| **Observação** (`pg-note`) | input | placeholder "Sinal recebido na prova" |

Dicas por tipo: sinal "Entrada paga na reserva. Abate o valor devido." · saldo "Restante do valor da locação." · integral "Pagamento único do total." · caução "Garantia retida. NÃO abate o valor devido e deve ser devolvida na finalização." · multa "Cobrança por atraso ou dano." · estorno "Devolução de valor à cliente — inclusive da caução."
Texto extra: `Caução sugerida para esta peça: {brl} — facultativa.` (quando >0). Nota info: "Uma reserva aceita vários lançamentos: sinal, saldo, caução, multa e estorno convivem. A caução não abate o valor devido — ela é retida e devolvida no fim." (remover a linha sobre gateway; sem gateway na v1).
Validação (`E.validatePayment`): `O valor do pagamento deve ser maior que zero.`; para tipos ≠ estorno/caução, valor > saldo+0,01 → `O valor excede o saldo em aberto ({brl}).` Erros via toast "Revise o lançamento".
Efeito: insere `payment {state:'pago', paid_at: agora, created_by, kind, method, amount, reference, notes}`. **[MUDA]** não há mais transição automática `aguardando_pagamento → confirmada`. Se existir pagamento `pendente` do mesmo tipo (saldo/multa) é quitado/atualizado em vez de duplicado [DECIDIR]. Toast: caução `Caução de {brl} retida.` · estorno `Estorno de {brl} registrado.` · senão saldo>0 `Ainda faltam {brl}.` / `Reserva quitada.`
[NOVO] Devolução de caução: ação "Devolver caução" na aba Pagamentos (habilitada após inspeção da última peça, estado `finalizada`/`em_inspecao` concluída) cria lançamento `estorno` com `refers_to='caucao'` — não afeta saldo (§4.4).

### 3.5 Registrar retirada (modal; `reserva.pickup`)
Título "Registrar retirada"; sub `{code} · {cliente}`. Lista só itens `pendente`/`nao_entregue`; se nenhum: toast "Nada a retirar" / "Todas as peças já saíram da loja.".
- Banner: saldo>0 → faixa âmbar (red se o usuário não pode autorizar) `**Retirada com saldo pendente exige autorização.** Falta {brl}.` [MUDA] + " Um administrador precisa digitar o PIN."; saldo=0 → faixa verde "Reserva quitada. Pode entregar."
- "Conferência de saída" (eyebrow) + dim "desmarque o que não sair da loja". Por item: checkbox **marcado por padrão** `{nome} {código} {cor} · tam. {X}`, miniatura, ocre `alteration_notes`, input "Observação desta peça (ex.: cliente virá buscar amanhã)".
- Checkbox (marcado) "Orientações de uso e devolução explicadas" — só confirmação visual, não persistida. ~~Checkbox "Contrato assinado pela cliente"~~ **REMOVIDO** (assinatura é pré-requisito da confirmação; protótipo marcava `signed_at` aqui com `signature_kind='presencial'`).
- Campo "Observação da retirada" (placeholder "Peça entregue com capa protetora e cabide") → se preenchido grava `customer_interaction {kind:'atendimento', channel:'presencial', content:'Retirada — {texto}', reservation_id}`.
- Rodapé: `Cancelar`; (saldo>0) `Receber agora` (fecha e abre Lançar pagamento); primário `Confirmar retirada` ou, com saldo, `Autorizar e entregar`.
- Validação: nenhuma peça marcada → toast "Nenhuma peça marcada" / "Marque o que a cliente está levando.".
- Com saldo: guarda os checkboxes, abre §3.9 (`kind='retirada_com_saldo'`, `amount = saldo`, título "Retirada com saldo pendente", detalhe `{cliente} está levando a(s) peça(s) com **{brl}** em aberto na reserva {code}.`), depois executa. Toast `Retirada autorizada` / `{brl} em aberto · autorizada por {nome}.`
- Efeito (`E.pickupItems`): ver §4.7. Toasts: completa `Retirada registrada` / `{code} · {n} peça(s) em uso, devolução {dd/mm}.`; parcial `Retirada parcial registrada` / `{n} entregue(s), {m} pendente(s) na loja.`

### 3.6 Registrar devolução (modal; `reserva.return`)
Título "Registrar devolução"; sub `{code} · {cliente}`. Lista itens `retirado`; se nenhum: toast "Nada a devolver" / "Todas as peças já voltaram.".
- Banner: atraso>0 → vermelha `**{n} dia(s) de atraso.** Multa contratual de {pct}% ao dia: **{brl(total_net × pct/100 × n)}**. Lançada como cobrança pendente.`; senão verde "Devolução dentro do prazo."
- Info: "Cada peça marcada entra em **inspeção** e fica indisponível para novas reservas até a Operação liberar. O que ficar desmarcado continua com a cliente e a multa segue correndo."
- "Peças recebidas agora" + dim "marque só o que voltou de fato". Por item: checkbox marcado, nome, código, dim `retirada dd/mm hh:mm`, input "Ocorrência desta peça (ex.: mancha na barra, cliente avisou)". Abaixo, dim `Já recebidas nesta reserva: {códigos}.`
- Rodapé `Cancelar` / `Confirmar devolução`. Nenhuma marcada → "Nenhuma peça marcada" / "Marque o que a cliente devolveu.".
- Toast: completa `Devolução registrada` (`Multa de {brl} lançada. {n} peça(s) em inspeção.` | `{n} peça(s) em inspeção.`); parcial `Devolução parcial registrada` (`{n} recebida(s) · {m} ainda com a cliente.`). Depois vai para `/operacao` se `operacao.view`, senão recarrega.

### 3.7 Marcar contrato como assinado [NOVO]
Modal "Marcar contrato como assinado": nota "Confirme que a via impressa foi assinada pela cliente na loja." Campos: Assinado em (date, default hoje), Quem assinou (input, default nome da cliente), Observação (opcional). Efeito: `contract.signed_at`, `signed_by` (usuário), `signer_name`, `signature_kind='presencial'`; congela o corpo (snapshot). Grava auditoria. Permissão: `reserva.confirm`. Só habilitado se a reserva não está `cancelada|no_show`.

### 3.8 Visualizar contrato
Modal largo, título "Contrato de locação", sub = número `CT-…`; corpo texto mono pré-formatado (§5.1); rodapé `Fechar` e `Copiar texto` (copia para a área de transferência; sucesso toast "Contrato copiado" / "Cole no WhatsApp, no e-mail ou no editor."; falha "Não foi possível copiar" / "Use o botão Visualizar e selecione o texto."). [NOVO] botão `Imprimir / PDF`.

### 3.9 Autorizar exceção (PIN) — usa `src/features/exceptions/AuthorizeExceptionDialog`
Substitui `UI.authorize` do protótipo (que deixava qualquer usuário com a permissão autorizar escolhendo o responsável, com motivo ≥ 6 caracteres). **[MUDA]**: `kind` ∈ `retirada_com_saldo | desconto_acima_limite | dispensa_sinal_minimo`; props `refType='reservation'`, `refId`; campos Administrador (select), PIN (4–6 dígitos), Motivo (obrigatório; erro "Informe o motivo"). Erros: "Administrador ou PIN inválido", "Muitas tentativas. Tente de novo em 15 minutos.". Retorna `id` da exceção; registra quem/quando/motivo/valor. Na criação de reserva (ainda sem id) usar `refType='reservation_draft'`/id temporário ou autorizar depois do insert [DECIDIR].

### 3.10 Cancelar reserva (confirmação; `reserva.cancel`)
Título "Cancelar reserva"; texto: `Cancelar **{code}**? As peças voltam ao acervo e o calendário é liberado imediatamente. Pagamentos já recebidos seguem lançados e devem ser estornados separadamente, conforme a política de cancelamento do contrato.` Botão destrutivo `Cancelar reserva`. **[MUDA/NOVO]** campo obrigatório "Motivo do cancelamento" (textarea; protótipo grava fixo `Cancelada pela equipe`) e, quando há pagamento recebido, nota com a política do contrato (§5.1 cláusula 7) e atalho "Lançar estorno". Efeito: §4.8.

---

## 4. Regras e cálculos

### 4.1 Parâmetros (tabela `setting`; `E.cfg`)
| chave | default | uso |
|---|---|---|
| `default_cleaning_days` | 2 | buffer de higienização pós-devolução (fallback final) |
| `default_prep_days` | 0 | dias de preparação antes da retirada |
| `late_fee_daily_percent` | 20 | multa diária em % de `total_net` |
| `deposit_percent` | 0 | caução padrão (% do valor de referência) — no protótipo não é lido por nenhum cálculo (só exibido); aqui deve alimentar a sugestão (§4.4) |
| `discount_limit_percent` | 15 | desconto máximo sem autorização (% do bruto) |
| `min_signal_percent` | 50 **[NOVO]** | sinal mínimo para confirmar (% de `total_net`) |
| `idle_alert_days` | 90 | (Inteligência) |
| ~~`hold_duration_hours` (24)~~ | | **REMOVIDO** |
Categorias (`default_cleaning_days`, prep 0): vestido-longo 3, vestido-midi 2, vestido-curto 2, vestido-sereia 3, macacao 2, conjunto 2, saia 1, bolsa-acessorio 1.

### 4.2 Totais, desconto, rateio
- `total_gross = Σ unit_price` (= `rental_price` de cada peça na criação; preço congelado no item).
- `discount = Σ item_discount + discount_pedido`. UI só tem desconto de pedido (R$); `item_discount` existe no modelo (sempre 0 na UI).
- `total_net = total_gross − discount`; `devido = total_net + late_fee`.
- **Rateio** (`E.prorate`): por item `base = max(0, gross − item_discount)`; `desc = min(max(0, desconto_pedido), Σ base)`. Se `Σbase ≤ 0` ou `desc ≤ 0`: `net = round2(base)`. Senão `alloc_i = floor(desc × base_i/Σbase × 100)/100`; o resto de centavos (`desc − Σalloc`) vai para o item de **maior base**; `net_i = round2(base_i − alloc_i)`. Invariante: `Σ net_i = total_net`. `net_revenue` alimenta Inteligência (economia por peça).
- Limite de desconto: precisa de exceção quando `bruto > 0` e `desconto/bruto > discount_limit_percent/100` (estritamente maior).

### 4.3 Saldo (`E.balance`)
```
pago_bruto = Σ payment.amount  where state='pago' and kind ∉ {caucao, estorno}
estorno    = Σ amount where kind='estorno' and state='pago'
caucao     = Σ amount where kind='caucao' and state='pago'
liquido    = pago_bruto − estorno
due        = max(0, round2(devido − liquido))
status     = liquido ≤ 0 ? nao_pago : (liquido ≥ devido − 0.009 ? pago : parcial)
```
Pendentes não contam. Caução nunca abate. **Quirk do protótipo**: todo `estorno` (inclusive de caução) reduz `liquido`; **[MUDA]** estorno com `refers_to='caucao'` deve ser excluído de `estorno` acima e abater `caucao` retida.
Saldo a receber da reserva alimenta "a receber" da lista e Contas a Receber (parcelas: sinal, saldo, caução, multa).

### 4.4 Sinal, saldo e caução [MUDA]
- Sinal mínimo = `round2(total_net × min_signal_percent/100)`; confirmação exige `sinal ≥ mínimo` ou exceção `dispensa_sinal_minimo` (admin PIN). Sinal pago no ato de confirmar (seed histórico usa 50% sinal + saldo na retirada).
- Saldo = `devido − pago`, vence na `pickup_date`; retirada com saldo>0 só com exceção `retirada_com_saldo`.
- Caução: `reservation.deposit_amount` (campo, default 0; protótipo nunca o preenche pela UI). Sugestão ao lançar caução: protótipo = `deposit_suggested` da 1ª peça (`round(retail_reference × 0.1 / 10) × 10`; 0 para `bolsa-acessorio`) ou, se 0, `devido × 10%`. **[DECIDIR]** com `deposit_percent > 0`: `Σ retail_reference × deposit_percent/100`; senão manter regra do protótipo. Caução é custódia: fora de faturamento/resultado; devolvida após inspeção (lançamento de estorno de caução).
- Caixa: faturamento = dinheiro efetivamente recebido (design §3.5).

### 4.5 Disponibilidade, conflito e buffer
- **Buffer efetivo** (`E.buffer`): `cleaning = garment.cleaning_days ?? category.default_cleaning_days ?? setting.default_cleaning_days`; `prep` idem com `prep_days`.
- **Janela** (`E.window`): `occupied_from = pickup − prep`; `occupied_to = return_due + cleaning`; limpeza ocupa `return_due+1 … return_due+cleaning` (se `cleaning>0`).
- **Check** (`E.check(garment, pickup, return, ignoreReservationId)`): reprova se peça `baixado` ("Peça baixada do acervo.") ou inexistente ("Peça inexistente."). Conflito = todo bloco ativo da peça (`released_at is null`) que **sobrepõe inclusivamente** `[occupied_from, occupied_to]`, ignorando blocos da reserva em `ignore` e blocos **históricos** (bloco `locacao` cuja reserva está `finalizada|cancelada|no_show`; a higienização aberta por uma devolução continua valendo). Retorna `{ok, window, conflicts[{kind label, reservation, period}]}`. **[MUDA]** blocos `pre_reserva` removidos; `BLOCK_KIND` válidos: `locacao` (Locação, vinho, LOC), `higienizacao` (HIG), `inspecao` (INSP), `ajuste` (AJU), `manutencao` (MAN), `bloqueio_manual` (Bloqueio, BLQ), `editorial` (EDIT).
- **Rascunho**: `check` avisa mas não impede; também avisa sobre **outro rascunho** da mesma peça cujo período + buffer se sobrepõe. No banco, garantia dura = constraint de exclusão `daterange`+`btree_gist` nos blocos ativos (só existem para confirmadas).
- **Blocos ao confirmar** (`E.makeBlocks`, por peça): se `prep>0` bloco `inspecao` `[pickup−prep, pickup−1]` nota "Preparação"; bloco `locacao` `[pickup, return_due]` nota "Locação"; se `cleaning>0` bloco `higienizacao` `[return_due+1, return_due+cleaning]` nota "Higienização pós-uso".
- **Realinhamento na devolução** (`E.realignOnReturn`, buffer comprimível): `locacao.end = max(data_real, locacao.start)`; limpeza passa a `[data_real+1, data_real+cleaning]`; se um bloco de **outra** reserva começa dentro desse intervalo, `fim = próximo.start − 1`; se `fim < início` a limpeza é liberada; se não existia, é criada. Devolução antecipada encolhe a locação; atrasada desloca a limpeza.
- **Alternativas** (`E.alternatives`, até 4): mesma categoria, não baixada, `id ≠`, livre no período; pontuação `+4` mesma `label_size`, `+3` mesmo `size_equiv`, `+2` mesmo `length`, `+2` mesma `color_primary`, `+1` se |Δpreço| < R$150; ordem decrescente.
- **Estado derivado da peça** (`E.deriveState`, reconcilia no boot, sem poluir histórico): estados `baixado|bloqueado|higienizacao|inspecao|ajuste|manutencao` só saem por ação da Operação. O **fato vence o plano**: peça em reserva `retirada|em_uso|aguardando_devolucao` → `em_uso` (ou `aguardando_devolucao`). Senão, bloco `locacao` de hoje: reserva retirada/em_uso → `em_uso`; aguardando_devolucao → `aguardando_devolucao`; senão `reservado`; bloco `higienizacao` de hoje → `higienizacao`; `locacao` futura → `reservado`; senão `disponivel`. (~~`pre_reservado`~~ removido.) Considerar só blocos não históricos.

### 4.6 Máquina de estados da reserva [MUDA]
```
rascunho ──confirmar(contrato assinado + sinal mínimo ou exceção)──▶ confirmada
confirmada ──(manual / ajuste concluído)──▶ pronta_retirada            [DECIDIR]
confirmada | pronta_retirada ──retirada parcial──▶ retirada ──resto──▶ em_uso
confirmada | pronta_retirada ──retirada total──▶ em_uso
retirada | em_uso ──devolução parcial──▶ aguardando_devolucao ──resto──▶ em_inspecao
em_uso | retirada | aguardando_devolucao ──devolução total──▶ em_inspecao   (devolvida: estado transitório; protótipo nunca o grava; filtro "Em inspeção" inclui ambos)
em_inspecao ──todas peças inspecionadas (E.registerInspection)──▶ finalizada
rascunho | confirmada | pronta_retirada | retirada(?) | em_uso... ──cancelar──▶ cancelada
confirmada | pronta_retirada ──no-show──▶ no_show
```
Notas fiéis ao protótipo: `retirada` = retirada **parcial** (algum item `retirado`, outros pendentes); `em_uso` = todos os itens aplicáveis já saíram. Nada move automaticamente `em_uso → aguardando_devolucao` por data; só devolução parcial (atraso é exibido por data). Cada transição grava `reservation_state_history {from,to,reason,user,occurred_at}` + auditoria.
Removidos: `atendimento`, `prova_agendada`, `pre_reserva`, `aguardando_pagamento`.
Estados "ativos" (compromisso com a peça; alertas, estatísticas da cliente, alerta `item_nao_entregue`): `confirmada, pronta_retirada, retirada, em_uso, aguardando_devolucao` (protótipo incluía `pre_reserva, aguardando_pagamento`). "Realizados" (receita da peça/cliente, Inteligência): `retirada, em_uso, aguardando_devolucao, devolvida, em_inspecao, finalizada`. "Encerrados": `finalizada, cancelada, no_show`.

### 4.7 Retirada e devolução por item (`pickupItems`, `returnItems`)
**Estados do item** (`ITEM_STATE`): `pendente → retirado → devolvido → inspecionado`; `pendente|nao_entregue → nao_entregue`; `cancelado`.
- **Retirada** (decisões `[{item_id, delivered, note}]`): entregue → item `retirado`, `picked_up_at=agora`, `pickup_note=nota`; peça → `em_uso` (histórico `Retirada — {code}`). Não entregue → item `nao_entregue`, `pickup_note = nota || 'Não entregue na retirada'` (continua bloqueado no calendário; gera alerta). `reservation.picked_up_at` = primeira entrega. `todos = todos os itens não cancelados ∈ {retirado, devolvido, inspecionado}`; novo estado = `em_uso` se todos, `retirada` se alguma entregue, senão inalterado; motivo `Todas as peças retiradas pela cliente` | `Retirada parcial — {n} de {total} peça(s)`. Compromisso `retirada` agendado → `concluido` só se todos. Se exceção: registra `exception_authorization` (kind, amount, reason, autorizador, perfil, hora), auditoria `Exceção autorizada ({kind}) de {brl} por {nome} — {perfil}. Motivo: …` e entrada no histórico da reserva.
- **Devolução** (decisões `[{item_id, returned, note}]`): ignora itens já `devolvido|inspecionado|cancelado`. Devolvido → item `devolvido`, `returned_at=agora`, `return_note`; `realignOnReturn(peça, reserva, hoje)`; peça → `inspecao` (histórico `Devolução — {code}`). `aindaFora` = itens `retirado`; `completa = aindaFora vazio`. `reservation.returned_at = completa ? agora : null`.
- **Multa por atraso**: `ref = completa ? max(returned_at dos itens) (fallback hoje) : hoje`; `atraso = max(0, dias(return_due_date → ref))` (dias corridos); `late_fee = atraso>0 ? round2(total_net × late_fee_percent/100 × atraso) : 0`. Recalculada a cada devolução (relógio corre enquanto houver peça na rua). **Uma única** cobrança `payment {kind:'multa', method:'pix', state:'pendente', due_at: hoje, notes: '{n} dia(s) de atraso[ · {k} peça(s) ainda na rua]'}` por reserva: atualizada se existe, criada se não, **removida** se fee volta a 0. Compromisso `devolucao` → `concluido` só se completa. Novo estado: `em_inspecao` (completa; motivo `Devolvida com {n} dia(s) de atraso` | `Devolvida no prazo`) ou `aguardando_devolucao` (`Devolução parcial — {n} peça(s) recebida(s), {m} pendente(s)`).
- **Inspeção** (Operação): item → `inspecionado`; quando todos os itens não cancelados ∈ {`inspecionado`,`nao_entregue`} → reserva `finalizada` (`Todas as peças inspecionadas`). Destinos da peça: aprovada/ressalva → `higienizacao`; reprovada/dano → `manutencao`; perda → `bloqueado` (30 dias).

### 4.8 Cancelamento / no-show
Libera **todos** os blocos da reserva (`released_at=agora`); recalcula o estado de cada peça por `deriveState` (histórico `Reserva {code} cancelada`); compromissos `agendado` da reserva → `cancelado`; grava `cancel_reason`; transição `cancelada` (motivo = texto) ; `reconcile`. Pagamentos recebidos **não** são estornados automaticamente (estorno manual conforme política contratual §5.1 cl. 7). No-show: igual, estado `no_show`. Cancelar rascunho: não há blocos; só estado.

### 4.9 Alertas ligados a reservas (`E.alerts`/`riskAlerts`; sev: critico > atencao > info; clique abre `/reservas/:id`)
- `devolucao_atrasada` (critico): `Devolução atrasada — {cliente}` / `{code} · {n} dia(s) · prevista {dd/mm}` (estado retirada/em_uso/aguardando_devolucao e `hoje > return_due`).
- `devolucao_hoje` (atencao): `Devolução hoje — {cliente}` / `{code}`.
- `retirada_amanha` (info): `Retirada amanhã — {cliente}` / `{code} · {dd/mm}` (estados `confirmada|pronta_retirada`; **[MUDA]** sem `aguardando_pagamento`).
- `pagamento_pendente` (critico se faltam ≤1 dia, senão atencao; só `financeiro.view`): `Pagamento pendente — {cliente}` / `{code} · falta {brl} · retirada {dd/mm}` quando `saldo>0` e retirada em ≤3 dias.
- ~~`pre_reserva_expirando`~~ **REMOVIDO**.
- `atraso_com_fila` (critico): `Atraso de {1º nome} compromete a próxima reserva de {código}` / `{code} venceu {dd/mm} · {code2} — {cliente2} retira {dd/mm}`.
- `peca_em_risco`, `item_nao_entregue` (atencao): `{código} não foi entregue na retirada` / `{code} — {cliente} · {pickup_note}`.

### 4.10 Códigos e numeração
`code = RS-{ano}-{NNNN}` (protótipo: contagem de reservas do ano +1 — vulnerável a corrida; no banco usar sequência por ano). Contrato `CT-{ano}-{NNNN}` (troca `RS`→`CT`). Erros de domínio sugeridos (padrão `SourceErrorCode`): `CONFLITO_AGENDA` (existente, com `hint` = período), `CONTRATO_NAO_ASSINADO`, `SINAL_INSUFICIENTE`, `RESERVA_SEM_PECAS`, `VALOR_INVALIDO`, `DESCONTO_ACIMA_LIMITE`, `SALDO_EM_ABERTO` (retirada sem exceção), `PERIODO_INVALIDO`.

---

## 5. Contrato e documentos

### 5.1 Template do contrato (`E.contractBody`) — provisório; template definitivo virá da Senzi (tabela `contract_template` versionada)
Texto plano em monoespaçado; `{…}` = placeholder. Trocar "Senzie Club" por **"Senzi Club"** (dados da locadora configuráveis: razão social, CNPJ, endereço — pendência §9 do design).
```
CONTRATO DE LOCAÇÃO DE VESTUÁRIO Nº {CT-code}

LOCADORA: Senzi Club — locação de vestuário feminino.
LOCATÁRIA: {cliente.full_name}{ — CPF {cpf}}
Telefone: {phone|whatsapp|—}{ · email}

1. OBJETO
A LOCADORA cede à LOCATÁRIA, a título de locação temporária, a(s) peça(s):
• {code} — {nome} ({cor}, tam. {label_size}) — {brl(line_total)}   [uma por item]

Valor de referência do acervo cedido: {brl(Σ (retail_reference || rental_price × 4))}.

2. PRAZO
Retirada: {dd/mm/aaaa}
Evento: {dd/mm/aaaa}{ — event_type}
Devolução prevista: {dd/mm/aaaa} até as 18h.

3. VALORES
Locação: {brl(total_gross)}
Desconto: {brl(discount)}
Total: {brl(total_net)}
Caução: {brl(deposit_amount) | 'dispensada'}
[NOVO sugerido] Sinal: {brl} · Saldo: {brl} até a retirada.

4. RESPONSABILIDADES DA LOCATÁRIA
4.1 Utilizar a peça exclusivamente no evento indicado, zelando por sua conservação.
4.2 Não lavar, passar, tingir, cortar ou submeter a peça a qualquer processo de
    higienização por conta própria. A higienização é realizada pela LOCADORA.
4.3 Não ceder, sublocar ou emprestar a peça a terceiros.
4.4 Comunicar imediatamente qualquer dano ocorrido durante o uso.

5. ATRASO NA DEVOLUÇÃO
O atraso implica multa diária de {late_fee_percent}% sobre o valor da locação,
por dia corrido de atraso, sem prejuízo da responsabilidade por prejuízos causados
a reservas subsequentes da mesma peça.

6. DANOS
6.1 Desgaste natural de uso não gera cobrança.
6.2 Manchas e danos recuperáveis: a LOCATÁRIA arca com o custo do reparo, mediante
    orçamento apresentado pela LOCADORA.
6.3 Dano irrecuperável ou extravio: a LOCATÁRIA arca com o valor de reposição da
    peça, correspondente ao seu valor de referência.

7. CANCELAMENTO
7.1 Até 15 dias antes da retirada: devolução integral dos valores pagos.
7.2 Entre 14 e 7 dias: retenção de 30% do valor da locação.
7.3 A menos de 7 dias: retenção de 50% do valor da locação.
7.4 Não comparecimento (no-show): retenção integral.

8. PROVA E AJUSTES
Ajustes de barra e pences, quando possíveis, são realizados pela LOCADORA sem custo
adicional e são desfeitos após a devolução. Alterações irreversíveis não são permitidas.

Local e data: ______________________, {hoje dd/mm/aaaa}


_______________________________        _______________________________
{cliente.full_name}                     Senzi Club
LOCATÁRIA                               LOCADORA
```
(observação: a lacuna 14–15 dias na cláusula 7 é do protótipo; manter até o template definitivo.) Número do contrato = `code` com `RS`→`CT`. Registro `contract`: `reservation_id, number, version, body_rendered, generated_at, terms {late_fee_daily_percent, deposit}, signed_at, signer_name, signature_kind, created_by`. **Saída: PDF para impressão** (A4, mesmo texto, cabeçalho com logotipo, rodapé com paginação; linhas de assinatura). Placeholders de template configuráveis sem deploy.

### 5.2 Imprimir / assinar
Fluxo: Gerar contrato (existe desde o rascunho) → `Imprimir / PDF` → cliente assina → `Marcar como assinado` (§3.7) → `Confirmar reserva`.

### 5.3 PDF da OS de aluguel / confirmação [NOVO — design §3.3]
Gerado no navegador (`@react-pdf/renderer`), salvo no Storage, acessível por **link assinado com validade** (ex.: 7 dias). Conteúdo:
- Cabeçalho: logotipo Senzi, "Ordem de Serviço / Confirmação de Reserva", `{code}`, data de emissão.
- Cliente: nome, telefone (nome e contato só para quem tem `cliente.view`).
- Peças: foto de capa, `código · nome`, cor, tamanho, observação de ajuste (`alteration_notes`), valor líquido por item.
- Datas: prova (se há; da `fitting_session`), retirada, devolução (até 18h), data e tipo/local do evento.
- Valores: locação, desconto, multa (se houver), total, **pago**, **saldo** (com vencimento = retirada), caução (valor e "devolvida após inspeção").
- Regras de atraso (multa diária {pct}% sobre o valor da locação, por dia corrido) e de cuidado (não lavar/passar/tingir, não ceder, comunicar dano; ajustes de barra/pences desfeitos na devolução).
- Dados da loja (placeholders configuráveis: razão social, CNPJ, endereço, telefone) e estado/`status` ("Confirmada").
Regerado ao confirmar, ao alterar pagamento/datas e sob demanda.

### 5.4 WhatsApp (via `https://wa.me/55{DDD+número, só dígitos}?text={encodeURIComponent(mensagem)}`)
O protótipo só tem "Copiar texto" do contrato. Mensagens propostas (saudação com 1º nome; link do PDF assinado em `{link}`):
- **Contrato (cópia)**: `Olá, {primeiro_nome}! Segue a cópia do contrato {CT-code} da sua reserva na Senzi: {link}`
- **Confirmação**: `Olá, {primeiro_nome}! Sua reserva {code} está confirmada. 💃 {n} peça(s): {nomes}. Retirada {dd/mm/aaaa}, devolução {dd/mm/aaaa} até as 18h. Valor total {brl}; pago {brl}; saldo {brl} na retirada. Detalhes e regras: {link}` (sem emoji se preferir)
- **Lembrete de retirada** (véspera): `Olá, {primeiro_nome}! Lembrando que sua retirada na Senzi é amanhã ({dd/mm}). {Falta {brl} do saldo.} Qualquer dúvida é só chamar.`
- **Lembrete de devolução**: `Olá, {primeiro_nome}! Sua devolução na Senzi está prevista para {hoje|dd/mm} até as 18h.`
- **Atraso**: `Olá, {primeiro_nome}! A devolução da reserva {code} estava prevista para {dd/mm}. Pode nos avisar quando traz as peças? Conforme o contrato, há multa diária de {pct}% por dia de atraso.`
- **Saldo pendente**: `Olá, {primeiro_nome}! Falta {brl} da reserva {code}, com vencimento na retirada ({dd/mm}).`
Ação só abre o link (envio manual); registrar [NOVO] `customer_interaction {kind:'atendimento', channel:'whatsapp', content:'WhatsApp — {tipo}'}` opcional.

---

## 6. Dados necessários (tipos e enums)

```ts
type ReservationState =
  | 'rascunho' | 'confirmada' | 'pronta_retirada' | 'retirada' | 'em_uso'
  | 'aguardando_devolucao' | 'devolvida' | 'em_inspecao' | 'finalizada'
  | 'cancelada' | 'no_show'

const RESERVATION_STATE: Record<ReservationState, {label: string; tone: Tone}> = {
  rascunho:             { label: 'Rascunho',             tone: 'stone'  }, // novo; tom sugerido
  confirmada:           { label: 'Confirmada',           tone: 'wine'   },
  pronta_retirada:      { label: 'Pronta para retirada', tone: 'wine'   },
  retirada:             { label: 'Retirada',             tone: 'indigo' },
  em_uso:               { label: 'Em uso',               tone: 'indigo' },
  aguardando_devolucao: { label: 'Aguardando devolução', tone: 'amber'  },
  devolvida:            { label: 'Devolvida',            tone: 'teal'   },
  em_inspecao:          { label: 'Em inspeção',          tone: 'teal'   },
  finalizada:           { label: 'Finalizada',           tone: 'green'  },
  cancelada:            { label: 'Cancelada',            tone: 'stone'  },
  no_show:              { label: 'No-show',              tone: 'red'    },
}
type Tone = 'green'|'amber'|'wine'|'indigo'|'teal'|'ochre'|'red'|'stone'  // sempre com rótulo de texto, dessaturados (design §6)

type ItemState = 'pendente'|'retirado'|'nao_entregue'|'devolvido'|'inspecionado'|'cancelado'
const ITEM_STATE = {
  pendente:     { label: 'A retirar',     tone: 'wine'   },
  retirado:     { label: 'Com a cliente', tone: 'indigo' },
  nao_entregue: { label: 'Não entregue',  tone: 'stone'  },
  devolvido:    { label: 'Devolvido',     tone: 'teal'   },
  inspecionado: { label: 'Inspecionado',  tone: 'green'  },
  cancelado:    { label: 'Cancelado',     tone: 'stone'  },
}

type PaymentKind   = 'sinal'|'saldo'|'integral'|'caucao'|'multa'|'estorno'
const PAYMENT_KIND = { sinal:'Sinal', saldo:'Saldo', integral:'Integral', caucao:'Caução', multa:'Multa por atraso', estorno:'Estorno' }
type PaymentMethod = 'pix'|'credito'|'debito'|'dinheiro'|'link'|'transferencia'|'outro'
const PAYMENT_METHOD = { pix:'PIX', credito:'Cartão de crédito', debito:'Cartão de débito', dinheiro:'Dinheiro', link:'Link de pagamento', transferencia:'Transferência', outro:'Outros' }
type PaymentState  = 'pago'|'pendente'|'parcial'|'estornado'|'cancelado'   // tons: pago=green, pendente=amber, demais=stone
type PayStatus     = 'nao_pago'|'parcial'|'pago'  // PAYSTATE: Não pago/red, Parcial/amber, Pago/green

type ExceptionKind = 'retirada_com_saldo'|'desconto_acima_limite'|'dispensa_sinal_minimo'
type Channel = 'loja'|'whatsapp'|'instagram'

type Reservation = {
  id: string; code: string              // RS-2026-0001
  customerId: string
  state: ReservationState
  eventDate: string | null; eventType: string | null; eventVenue: string | null
  pickupDate: string; returnDueDate: string          // aaaa-mm-dd
  pickedUpAt: string | null; returnedAt: string | null   // ISO
  channel: Channel
  totalGross: number; discount: number; totalNet: number
  depositAmount: number; lateFee: number
  notes: string | null; cancelReason: string | null
  createdBy: string; createdAt: string
  // derivados / joins
  items: ReservationItem[]; payments: Payment[]; contract: Contract | null
  authorizations: ExceptionAuthorization[]; history: ReservationHistoryEntry[]
  fittingId: string | null
  balance: { devido: number; pago: number; caucao: number; due: number; status: PayStatus }
}
// removidos vs protótipo: holdExpiresAt

type ReservationItem = {
  id: string; reservationId: string; garmentId: string
  unitPrice: number; grossAmount: number
  itemDiscount: number; allocatedOrderDiscount: number; netRevenue: number
  itemState: ItemState
  pickedUpAt: string | null; returnedAt: string | null
  pickupNote: string | null; returnNote: string | null; alterationNotes: string | null
}

type Payment = {
  id: string; reservationId: string
  kind: PaymentKind; method: PaymentMethod; amount: number; state: PaymentState
  paidAt: string | null; dueAt: string | null     // dueAt: saldo = pickupDate; multa = hoje
  reference: string | null; notes: string | null
  refersTo?: 'caucao' | null                       // [NOVO] estorno de caução
  createdBy: string; createdAt: string
}

type Contract = {
  id: string; reservationId: string; number: string   // CT-2026-0001
  version: number; bodyRendered: string; generatedAt: string
  templateVersion: number                              // [NOVO]
  terms: { lateFeeDailyPercent: number; deposit: number }
  signedAt: string | null; signedBy: string | null     // [MUDA] quem marcou
  signerName: string | null; signatureKind: 'presencial' | null
  pdfPath: string | null                               // [NOVO] Storage
}

type ExceptionAuthorization = {
  id: string; reservationId: string; kind: ExceptionKind; amount: number
  reason: string; authorizedBy: string; authorizedByName: string
  authorizedByRole: string; authorizedAt: string
}

type ReservationHistoryEntry = { id: string; fromState: ReservationState|null; toState: ReservationState; reason: string|null; userId: string; occurredAt: string }

type GarmentCalendarBlock = { id: string; garmentId: string; reservationId: string|null; maintenanceId?: string|null
  kind: BlockKind /* sem pre_reserva */; startDate: string; endDate: string; note: string|null
  releasedAt: string|null; createdBy: string }

type ReservationInput = {   // criar/editar rascunho
  customerId: string; eventDate: string; eventType?: string; eventVenue?: string
  pickupDate: string; returnDueDate: string; channel?: Channel
  discount: number; notes?: string; fittingId?: string
  items: { garmentId: string; unitPrice: number; itemDiscount?: number; alterationNotes?: string }[]
}
type ConfirmInput = { reservationId: string; signal: { amount: number; method: PaymentMethod; reference?: string; notes?: string }; exceptionId?: string }
type PickupDecision = { itemId: string; delivered: boolean; note?: string }
type ReturnDecision = { itemId: string; returned: boolean; note?: string }
```
Interface de fonte sugerida: `listReservations(filter,page)`, `getReservation(id)`, `createReservationDraft`, `updateReservationDraft`, `checkAvailability(garmentId, pickup, return, ignoreId)`, `alternatives(...)`, `generateContract`, `markContractSigned`, `confirmReservation` (RPC atômica), `registerPayment`, `pickupItems`, `returnItems`, `cancelReservation(id, reason)`, `markNoShow`, `authorizeException` (PIN, já existe).

---

## 7. Permissões (`src/auth/permissions.ts`)

| Chave | Governa em Reservas |
|---|---|
| `reserva.view` | rota `/reservas` e ficha; busca global de reservas |
| `reserva.create` | botão "+ Nova reserva", criar/editar rascunho, adicionar/remover peça |
| `reserva.confirm` | "Confirmar reserva" **e** "Marcar contrato como assinado" |
| `reserva.cancel` | "Cancelar", "Marcar no-show" |
| `reserva.pickup` | "Registrar retirada"/"Retirar o restante", "Marcar como pronta para retirada" |
| `reserva.return` | "Registrar devolução" |
| `reserva.discount` | habilitar campo Desconto (R$) [MUDA: protótipo não gateava] |
| `reserva.authorize` | permissão para o Administrador autorizar exceção; no sistema a autorização é por PIN de administrador na tela de quem opera (kinds: retirada com saldo, desconto acima do limite, dispensa de sinal mínimo). Não é necessário a atendente ter a chave. |
| `financeiro.view` | colunas Pagamento/Valor e chip "Com saldo" da lista; subtítulo "a receber"; bloco de valores na ficha; valor por item; aba Pagamentos; alerta `pagamento_pendente` |
| `financeiro.payment` | "Registrar pagamento", "+ Lançar", receber saldo/caução/estorno (Atendimento tem) |
| `operacao.inspect` | botão "Inspecionar peças" |
| `operacao.view` | redirecionar para `/operacao` após devolução |
| `cliente.view` | nome/contato/CPF visíveis; link para cliente; WhatsApp |
| `agenda.view` | compromissos de retirada/devolução/evento gerados |
`SZ.require(perm, fn)` do protótipo: ação sem permissão abre aviso; no React, esconder o botão e **a RPC valida de novo** (`has_perm`). Perfis: Administrador (tudo) e Atendimento (reserva.*, financeiro.view/payment, operacao.*; **sem** financeiro geral/consolidado, custo/margem, Inteligência, Configurações).

---

## 8. Dados de exemplo (seed do protótipo, para fixture)

Base: ~29 peças (acervo em 8 categorias; códigos `VL-…` etc.), 14 clientes, PRNG determinístico, datas relativas a hoje (`D(n)`).
**Histórico**: dezenas de reservas `finalizada`, **uma peça por reserva**, ~7 meses atrás até 9 dias atrás, sem sobreposição por peça (peças "populares" ganham até 20 locações; intervalos entre locações 11–26 / 24–52 / 58–96 dias). Cada uma: item `inspecionado`, retirada→evento (0–1 dia)→devolução (+1), desconto aleatório em {0,0,0,0,5%,10%}, pagamentos `sinal` 50% + `saldo` na retirada (forma aleatória entre pix,pix,credito,debito,dinheiro,link), contrato assinado na retirada, inspeção 86% aprovada/14% ressalva, despesa de higienização R$38–78.
**Encerradas sem locação**: 1 `cancelada` (cliente 6, Lecce R$590, "Cliente adiou a festa") e 1 `no_show` (cliente 11, Bari R$520).
**Situação atual** (nomes de peças do protótipo; `hoje=T`):
1. Portofino — `em_uso`, retirada T−5, evento T−4, devolução T−2 (**atrasada**), integral PIX R$1.250, nota "Cliente avisou que devolveria segunda-feira. Sem retorno desde então."
2. Ostuni — `em_uso`, devolução **hoje**, sinal 490 + saldo 490.
3. Firenze — `pronta_retirada`, retirada **hoje**, 525+525 pagos, ajuste "Barra ajustada para salto 8 cm — feita em 06/09."
4. Sorrento — era `aguardando_pagamento` (retirada amanhã, sinal 400, saldo no ato) → no novo modelo `confirmada` com saldo.
5. Bolonha — era `pre_reserva` (expirando em 5h) → novo: `rascunho` (conflito de exemplo).
6. Capri — era `pre_reserva` (19h) → novo: `rascunho`.
7. Verona — `confirmada`, retirada T+6, integral link R$890.
8. Toscana — `confirmada` T+19, sinal 380. 9. Amalfi — `confirmada` T+31, sinal 390.
10. Modena — `em_inspecao`, devolvida T−1, integral crédito R$820 (peça em `inspecao`).
11. Siena — era `prova_agendada` → **não existe mais** (vira só `fitting_session`).
12. Lecce (T+2) e Parma (T+3) — `confirmada`, peças presas na operação (alerta `peca_em_risco`); Lecce integral pago, Parma sinal 325.
13. **Multi-peça com desconto rateado**: Positano + Carrara, cliente 3, `confirmada`, retirada T+12/evento T+14/devolução T+16, desconto global R$180 acima do limite com exceção `desconto_acima_limite` ("Pacote vestido + clutch…"), sinal PIX 400, contrato não assinado.
14. **Devolução parcial**: Ravello (item `devolvido` T−1 18:20, peça `inspecao`) + Umbria (`retirado`, ainda na rua), cliente 11, estado `aguardando_devolucao`, retirada T−5, devolução T−1, integral PIX pago, **multa pendente** = 20% × total × 1 dia (R$ calculada), nota "Cliente avisou que traz a clutch na quinta — esqueceu em casa."
15. **Retirada com saldo autorizada**: Milano, cliente 13, `em_uso`, retirada T−1, evento hoje, devolução T+2, sinal metade PIX, exceção `retirada_com_saldo` (valor = metade restante, autorizada por Gestor — no novo modelo "Administrador" via PIN).
Mistura final: ~dezenas finalizadas; ativas ≈ 15 (3 em uso/atrasada-hoje, 1 retirada hoje, 1 parcial, 1 com saldo+retirada amanhã, 5 confirmadas futuras incl. risco, 1 multi-peça, 2 rascunhos [novo], 1 em inspeção); 1 cancelada; 1 no-show.
Compromissos de agenda associados: retirada 10:00/14:00, devolução 11:00, evento 19:00. Configuração do seed: `late_fee_daily_percent=20`, `deposit_percent=0`, `discount_limit_percent=15`, `default_cleaning_days=2`, + `min_signal_percent=50`.
Persona/usuários do seed: 1 admin, gestor(es) (virar admin), atendentes, operação (virar Atendimento) — apenas dois perfis agora.
