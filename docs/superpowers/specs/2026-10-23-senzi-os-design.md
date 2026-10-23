# Senzi OS — Design v1 (do protótipo ao sistema)

Data: 2026-10-23 · Fonte: `SenzieOS_v0.2_3.html` (protótipo) + `anotacoes.txt` + conversa com o João.

## 1. Intenção

A Senzi Club é uma locadora de vestidos de festa. O protótipo `SenzieOS_v0.2_3.html` (arquivo único, ~7.800 linhas, dados em localStorage) já modela bem o negócio: acervo, provas, reservas multi-peça, agenda, operação pós-devolução, financeiro das reservas, inteligência de acervo, perfis e auditoria.

O objetivo é transformar esse protótipo em um **sistema real, usável no dia a dia da loja**, com:
- dados persistidos num banco de verdade (Supabase/Postgres), multiusuário;
- login e permissões aplicadas **no banco** (RLS), não só na tela;
- desempenho bom com anos de histórico;
- as mudanças das anotações aplicadas **antes** de portar, para não construir duas vezes.

O protótipo é a **referência funcional**: regras, cálculos, textos e telas que não forem alterados por este documento devem ser preservados como estão lá.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Paridade funcional com o protótipo, menos o que este documento remove, mais o que adiciona.
- Nome correto em todo lugar: **Senzi** (o protótipo escreve "Senzie" — 13 ocorrências, inclusive no contrato e no "Perfil Senzie" da cliente).
- Nova identidade visual (seção 6).
- Desenvolvimento não bloqueado pela falta da conta Supabase (seção 7.4).

**Não-objetivos (v1)**
- Integração com API do WhatsApp (envio é manual, via link `wa.me`).
- Assinatura digital de contrato (contrato é impresso e assinado na loja).
- Modo escuro / temas.
- App mobile nativo (o sistema deve funcionar bem em tablet e celular pelo navegador, mas é desenhado para o balcão/desktop).
- Portal da cliente.

**Anti-objetivos (seria falha mesmo funcionando)**
- Permissão checada só no front — qualquer regra de acesso que exista só na interface.
- Duas reservas confirmadas para o mesmo vestido em datas que se sobrepõem (com o buffer de higienização).
- Perder dados que o protótipo já registra (histórico de estados, auditoria, motivos de exceção).
- Interface "ERP cinza": o sistema deve continuar com o cuidado visual do protótipo.

## 3. O que muda em relação ao protótipo

### 3.1 Dashboard
- **Alertas no topo** da página (os alertas já existem em `E.alerts` no protótipo). Cada alerta/box é clicável e leva à página respectiva (rota já existe em cada alerta).
- **Bloco da agenda expandido**, com **mini calendário do mês à direita**; clicar num dia leva à Agenda naquele dia. *(Interpretação do builder-designer, confirmar na prévia visual.)*
- **Faturamento**: mantém; adiciona botão "Ver financeiro completo" → `/financeiro`.
- **Ciclo operacional**: mantém; adiciona botão "Ver operação" → `/operacao`.

### 3.2 Agenda
- Kanban por dia mostra **4 dias visíveis**; os demais por **rolagem horizontal** (com snap por coluna e setas). Abre centrado em hoje.
- **Semana começa na segunda; domingo é o último dia.**
- Botão **Novo compromisso**: Data, Horário, Cliente, Observação + flag **Interno** (compromisso da empresa). Com "Interno" marcado, Cliente é opcional e o cartão aparece com estilo distinto. Sem "Interno", Cliente é obrigatório.
- Compromissos automáticos do protótipo (prova, retirada, devolução) continuam sendo gerados pelo sistema.

### 3.3 Reservas
- **Pré-reserva removida** (estado, blocos `pre_reserva`, expiração automática, parâmetro `hold_duration_hours`, alerta "pré-reserva expirando", permissão "criar pré-reserva").
- Nova sequência de estados da reserva (ver 4.1). A reserva nasce como **Rascunho**, que **não bloqueia** o vestido. Ao criar/editar o rascunho, o sistema **avisa** se há conflito com reserva confirmada ou com outro rascunho, mas não impede.
- **Confirmar reserva** só é possível com contrato marcado como assinado; a confirmação cria os bloqueios do calendário de forma **atômica** (função no banco com lock): se o vestido foi confirmado por outra reserva nesse meio-tempo, a confirmação falha com mensagem clara e nada muda.
- **Geração de contrato**: o motor de contrato do protótipo (`E.contractText`) é mantido como template provisório. O **template definitivo será fornecido** pela Senzi; o sistema deve permitir trocar o template sem deploy (tabela `contract_template` com versão, como no protótipo). Saída: **PDF para impressão**.
- **PDF da OS de aluguel / confirmação**: documento com dados da reserva (cliente, peças com foto, datas de prova/retirada/devolução/evento, valores, pago, saldo, caução, regras de atraso e cuidado). É salvo no Storage e acessível por **link assinado com validade**.
- **Enviar no WhatsApp**: botão abre `https://wa.me/<telefone>?text=<mensagem pronta>` com saudação, resumo e o link do PDF. Usado para enviar contrato (cópia), confirmação e lembretes.

### 3.4 Clientes
- **Modelo ideal**: no cadastro/edição da cliente, a atendente escolhe uma peça do acervo que veste bem nela; as medidas da cliente (busto, cintura, quadril, etc.) são **pré-preenchidas a partir das medidas da peça** (`garment_measurement`). Todos os campos continuam **editáveis e livres**. A peça escolhida fica registrada como "modelo ideal" da cliente.
- **Campos obrigatórios**: Nome, Telefone, Data de nascimento e CPF (CPF validado por dígito verificador e único por cliente).
- **Agendar prova exige cliente completa** (decisão do João): o formulário de agendamento de prova busca a cliente existente ou permite cadastrá-la ali mesmo, com os quatro campos obrigatórios. Não existe pré-cadastro/lead.
- **Recomendações**: na ficha da cliente, lista de peças disponíveis sugeridas a partir do histórico (peças alugadas, provas com resultado positivo, favoritas, medidas, categoria, cor, tamanho), excluindo peças que ela já alugou e peças que deram "apertada/larga/não gostou". Regra de pontuação a cargo do builder, explicável na tela ("porque alugou X e Y").

### 3.5 Financeiro
- Passa a ser o **financeiro geral da empresa**, com submenu:
  - **Contas a Receber** — inclui automaticamente as parcelas das reservas (sinal, saldo, caução, multa) e permite lançamentos avulsos.
  - **Contas a Pagar** — despesas (substitui/expande a tabela `expense` do protótipo), com vencimento, status, recorrência simples.
  - **Categorias** — CRUD de categorias de receita/despesa.
  - Visão geral (o que o protótipo já mostra: faturamento, recebido, a receber, resultado).
- Modelo de pagamento da reserva **igual ao protótipo**: sinal na confirmação, saldo até a retirada (retirada com saldo exige autorização de exceção), caução registrada e devolvida após inspeção, multa por atraso, estorno.
- **Sinal mínimo para confirmar** (decisão do João): novo parâmetro `min_signal_percent` (padrão 50% do valor da reserva). Confirmar sem atingir o mínimo só com dispensa do Administrador (exceção auditada). `deposit_percent` continua sendo a **caução** padrão, como no protótipo.
- Ao confirmar, o **saldo** vira conta a receber com vencimento na data de retirada. *(decisão do builder-designer)*
- **Caução** aparece separada: não entra em faturamento nem resultado; é dinheiro em custódia até a devolução. *(decisão do builder-designer)*
- Faturamento/resultado em **regime de caixa** (dinheiro efetivamente recebido/pago), como o protótipo. Custo de aquisição da peça continua vindo do cadastro da peça para o payback da Inteligência. *(decisão do builder-designer)*

### 3.6 Operação pós-devolução — igual ao protótipo
- **Higienização e manutenção são coisas distintas** (decisão do João), com estados de peça separados, exatamente como no protótipo (`E.inspect`, `E.closeMaintenance`, `E.release`):
  - Devolução → **Inspeção**;
  - inspeção **aprovada** → **Higienização**;
  - inspeção **com ressalva** → **Higienização**, e opcionalmente abre ordem de reparo leve;
  - inspeção com **dano** → **Manutenção**;
  - concluída a higienização/manutenção → **Disponível** (volta ao acervo).
- "Manutenção" nas anotações do João era o nome geral da etapa; no sistema os dois caminhos seguem o protótipo.
- **"Envia pra ajuste"** (ajuste da peça para a cliente antes da retirada) continua existindo como no protótipo (estado `ajuste` da peça), entre a confirmação e a retirada.

### 3.7 Inteligência
- **Mantida como está** em conteúdo e cálculos (é uma das telas mais importantes). Permitido melhorar visualização/organização (agrupamento por pergunta de negócio, filtros, gráficos melhores).
- Cálculos pesados vão para o banco (views/funções SQL) para não carregar o histórico inteiro no navegador.

### 3.8 Configurações
- **Dois perfis**: **Administrador** (tudo) e **Atendimento**. Permissões extras/revogadas por usuário, como no protótipo, continuam existindo.
- Atendimento = permissões atuais de `atendimento` **+** as de `operacao` do protótipo (inspeção, manutenção, liberação, bloqueio de peça). Atendimento **não** vê: financeiro geral (contas a pagar, categorias, resultado), custo/margem das peças, Inteligência, Configurações. Atendimento **vê e lança** pagamentos da reserva.
- **Auditoria**: mantida; passa a ser gravada pelo banco (trigger), não pelo front.
- **Autorização de exceções** (retirada com saldo, desconto acima do limite, dispensa de sinal mínimo): o Administrador digita seu **PIN** na tela da atendente; o PIN é verificado no servidor (hash, com limite de tentativas) e a exceção registra quem autorizou, motivo e horário. Premissa do João: sempre há um Administrador na loja; revisitar depois.

### 3.9 Fluxo completo do sistema (referência)
Agenda prova → Prova → Cadastra cliente → Cria reserva (rascunho) → Gera e imprime contrato → Cliente assina → Confirma reserva + sinal → Envia confirmação (PDF + WhatsApp) → Ajuste da peça (se necessário) → Retirada (saldo + caução) → Devolução → Inspeção → Higienização ou Manutenção (conforme a inspeção) → Volta ao acervo → caução devolvida.

## 4. Regras de domínio

### 4.1 Estados da reserva
`rascunho` → `confirmada` → `pronta_retirada` → `retirada` → `em_uso` → `aguardando_devolucao` → `devolvida` → `em_inspecao` → `finalizada`; e `cancelada`, `no_show`.
- Removidos: `atendimento`, `prova_agendada` (prova vive em `fitting_session`), `pre_reserva`, `aguardando_pagamento` (substituído pela condição contrato assinado + sinal no ato de confirmar).
- `contract.signed_at` registra a marcação de assinado (quem, quando).
- Itens da reserva mantêm ciclo próprio (`ITEM_STATE` do protótipo).

### 4.2 Estados da peça
Iguais ao protótipo (`SZ.GARMENT_STATE`): `disponivel`, `reservado`, `retirado`, `em_uso`, `aguardando_devolucao`, `higienizacao`, `inspecao`, `ajuste`, `manutencao`, `bloqueado`, `baixado`. Único removido: `pre_reservado` (consequência da remoção da pré-reserva).

### 4.3 Disponibilidade
Bloco de calendário por peça (`garment_calendar_block`) como no protótipo, com buffer de higienização após a devolução prevista. Garantia de não-sobreposição no banco (constraint de exclusão com `daterange` + `btree_gist` para blocos ativos).

### 4.4 Regras preservadas do protótipo
Buffer comprimível, exceções autorizadas (retirada com saldo, desconto acima do limite) com motivo e responsável, atrasos e multa, histórico de estados, alertas (exceto pré-reserva), aniversários, conversão de provas, economia da peça (payback). O builder deve ler o protótipo (`E.*`, linhas ~1218–2400) como especificação dessas regras.

## 5. Arquitetura (decisões do builder-designer, não do João)

- **Front-end**: React + TypeScript + Vite, SPA. Roteamento com React Router; dados com TanStack Query; formulários com React Hook Form + Zod. Componentes próprios portando o design system do protótipo (sem biblioteca visual pesada).
- **Back-end**: Supabase — Postgres, Auth (e-mail + senha; usuários criados pelo Administrador, sem cadastro público), Storage (fotos das peças, PDFs), RLS em todas as tabelas.
- **Regras críticas no banco**: transições de estado, confirmação de reserva, retirada, devolução, inspeção e liberação são **funções Postgres (RPC)** com `security definer` controlado e checagem de permissão dentro — atomicidade e segurança no mesmo lugar. O front não altera estado diretamente em tabela.
- **PDFs**: gerados no navegador (`@react-pdf/renderer`) e enviados ao Storage; link assinado para WhatsApp.
- **Deploy**: Vercel (front) + Supabase. Variáveis em `.env` com `.env.example` versionado.
- **Datas**: fuso `America/Sao_Paulo` (o protótipo menciona Palmas/Gurupi — TO, que é UTC−3 sem horário de verão; usar `America/Araguaina`). Valores em `numeric(12,2)`.
- **Performance**: paginação e busca no servidor (índices trigram para nome/CPF/telefone/código), agregações da Inteligência e do Dashboard em views/funções SQL, imagens redimensionadas no upload.
- **Segurança**: RLS por permissão (tabela `role_permission` + `user_permission_override`, função `has_perm()`), auditoria por trigger, CPF/telefone visíveis só a quem tem `cliente.view`, Storage privado com URLs assinadas, nenhuma chave de serviço no front.

## 6. Identidade visual

- **Modo único claro** (remover `prefers-color-scheme` e qualquer tema escuro).
- Paleta:
  - Cranberry `#3F1116` — cor principal; **sidebar esquerda** inteira nesta cor, texto/ícones em Beige.
  - Beige `#FEEFDC` — cor principal clara (texto da sidebar, realces).
  - Cranberry Vivo `#6E2027` — links, foco, botão primário, estados de interface; nunca em grandes áreas.
  - Papel `#FBF3E8` — fundo de áreas grandes.
  - Areia `#E1D1B9` — divisores, molduras, campos inativos, bordas de tabela.
  - Tinta `#1C1A18` — texto principal (substitui preto).
  - Névoa `#6F645B` — apenas texto secundário.
- Fundo da área de conteúdo: Papel com a **textura de papel bege** (gradiente sutil Beige→Areia claro, como na referência), cards em **branco**/Papel com borda Areia.
- Cores de status (verde, âmbar, índigo, teal, ocre, vermelho, pedra) continuam existindo, **dessaturadas** para conviver com a paleta, e sempre com rótulo de texto (não só cor). Contraste mínimo WCAG AA.
- Tipografia: manter a do protótipo (Instrument Sans / Instrument Serif / IBM Plex Mono) salvo indicação contrária.
- Uma **prévia visual** (dashboard + agenda) é aprovada pelo João antes de construir as telas.

## 7. Restrições e operação

7.1 Idioma pt-BR em toda a interface, moeda BRL, datas dd/mm/aaaa.
7.2 Funcionar bem em desktop (balcão) e tablet; celular utilizável para consulta.
7.3 Migração de dados: o protótipo tem seed de demonstração; não há dados reais a migrar. Haverá seed de demonstração para desenvolvimento e um banco de produção limpo.
7.4 **Sem conta Supabase ainda / sem Docker na máquina**: o projeto nasce com `supabase/` (config, migrations, seed, policies) e `.env.example`. Testes de banco (regras, RLS, RPCs) rodam com **PGlite** (Postgres em WASM, sem Docker) no Vitest. Quando a conta existir: `supabase link` + `supabase db push`. Opcional: instalar OrbStack/Docker para rodar Supabase local completo.

## 8. Ordem sugerida de entrega

1. Fundação: projeto, design system novo, layout/sidebar, login, perfis e RLS, auditoria.
2. Acervo + Clientes (com modelo ideal e obrigatórios).
3. Agenda + Provas.
4. Reservas (rascunho → confirmação atômica), pagamentos, contrato e OS em PDF, WhatsApp.
5. Operação (inspeção, manutenção com tarefas, liberação).
6. Financeiro geral (a pagar, a receber, categorias).
7. Dashboard + Inteligência.

## 9. Pendências conhecidas

- Template definitivo do contrato (Senzi vai enviar).
- Fluxo de autorização quando não houver Administrador na loja (adiado).
- Dados da empresa para PDFs (razão social, CNPJ, endereço, regras de cuidado/atraso) — usar placeholders configuráveis.

## 10. Deixado ao builder

Estrutura de pastas, bibliotecas auxiliares, nomes de colunas novas, algoritmo de recomendação, layout exato das novas telas (Financeiro, Novo compromisso) seguindo o design system, estratégia de testes de UI.
