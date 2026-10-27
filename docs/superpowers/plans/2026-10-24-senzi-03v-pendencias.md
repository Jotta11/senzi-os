# Plano 3V — decisões tomadas e pendências

Plano: `2026-10-24-senzi-03v-visual-demais-telas.md` · branch `etapa-3` · 492 testes verdes.

## Decisões para o João conferir na prévia

1. **Cancelar reserva** só antes de as peças saírem da loja (rascunho, confirmada, pronta para retirada). Com peça na rua, o caminho é registrar a devolução.
2. **"Interno"** no Novo compromisso: cliente opcional, observação obrigatória; cartão com borda tracejada. "Serviço" também pode ser sem cliente (ex.: "Coleta da lavanderia"); "Atendimento" exige cliente.
3. **Provas** ganhou item próprio na barra lateral (abaixo de Agenda).
4. **Prova vira "convertida"** quando o rascunho da reserva é criado a partir dela.
5. **Compromissos da reserva** (retirada 10h, evento 19h, devolução 11h) entram na agenda só na confirmação.
6. **Sinal igual ao total** é registrado como "Integral".
7. **Multa por atraso** usa o % do contrato assinado (cai no parâmetro geral se não houver contrato).
8. **Caução** fica fora do faturamento e do resultado ("Caução em custódia"); devolução da caução não mexe no saldo.
9. **Liberar peça** na Operação mantém os bloqueios planejados de reservas ainda vivas.
10. **Atendimento** vê valores das reservas e lança pagamentos, mas não vê resultado, custo, contas a pagar, categorias nem Inteligência.
11. **Dados de exemplo da Inteligência** foram ajustados para mostrar todos os insights (sereia ~31% de ocupação, longo ~16%).
12. **PIN de demonstração:** Júlia Senzi, 1234.

## Pendências (para o Plano 2B / próximas etapas)

- PDFs: hoje são páginas de impressão ("Imprimir / salvar PDF"). Link assinado no Storage e PDF anexado ao WhatsApp ficam para quando houver banco.
- Dados da empresa no contrato/OS (razão social, CNPJ, endereço) e template definitivo do contrato.
- ~~No banco, as RPCs de financeiro/dashboard precisam esconder campos consolidados sem `financeiro.consolidated` (na prévia só a tela esconde).~~ **Feito no Plano 2B: Financeiro (área 4) e Dashboard/Inteligência (área 6 — `finance` null, alertas por permissão, custos null sem `acervo.cost`).**
- Telas usam o relógio do navegador para "hoje" em alguns pontos; no banco, devolver `today` junto com as leituras. **Dashboard e Inteligência feitos (área 6: `today` e `period.to` = `store_today()`); as demais telas ficam para a área 7.**
- Peça que nunca saiu da loja e tem a reserva cancelada dentro da própria janela de higienização fica "Higienização" até ser liberada.
- Menu "⋯" das contas: navegação por setas e devolução de foco ao fechar clicando fora.
- Componentes compartilhados que moram dentro de features (CustomerPicker, GarmentThumb, gráficos) podem ir para `src/ui`.
- `CustomerPage.tsx` e `GarmentPage.tsx` passaram de ~450 linhas; dividir quando mexer de novo.
- Alguns `rgba()` em CSS novo (dashboard, financeiro, inteligência) podem virar tokens.
- Configurações não entrou na prévia (depende do banco).
