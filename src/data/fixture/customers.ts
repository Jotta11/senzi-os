/**
 * Clientes fictícias portadas do seed do protótipo (protótipo v0.2 L2904–2963, memória L2997–3002,
 * favoritos ~L3587). CPFs gerados com verificadores válidos; telefones só com dígitos.
 * Só a fonte em memória importa este arquivo — as telas nunca.
 */
import { cpfFromBase } from '@/lib/cpf'
import { addDays, onlyDigits } from '@/lib/format'
import type { Customer, CustomerFavorite, CustomerNote, Garment, GarmentLength, LeadSource, SizeEquiv } from '../types'

type Full = [
  name: string,
  phone: string,
  insta: string,
  email: string,
  birth: string,
  city: string,
  uf: string,
  lead: LeadSource,
  size: SizeEquiv,
  bust: number,
  waist: number,
  hip: number,
  height: number,
  prefColors: string[],
  avoidColors: string[],
  lengths: GarmentLength[],
  sleeve: string,
  neck: string,
]

const CLIENTES: Full[] = [
  ['Mariana Fontes Ribeiro', '63 99612-4478', '@marifontes', 'mariana.fontes@gmail.com', '1994-03-21', 'Palmas', 'TO', 'indicacao', 'M', 88, 68, 96, 168, ['Verde', 'Vinho', 'Off-white'], ['Amarelo', 'Laranja'], ['longo'], 'Sem manga', 'V'],
  ['Ana Paula Siqueira', '63 99188-2031', '@anapaulasq', 'anapaula.sq@outlook.com', '1989-11-02', 'Palmas', 'TO', 'instagram', 'P', 84, 64, 90, 163, ['Preto', 'Prata', 'Azul marinho'], ['Rosa'], ['longo', 'midi'], 'Alcinha', 'Costas'],
  ['Camila Nogueira Alves', '63 98420-7765', '@camilanogueira', 'camila.alves@gmail.com', '1996-06-14', 'Araguaína', 'TO', 'indicacao', 'M', 90, 70, 98, 170, ['Terracota', 'Dourado'], ['Verde oliva'], ['longo'], 'Manga bufante', 'Coração'],
  ['Juliana Tavares Lima', '63 99055-3312', '@ju.tavares', 'ju.tavares@gmail.com', '1991-01-27', 'Palmas', 'TO', 'passante', 'G', 96, 78, 104, 172, ['Azul', 'Marfim'], ['Vermelho'], ['midi'], 'Manga longa', 'Canoa'],
  ['Larissa Menezes Costa', '61 98833-1190', '@larimenezes', 'larissa.mc@gmail.com', '1998-09-08', 'Brasília', 'DF', 'instagram', 'P', 82, 62, 88, 160, ['Lilás', 'Rosa antigo'], ['Preto'], ['curto', 'midi'], 'Manga curta', 'Quadrado'],
  ['Patrícia Rocha Andrade', '63 99744-6620', '@patyrocha', 'paty.andrade@uol.com.br', '1985-04-30', 'Palmas', 'TO', 'evento', 'GG', 102, 84, 110, 166, ['Preto', 'Vinho'], ['Estampas'], ['longo'], 'Manga 3/4', 'V'],
  ['Beatriz Carvalho Pinto', '63 98177-9034', '@bia.carvalho', 'bia.cpinto@gmail.com', '2000-12-19', 'Palmas', 'TO', 'indicacao', 'P', 80, 61, 89, 165, ['Off-white', 'Nude'], ['Marrom'], ['curto'], 'Sem manga', 'Tomara que caia'],
  ['Fernanda Queiroz Mota', '63 99301-4482', '@ferqueiroz', 'fernanda.mota@gmail.com', '1993-07-05', 'Gurupi', 'TO', 'google', 'M', 87, 67, 95, 169, ['Azul petróleo', 'Esmeralda'], ['Amarelo'], ['longo'], 'Um ombro', 'Assimétrico'],
  ['Renata Bastos Oliveira', '63 98566-2218', '@rebastos', 'renata.bastos@gmail.com', '1987-02-11', 'Palmas', 'TO', 'indicacao', 'G', 95, 76, 103, 171, ['Dourado', 'Marfim'], ['Cinza'], ['longo'], 'Manga longa', 'Gola alta'],
  ['Vitória Sampaio Cruz', '63 99677-8811', '@vi.sampaio', 'vitoria.cruz@gmail.com', '1999-05-23', 'Araguaína', 'TO', 'instagram', 'M', 86, 66, 94, 167, ['Prata', 'Preto'], ['Bege'], ['longo', 'curto'], 'Alcinha', 'Halter'],
  ['Isabela Freitas Moura', '61 99422-0093', '@isafreitas', 'isabela.moura@gmail.com', '1992-10-16', 'Brasília', 'DF', 'evento', 'M', 89, 69, 97, 173, ['Verde', 'Azul'], ['Rosa'], ['longo'], 'Manga longa', 'V profundo'],
  ['Tatiane Lopes Vieira', '63 98299-5540', '@tatilopes', 'tati.vieira@gmail.com', '1990-08-03', 'Porto Nacional', 'TO', 'passante', 'G', 94, 75, 102, 164, ['Vinho', 'Grafite'], ['Branco'], ['midi'], 'Manga 3/4', 'Quadrado'],
  ['Gabriela Pires Mendes', '63 99811-3367', '@gabipires', 'gabriela.mendes@gmail.com', '1997-12-01', 'Palmas', 'TO', 'indicacao', 'P', 83, 63, 91, 162, ['Rosa antigo', 'Lilás'], ['Preto'], ['curto', 'midi'], 'Manga bufante', 'Coração'],
  ['Aline Barreto Nunes', '63 98455-7712', '@aline.barreto', 'aline.nunes@gmail.com', '1986-06-27', 'Palmas', 'TO', 'instagram', 'GG', 100, 82, 108, 168, ['Azul marinho', 'Preto'], ['Estampas'], ['longo'], 'Manga longa', 'Canoa'],
]

/** Clientes de cauda longa: vieram uma ou duas vezes. */
const EXTRAS: [string, string, string, string, string, SizeEquiv, string][] = [
  ['Simone Vasconcelos', '63 99120-4471', '@simonevasc', 'Palmas', 'TO', 'M', '1988-03-12'],
  ['Débora Martins Lira', '63 98244-9103', '@deboramlira', 'Araguaína', 'TO', 'P', '1995-07-29'],
  ['Karina Peixoto', '63 99388-2217', '@kapeixoto', 'Gurupi', 'TO', 'G', '1991-11-04'],
  ['Elaine Cardoso Braga', '63 98700-5512', '@elainebraga', 'Palmas', 'TO', 'M', '1984-02-18'],
  ['Sabrina Teixeira', '63 99455-7780', '@sabteixeira', 'Porto Nacional', 'TO', 'P', '1999-09-22'],
  ['Nathália Borges', '61 99233-6614', '@nathborges', 'Brasília', 'DF', 'M', '1996-04-07'],
  ['Priscila Amorim', '63 98166-3320', '@pri.amorim', 'Palmas', 'TO', 'GG', '1987-12-30'],
  ['Luciana Ferraz', '63 99577-1148', '@luferraz', 'Araguaína', 'TO', 'M', '1990-06-11'],
  ['Bruna Rezende', '63 98922-4407', '@brurezende', 'Palmas', 'TO', 'P', '2001-01-15'],
  ['Carolina Dantas', '63 99011-8836', '@caroldantas', 'Paraíso do Tocantins', 'TO', 'G', '1993-08-26'],
  ['Michele Antunes', '63 98388-2260', '@mihantunes', 'Palmas', 'TO', 'M', '1986-05-09'],
  ['Sandra Colares', '63 99644-0072', '@sandracolares', 'Gurupi', 'TO', 'GG', '1979-10-21'],
  ['Rafaela Guimarães', '61 98455-3391', '@rafaguimaraes', 'Brasília', 'DF', 'P', '1997-03-03'],
  ['Thaís Monteiro', '63 99277-6653', '@thaismont', 'Palmas', 'TO', 'M', '1994-12-14'],
  ['Adriana Sales', '63 98511-9924', '@drisales', 'Araguaína', 'TO', 'G', '1982-07-19'],
  ['Verônica Pontes', '63 99833-4418', '@vepontes', 'Palmas', 'TO', 'M', '1998-02-27'],
  ['Letícia Brandão', '63 98066-7735', '@leticiabrandao', 'Porto Nacional', 'TO', 'P', '2000-11-08'],
  ['Josiane Marques', '63 99700-2284', '@josimarques', 'Palmas', 'TO', 'G', '1985-09-01'],
  ['Amanda Cerqueira', '63 98344-5590', '@amandacerq', 'Palmas', 'TO', 'M', '1992-05-23'],
  ['Milena Torres', '63 99188-7746', '@milenatorres', 'Gurupi', 'TO', 'P', '1996-10-17'],
]

/** Memória de atendimento — índice da cliente, texto, fixada. */
const MEMORIA: [number, string, boolean][] = [
  [0, 'Prefere vestidos sem manga. Não gosta de tecido pesado — reclamou do veludo na prova de março.', true],
  [0, 'Gostou muito do comprimento do Verona. Barra na medida com salto 9.', false],
  [0, 'Trabalha até 18h30 — só consegue provar depois das 19h ou aos sábados.', true],
  [1, 'Sempre pede preto ou prata. Já recusou três opções em tons quentes.', true],
  [1, 'Muito sensível a marcação na cintura. Evitar modelagens muito ajustadas na região.', true],
  [2, 'Casamento da irmã em dezembro — quer algo em terracota ou dourado, já avisou.', true],
  [2, 'Usa normalmente M, mas em tule prefere G pelo conforto.', false],
  [3, 'Veio pela vitrine. Primeira locação foi o Parma, ficou encantada com a renda da manga.', false],
  [4, 'Formanda de Direito — colação em novembro. Orçamento até R$ 700.', true],
  [5, 'Executiva, compra por indicação da Renata. Prefere agendar prova fora do horário comercial.', true],
  [5, 'Não usa estampa em nenhuma hipótese.', true],
  [6, 'Muito jovem, primeira festa formal. Precisa de orientação sobre o que combina.', false],
  [7, 'Pediu o Ostuni assim que viu no Instagram. Acompanha os stories de perto.', false],
  [8, 'Devolveu o Toscana impecável. Cliente de altíssimo cuidado.', false],
  [9, 'Faz questão de provar pelo menos quatro peças. Reservar 1h30 de atendimento.', true],
  [10, 'Mora em Brasília, retira e devolve em viagens. Combinar datas com folga.', true],
  [11, 'Prefere midi. Disse que não se sente bem em vestido longo.', true],
  [12, 'Indicada pela Mariana. Mesmo perfil de gosto — romântico e tons claros.', false],
  [13, 'Pediu peça com manga longa para cobrir os braços. Prioridade nas sugestões.', true],
]

/** Favoritas — índice da cliente, nome da peça, origem, nota. */
const FAVORITOS: [number, string, CustomerFavorite['source'], string | null][] = [
  [0, 'Firenze', 'manual', 'Salvou no Instagram e pediu para guardar.'],
  [0, 'Verona', 'prova', 'Fechou na prova.'],
  [1, 'Portofino', 'prova', 'Amou o brilho do paetê.'],
  [2, 'Toscana', 'manual', 'Quer para o casamento da irmã em dezembro.'],
  [4, 'Lecce', 'manual', 'Marcou na vitrine.'],
  [7, 'Ostuni', 'manual', 'Pediu para avisar quando liberar.'],
  [9, 'Modena', 'prova', null],
  [13, 'Bolonha', 'prova', 'Ficou ótima, mas quer manga longa.'],
]

/** Locações e próximo evento (dias a partir de hoje) das clientes de relacionamento. */
const RENTALS = [7, 5, 6, 3, 4, 5, 2, 3, 6, 4, 3, 2, 2, 3]
const NEXT_EVENT: Record<number, number> = { 0: 14, 2: 40, 4: 21, 8: 30, 10: 9 }
const LEADS: LeadSource[] = ['indicacao', 'instagram', 'passante', 'google', 'evento']
const AUTHORS = ['Ana Lima', 'Júlia Senzi']

/** CPF da primeira cliente: o exemplo clássico, fácil de buscar na prévia. */
const FIRST_CPF = '52998224725'

export function buildCustomers(today: string, garments: Garment[]): Customer[] {
  const byName = (n: string) => garments.find((g) => g.name.endsWith(` ${n}`))
  const verona = byName('Verona')

  const full = CLIENTES.map((c, i): Customer => {
    const [fullName, phone, insta, email, birth, city, uf, lead, size, bust, waist, hip, height, prefC, avoidC, lengths, sleeve, neck] = c
    const rentals = RENTALS[i] ?? 1
    const ticket = 600 + ((i * 47) % 400)
    return {
      id: '',
      code: '',
      fullName,
      phone: onlyDigits(phone),
      instagram: insta,
      email,
      birthDate: birth,
      cpf: '',
      city,
      state: uf,
      leadSource: lead,
      vip: i < 3,
      notes: null,
      idealGarmentId: null,
      createdAt: '',
      measurements: [
        {
          measuredAt: addDays(today, -(20 + ((i * 17) % 280))),
          usualSize: size,
          bustCm: bust,
          waistCm: waist,
          hipCm: hip,
          heightCm: height,
          shoulderCm: 36 + (bust - 80) / 4,
          shoeSize: String(34 + (i % 6)),
          preferredLength: lengths[0] ?? null,
          source: 'manual',
          sourceGarmentId: null,
        },
      ],
      preferences: { preferredColors: prefC, avoidedColors: avoidC, preferredLengths: lengths, sleeve, neckline: neck },
      interactions: [],
      favorites: [],
      stats: { rentals, spent: rentals * Math.round(ticket / 10) * 10, nextEvent: NEXT_EVENT[i] != null ? addDays(today, NEXT_EVENT[i]!) : null },
    }
  })

  const extras = EXTRAS.map(([fullName, phone, insta, city, uf, size, birth], i): Customer => {
    const rentals = i % 4 === 0 ? 2 : 1
    return {
      id: '',
      code: '',
      fullName,
      phone: onlyDigits(phone),
      instagram: insta,
      email: null,
      birthDate: birth,
      cpf: '',
      city,
      state: uf,
      leadSource: LEADS[i % LEADS.length]!,
      vip: false,
      notes: null,
      idealGarmentId: null,
      createdAt: '',
      measurements: [
        {
          measuredAt: addDays(today, -(10 + ((i * 23) % 290))),
          usualSize: size,
          bustCm: null,
          waistCm: null,
          hipCm: null,
          heightCm: null,
          shoulderCm: null,
          shoeSize: null,
          preferredLength: null,
          source: 'manual',
          sourceGarmentId: null,
        },
      ],
      preferences: { preferredColors: [], avoidedColors: [], preferredLengths: [], sleeve: null, neckline: null },
      interactions: [],
      favorites: [],
      stats: { rentals, spent: rentals * (420 + Math.round((i * 23) / 10) * 10), nextEvent: null },
    }
  })

  const all = [...full, ...extras]
  all.forEach((c, i) => {
    const code = `CL-${String(i + 1).padStart(4, '0')}`
    c.code = code
    c.id = code.toLowerCase()
    c.cpf = i === 0 ? FIRST_CPF : cpfFromBase(String(311000000 + i * 1234567))
    c.createdAt = `${addDays(today, -(40 + ((i * 29) % 360)))}T14:00:00.000Z`
  })

  // Mariana chegou pelo "modelo ideal" (Verona); a medida atual veio depois, numa prova.
  const mariana = all[0]!
  if (verona) {
    mariana.idealGarmentId = verona.id
    mariana.measurements.push({
      measuredAt: addDays(today, -400),
      usualSize: verona.sizeEquiv,
      bustCm: verona.measurement.bustCm,
      waistCm: verona.measurement.waistCm,
      hipCm: verona.measurement.hipCm,
      heightCm: null,
      shoulderCm: verona.measurement.shoulderCm,
      shoeSize: null,
      preferredLength: verona.length,
      source: 'modelo_ideal',
      sourceGarmentId: verona.id,
    })
  }

  MEMORIA.forEach(([ci, content, pinned], k) => {
    const note: CustomerNote = {
      id: `nota-${k + 1}`,
      content,
      channel: 'presencial',
      pinned,
      at: `${addDays(today, -(5 + ((k * 13) % 255)))}T16:00:00.000Z`,
      authorName: AUTHORS[k % AUTHORS.length]!,
    }
    all[ci]!.interactions.push(note)
  })
  for (const c of all) c.interactions.sort((a, b) => b.at.localeCompare(a.at))

  FAVORITOS.forEach(([ci, nome, source, note], k) => {
    const g = byName(nome)
    if (g) all[ci]!.favorites.push({ garmentId: g.id, source, note, at: `${addDays(today, -(3 + k * 7))}T12:00:00.000Z` })
  })

  return all
}
