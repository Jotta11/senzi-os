/**
 * Contrato de locação em texto plano — modelo da loja ("Contrato de Locação de Vestuário e Acessórios", 12 cláusulas
 * + Anexo I — Ficha de Locação e Vistoria), preenchido com os dados da reserva. Uma linha = um parágrafo; a tela
 * de impressão (ContractBody) reconhece títulos, itens e rótulos para formatar.
 * Usado pelo mundo fictício e pela fonte em memória. O banco gera o MESMO texto em `public.reservation_contract_body`
 * (supabase/migrations/20261113000200_contrato_modelo.sql) — mudou aqui, mude lá.
 */
import { lateFeePercent, minSignal, round2 } from '@/domain/money'
import { STORE } from '@/domain/store'
import { dataExtenso, percentExtenso, reaisExtenso } from '@/lib/extenso'
import { brl, dateBR, maskCPF, maskPhone } from '@/lib/format'
import { PAYMENT_METHOD } from '../labels-ops'
import type { World } from '../types-world'
import type { PaymentMethod, Reservation } from '../types'

export const CONTRACT_TEMPLATE_VERSION = 2

const BLANK = '________________'
const LONG_BLANK = '________________________________'

/** "R$ 330,00 (trezentos e trinta reais)". */
const money = (v: number) => `${brl(v)} (${reaisExtenso(v)})`

const METHOD_BOX: [string, (m: PaymentMethod) => boolean][] = [
  ['Pix', (m) => m === 'pix'],
  ['Crédito', (m) => m === 'credito'],
  ['Débito', (m) => m === 'debito'],
]

/** Corpo do contrato da reserva. `date` = data de referência do ano na assinatura (padrão: geração ou hoje). */
export function renderContract(world: World, r: Reservation, date?: string): string {
  const c = world.customers.find((x) => x.id === r.customerId)
  const name = c?.fullName ?? '—'
  const cpf = c?.cpf ? maskCPF(c.cpf) : BLANK
  const phone = c?.phone ? maskPhone(c.phone) : BLANK
  const city = c?.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : BLANK
  const insta = c?.instagram ? (c.instagram.startsWith('@') ? c.instagram : `@${c.instagram}`) : BLANK
  const pieces = r.items.map((i) => ({ item: i, g: world.garments.find((x) => x.id === i.garmentId) }))
  // "vestido Sorrento" (nome já começa pela categoria) ou "vestido longo Noir".
  const desc = (g: (typeof pieces)[number]['g']) => {
    if (!g) return 'peça'
    const first = g.categoryName.split(' ')[0]!.toLowerCase()
    return g.name.toLowerCase().startsWith(first) ? g.name.charAt(0).toLowerCase() + g.name.slice(1) : `${g.categoryName.toLowerCase()} ${g.name}`
  }
  const one = pieces.length === 1
  const objeto = one ? desc(pieces[0]!.g) : `${pieces.length} peças (${pieces.map(({ g }) => desc(g)).join('; ')})`
  const reference = round2(pieces.reduce((s, { item, g }) => s + (g?.retailReference || item.unitPrice * 4), 0))

  const paidPays = r.payments.filter((p) => p.state === 'pago' && (p.kind === 'sinal' || p.kind === 'integral' || p.kind === 'saldo'))
  const paid = round2(paidPays.reduce((s, p) => s + p.amount, 0))
  const sinal = paid > 0 ? paid : minSignal(r.totalNet, world.settings.minSignalPercent)
  const full = sinal > 0 && sinal >= r.totalNet - 0.005
  const saldo = Math.max(0, round2(r.totalNet - sinal))
  const paidAt = paidPays.map((p) => p.paidAt).filter((x): x is string => !!x).sort()[0]
  const pct = lateFeePercent(r, world.settings)
  const when = date ?? r.contract?.generatedAt.slice(0, 10) ?? world.today
  const number = r.contract?.number || r.code.replace('RS', 'CT')
  const methods = new Set(paidPays.map((p) => p.method))
  const other = [...methods].filter((m) => !METHOD_BOX.some(([, is]) => is(m)))

  const pagamento = full
    ? `2.2. O pagamento será realizado integralmente ${paidAt ? `no dia ${dataExtenso(paidAt)}` : 'na confirmação da reserva'}, correspondente a 100% (cem por cento) do valor total da locação, no importe de ${money(r.totalNet)}.`
    : sinal > 0
      ? `2.2. O pagamento será realizado em duas etapas: sinal de ${money(sinal)}, na confirmação da reserva, e saldo de ${money(saldo)}, até a retirada da peça.`
      : `2.2. O pagamento do valor total de ${money(r.totalNet)} será realizado na confirmação da reserva ou, no máximo, até a retirada da peça.`
  const confirmacao = full
    ? '2.3. A reserva será confirmada mediante a identificação do pagamento integral, não havendo saldo remanescente a ser quitado na retirada da peça.'
    : '2.3. A reserva será confirmada mediante a identificação do pagamento previsto no item 2.2, devendo eventual saldo remanescente ser quitado até a retirada da peça.'
  const caucao =
    '2.5. Não será exigida caução como regra geral. Eventual garantia excepcional deverá ser informada e aceita antes da contratação, com condições expressas de restituição.' +
    (r.depositAmount > 0 ? ` Para esta locação, foi acordada garantia (caução) de ${money(r.depositAmount)}, restituída após a conferência da devolução.` : '')

  const anexoPecas = pieces.flatMap(({ g }, i) => [
    ...(one ? [] : [`Peça ${i + 1} de ${pieces.length}`]),
    `Código da peça: ${g?.code ?? BLANK}`,
    `Descrição/modelo: ${g ? `${g.categoryName} — ${g.name}` : BLANK}`,
    `Cor: ${g?.colorPrimary ?? BLANK}`,
    `Tamanho: ${g?.labelSize ?? BLANK}`,
  ])

  return [
    'CONTRATO DE LOCAÇÃO DE VESTUÁRIO E ACESSÓRIOS',
    `Nº ${number}`,
    '',
    'Pelo presente instrumento particular, as partes:',
    `LOCADORA: ${STORE.name}, inscrita no CNPJ sob nº ${STORE.cnpj}, com sede em ${STORE.address}, doravante denominada SENZI ou LOCADORA.`,
    `LOCATÁRIA: ${name.toUpperCase()}, nascida em ${c?.birthDate ? dateBR(c.birthDate) : BLANK}, inscrita no CPF sob nº ${cpf}, RG nº ${BLANK}, residente e domiciliada em ${city}, endereço completo ${LONG_BLANK}, telefone/WhatsApp ${phone}, e-mail ${c?.email || BLANK}, Instagram ${insta}.`,
    'Celebram o presente Contrato de Locação de Vestuário e Acessórios, mediante as condições seguintes.',
    '',
    'CLÁUSULA 1 — DO OBJETO',
    `1.1. O objeto deste contrato é a locação temporária de ${one ? `peça de vestuário identificada como ${objeto}, individualizada` : `${objeto}, individualizadas`} no Anexo I — Ficha de Locação e Vistoria.`,
    '1.2. A locação confere à LOCATÁRIA o direito de utilização da peça durante o período contratado, sem transferência de propriedade.',
    '1.3. A LOCATÁRIA compromete-se a utilizar a peça exclusivamente para sua finalidade habitual, observando as orientações de conservação fornecidas pela SENZI.',
    '',
    'CLÁUSULA 2 — DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO',
    `2.1. O valor total da locação ${one ? `da peça (${objeto})` : 'das peças'} é de ${money(r.totalNet)}.`,
    pagamento,
    confirmacao,
    '2.4. O parcelamento no cartão dependerá das condições comerciais vigentes e será informado antes da confirmação da contratação.',
    caucao,
    '',
    'CLÁUSULA 3 — DA RESERVA E DISPONIBILIDADE',
    `3.1. A reserva será considerada confirmada após a identificação da peça, definição do período de locação e confirmação do pagamento ${full ? 'integral ' : ''}previsto na Cláusula 2.`,
    '3.2. Uma vez confirmada a reserva, a SENZI compromete-se a manter a peça disponível para o período contratado, ressalvadas situações supervenientes devidamente justificadas e tratadas conforme a legislação aplicável.',
    '3.3. A alteração de datas ou substituição da peça dependerá da disponibilidade e concordância entre as partes.',
    '',
    'CLÁUSULA 4 — DA RETIRADA E DEVOLUÇÃO',
    `4.1. A retirada ${one ? 'da peça' : 'das peças'} ocorrerá em data e horário previamente acordados entre as partes${r.eventDate ? `, para utilização no evento do dia ${dataExtenso(r.eventDate)}` : ''}, ficando a devolução estabelecida para o dia ${dataExtenso(r.returnDueDate)}, em horário a ser definido.`,
    '4.2. A LOCATÁRIA deverá conferir a peça no ato da retirada, com registro de suas condições e eventuais observações.',
    '4.3. A devolução deverá ocorrer no local acordado, acompanhada de todos os acessórios e componentes recebidos.',
    '4.4. A devolução será concluída mediante recebimento e conferência pela SENZI, que poderá registrar a existência de danos ou pendências.',
    '4.5. A ausência de observação imediata não impede a comunicação posterior de dano que não pudesse ser identificado em inspeção ordinária, desde que documentado e comunicado em prazo razoável.',
    '',
    'CLÁUSULA 5 — DO ATRASO NA DEVOLUÇÃO',
    `5.1. O atraso na devolução, quando imputável à LOCATÁRIA, poderá gerar cobrança correspondente a ${percentExtenso(pct)} do valor da locação no primeiro dia de atraso, equivalente a ${money(round2((r.totalNet * pct) / 100))}, desde que observados os limites legais de validade e proporcionalidade.`,
    '5.2. A partir do segundo dia, a permanência indevida da peça poderá ensejar cobrança adicional calculada com base no valor de uma nova locação pelo período adicional de utilização ou indisponibilidade, observada a proporcionalidade e vedada cobrança abusiva.',
    '5.3. Eventuais prejuízos adicionais decorrentes de reservas comprometidas dependerão de comprovação, não sendo admitida duplicidade de indenização pelo mesmo dano.',
    '5.4. A SENZI poderá avaliar situações justificadas e documentadas, especialmente casos fortuitos ou de força maior.',
    '',
    'CLÁUSULA 6 — DA CONSERVAÇÃO E UTILIZAÇÃO',
    '6.1. A LOCATÁRIA deverá conservar a peça com diligência, evitando situações que possam provocar danos além do desgaste normal.',
    '6.2. Não serão permitidos cortes, tingimentos, alterações permanentes, aplicações de cola, intervenções estruturais ou ajustes não autorizados.',
    '6.3. Ajustes necessários deverão ser previamente comunicados e autorizados pela SENZI.',
    '6.4. A LOCATÁRIA não deverá realizar lavagem, lavagem a seco, aplicação de produtos químicos ou procedimentos de remoção de manchas por conta própria, salvo orientação expressa da SENZI.',
    '6.5. A higienização ordinária após o uso será providenciada pela SENZI e estará incluída no valor contratado, salvo serviço extraordinário expressamente informado e legitimamente devido.',
    '',
    'CLÁUSULA 7 — DOS DANOS E AVARIAS',
    '7.1. O desgaste natural decorrente de uso regular não será considerado dano indenizável.',
    '7.2. Danos além do desgaste normal serão avaliados conforme a natureza, extensão e possibilidade de reparação, mediante documentação.',
    '7.3. Quando o dano for reparável e imputável à LOCATÁRIA, poderá ser cobrado o custo razoável e comprovado do reparo necessário.',
    `7.4. Em caso de perda, extravio ou dano irreparável imputável à LOCATÁRIA, a indenização observará o prejuízo efetivamente comprovado, considerando o valor de reposição de referência de ${money(reference)}, o estado da peça e as circunstâncias do caso. A SENZI informará à LOCATÁRIA os elementos utilizados na avaliação e concederá oportunidade para apresentação de esclarecimentos.`,
    '7.5. Não haverá cobrança automática do valor integral de varejo quando incompatível com o dano efetivo ou com as disposições legais aplicáveis.',
    '',
    'CLÁUSULA 8 — DO CANCELAMENTO E REMARCAÇÃO',
    '8.1. As solicitações de cancelamento ou remarcação deverão ser comunicadas à SENZI por seus canais oficiais.',
    '8.2. Para contratações presenciais, a SENZI poderá oferecer, conforme sua política comercial previamente informada, conversão dos valores pagos em crédito para utilização futura, com validade de 8 (oito) meses, respeitados os direitos legais da consumidora e as condições específicas da contratação.',
    '8.3. Nas contratações realizadas fora do estabelecimento comercial, inclusive por canais digitais, será respeitado o direito legal de arrependimento quando aplicável, especialmente o prazo de 7 (sete) dias previsto no Código de Defesa do Consumidor, com os efeitos legais correspondentes.',
    '8.4. O crédito comercial não substituirá restituição em dinheiro quando esta for legalmente obrigatória.',
    '8.5. Quando a impossibilidade de cumprimento decorrer de responsabilidade da SENZI, serão oferecidas as soluções legalmente cabíveis, inclusive restituição dos valores pagos, conforme o caso.',
    '',
    'CLÁUSULA 9 — DAS OBRIGAÇÕES DA SENZI',
    '9.1. Disponibilizar a peça em condições adequadas de uso, higiene e conservação.',
    '9.2. Informar as características relevantes, eventuais restrições e orientações de uso.',
    '9.3. Cumprir as condições de reserva, retirada e devolução acordadas.',
    '9.4. Realizar a conferência e o registro das condições da peça.',
    '9.5. Prestar atendimento para esclarecimento de dúvidas e resolução de ocorrências relacionadas à locação.',
    '',
    'CLÁUSULA 10 — DAS OBRIGAÇÕES DA LOCATÁRIA',
    '10.1. Fornecer informações corretas para identificação e execução contratual.',
    '10.2. Efetuar os pagamentos nas condições pactuadas.',
    '10.3. Retirar e devolver a peça nos prazos estabelecidos.',
    '10.4. Utilizar e conservar adequadamente o vestuário e os acessórios.',
    '10.5. Comunicar imediatamente qualquer ocorrência relevante, dano, perda ou impossibilidade de devolução no prazo.',
    '10.6. Não transferir, emprestar, sublocar ou disponibilizar comercialmente a peça a terceiros sem autorização expressa da SENZI.',
    '',
    'CLÁUSULA 11 — DA PROTEÇÃO DE DADOS',
    '11.1. Os dados pessoais da LOCATÁRIA serão utilizados para identificação, reservas, execução contratual, pagamentos, atendimento, cumprimento de obrigações legais e exercício regular de direitos.',
    '11.2. O tratamento dos dados observará a legislação de proteção de dados e as medidas razoáveis de segurança aplicáveis.',
    '11.3. A utilização de imagens pessoais da LOCATÁRIA para divulgação publicitária dependerá de autorização específica, quando necessária.',
    '',
    'CLÁUSULA 12 — DAS DISPOSIÇÕES FINAIS',
    '12.1. O Anexo I integra este contrato e deverá ser preenchido para cada locação.',
    '12.2. A assinatura poderá ocorrer fisicamente ou por meio eletrônico que permita identificação e comprovação da manifestação de vontade.',
    '12.3. Eventuais alterações deverão ser registradas e aceitas pelas partes.',
    '12.4. Os direitos assegurados pela legislação de defesa do consumidor prevalecerão sobre qualquer disposição contratual incompatível.',
    '12.5. Para controvérsias decorrentes deste contrato, serão observadas as regras legais de competência, especialmente as normas protetivas da consumidora.',
    '',
    'E, por estarem de acordo, assinam o presente instrumento.',
    `${STORE.city}, ____ de ________________ de ${when.slice(0, 4)}.`,
    '',
    `${STORE.name} — LOCADORA`,
    `CNPJ: ${STORE.cnpj}`,
    `Assinatura: ${LONG_BLANK}`,
    '',
    `${name.toUpperCase()} — LOCATÁRIA`,
    `CPF: ${cpf}`,
    `Assinatura: ${LONG_BLANK}`,
    '',
    'ANEXO I — FICHA DE LOCAÇÃO E VISTORIA',
    '1. IDENTIFICAÇÃO DA LOCAÇÃO',
    `Nome da locatária: ${name}`,
    `CPF: ${cpf}`,
    `Telefone: ${phone}`,
    ...anexoPecas,
    '',
    '2. VALORES E CONDIÇÕES DE PAGAMENTO',
    `Preço regular da locação: ${brl(r.totalGross)}`,
    ...(r.discount > 0 ? [`Desconto: ${brl(r.discount)}`] : []),
    `Preço contratado: ${brl(r.totalNet)}`,
    'Forma de pagamento:',
    ...METHOD_BOX.map(([label, is]) => `(${[...methods].some(is) ? 'x' : ' '}) ${label}`),
    `(${other.length ? 'x' : ' '}) Outra: ${other.length ? other.map((m) => PAYMENT_METHOD[m]).join(', ') : BLANK}`,
    `Parcelamento: ${BLANK}`,
    ...(full
      ? [`Pagamento integral (100%): ${brl(r.totalNet)}`]
      : sinal > 0
        ? [`Sinal: ${brl(sinal)}`, `Saldo na retirada: ${brl(saldo)}`]
        : [`Valor pago na confirmação: R$ ${BLANK}`, `Saldo na retirada: R$ ${BLANK}`]),
    ...(r.depositAmount > 0 ? [`Caução: ${brl(r.depositAmount)}`] : []),
    `Valor de referência de reposição: ${brl(reference)}`,
    'O valor de reposição constitui referência para avaliação de eventual prejuízo comprovado, conforme a cláusula 7 do contrato.',
    '',
    '3. PERÍODO DA LOCAÇÃO',
    `Data de retirada: ${dateBR(r.pickupDate)}`,
    `Data de devolução: ${dateBR(r.returnDueDate)}`,
    `Horário de devolução: ${BLANK}`,
    `Data do evento: ${r.eventDate ? dateBR(r.eventDate) : BLANK}`,
    '',
    '4. VISTORIA DA PEÇA',
    `Condições da peça na retirada: ${LONG_BLANK}`,
    'Registros fotográficos: ( ) Sim ( ) Não',
    `Condições da peça na devolução: ${LONG_BLANK}`,
    `Ocorrências e providências: ${LONG_BLANK}`,
    '',
    '5. ASSINATURAS DE CONFERÊNCIA',
    `Assinatura na retirada — LOCATÁRIA: ${LONG_BLANK}`,
    `Assinatura na devolução — LOCATÁRIA: ${LONG_BLANK}`,
    `Conferência — SENZI CLUB: ${LONG_BLANK}`,
  ].join('\n')
}
