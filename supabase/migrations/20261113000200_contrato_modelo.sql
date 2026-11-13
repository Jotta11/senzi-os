-- Novo modelo de contrato da loja ("Contrato de Locação de Vestuário e Acessórios", 12 cláusulas + Anexo I —
-- Ficha de Locação e Vistoria), template_version 2. Gera o MESMO texto de renderContract em
-- src/data/mock/contract.ts — mudou lá, mude aqui. Contratos já assinados não mudam (snapshot); os não
-- assinados (versão vigente) são regerados no fim desta migração.

-- Inteiro por extenso (extenso de src/lib/extenso.ts).
create function public.extenso_int(p bigint)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  un text[] := array['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
                     'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  dez text[] := array['', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  cen text[] := array['cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  n bigint := abs(coalesce(p, 0));
  vals bigint[] := array[]::bigint[];
  txts text[] := array[]::text[];
  out text := '';
  g bigint;
  i int;
begin
  if n = 0 then
    return 'zero';
  end if;
  for i in 1..3 loop
    g := case i when 1 then n / 1000000 when 2 then (n % 1000000) / 1000 else n % 1000 end;
    continue when g = 0;
    declare
      c int := g / 100;
      r int := g % 100;
      t text;
    begin
      if g = 100 then
        t := 'cem';
      else
        t := concat_ws(' e ',
          case when c > 0 then cen[c] end,
          case when r between 1 and 19 then un[r]
               when r >= 20 then dez[r / 10] || case when r % 10 > 0 then ' e ' || un[r % 10] else '' end end);
      end if;
      t := case i
        when 1 then case when g = 1 then 'um milhão' else t || ' milhões' end
        when 2 then case when g = 1 then 'mil' else t || ' mil' end
        else t end;
      vals := vals || g;
      txts := txts || t;
    end;
  end loop;
  for i in 1..array_length(txts, 1) loop
    out := out || case when i > 1 then ' ' else '' end
               || case when i > 1 and i = array_length(txts, 1) and (vals[i] < 100 or vals[i] % 100 = 0) then 'e ' else '' end
               || txts[i];
  end loop;
  return out;
end
$$;

-- Valor em reais por extenso (reaisExtenso).
create function public.brl_extenso(p numeric)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  cents bigint := round(abs(coalesce(p, 0)) * 100);
  r bigint := cents / 100;
  c bigint := cents % 100;
  v text;
begin
  v := concat_ws(' e ',
    case when r > 0 then public.extenso_int(r) || case when r % 1000000 = 0 then ' de' else '' end
                         || case when r = 1 then ' real' else ' reais' end end,
    case when c > 0 then public.extenso_int(c) || case when c = 1 then ' centavo' else ' centavos' end end);
  return case when v = '' then 'zero real' else v end;
end
$$;

-- "R$ 330,00 (trezentos e trinta reais)".
create function public.brl_full(p numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select public.brl(p) || ' (' || public.brl_extenso(p) || ')'
$$;

-- "14 de novembro de 2026" (dataExtenso).
create function public.date_extenso(p date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select extract(day from p)::int || ' de '
         || (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
                   'outubro', 'novembro', 'dezembro'])[extract(month from p)::int]
         || ' de ' || extract(year from p)::int
$$;

revoke all on function public.extenso_int(bigint) from public, anon, authenticated;
revoke all on function public.brl_extenso(numeric) from public, anon, authenticated;
revoke all on function public.brl_full(numeric) from public, anon, authenticated;
revoke all on function public.date_extenso(date) from public, anon, authenticated;

create or replace function public.reservation_contract_body(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  blank constant text := '________________';
  long_blank constant text := '________________________________';
  store_name constant text := 'SENZI CLUB';
  store_cnpj constant text := '69.364.448/0001-90';
  store_address constant text := '305 Sul – Av. LO 5, Lote 4, Sala 1, CEP 77015-438, Palmas/TO';
  store_city constant text := 'Palmas/TO';
  r public.reservation;
  c public.customer;
  s public.app_settings;
  v_name text;
  v_cpf text;
  v_phone text;
  v_city text;
  v_insta text;
  v_count int;
  v_objeto text;
  v_anexo text;
  v_ref numeric;
  v_paid numeric;
  v_paid_at date;
  v_sinal numeric;
  v_full boolean;
  v_saldo numeric;
  v_pct numeric;
  v_pct_txt text;
  v_methods public.payment_method[];
  v_other text;
  v_one boolean;
begin
  select * into r from public.reservation where id = p_id;
  select * into c from public.customer where id = r.customer_id;
  select * into s from public.app_settings where id;
  v_name := coalesce(c.full_name, '—');
  v_cpf := case when coalesce(c.cpf, '') <> ''
    then substr(c.cpf, 1, 3) || '.' || substr(c.cpf, 4, 3) || '.' || substr(c.cpf, 7, 3) || '-' || substr(c.cpf, 10, 2)
    else blank end;
  v_phone := case
    when coalesce(c.phone, '') = '' then blank
    when length(c.phone) = 11 then '(' || substr(c.phone, 1, 2) || ') ' || substr(c.phone, 3, 5) || '-' || substr(c.phone, 8)
    else '(' || substr(c.phone, 1, 2) || ') ' || substr(c.phone, 3, 4) || '-' || substr(c.phone, 7)
  end;
  v_city := case when coalesce(c.city, '') <> '' then c.city || coalesce('/' || nullif(c.state, ''), '') else blank end;
  v_insta := case when coalesce(c.instagram, '') = '' then blank
                  when left(c.instagram, 1) = '@' then c.instagram else '@' || c.instagram end;

  -- Peças: descrição "vestido Sorrento" (nome já começa pela categoria) ou "vestido longo Noir".
  select count(*),
         string_agg(case when lower(g.name) like lower(split_part(k.name, ' ', 1)) || '%'
                         then lower(left(g.name, 1)) || substr(g.name, 2)
                         else lower(k.name) || ' ' || g.name end, '; ' order by i.position),
         round(coalesce(sum(coalesce(nullif(g.retail_reference, 0), i.unit_price * 4)), 0), 2),
         string_agg(concat_ws(E'\n',
                      case when (select count(*) from public.reservation_item x where x.reservation_id = p_id) > 1
                           then 'Peça ' || i.rn || ' de ' || (select count(*) from public.reservation_item x where x.reservation_id = p_id) end,
                      'Código da peça: ' || g.code,
                      'Descrição/modelo: ' || k.name || ' — ' || g.name,
                      'Cor: ' || g.color_primary,
                      'Tamanho: ' || g.label_size), E'\n' order by i.position)
    into v_count, v_objeto, v_ref, v_anexo
    from (select x.*, row_number() over (order by x.position) as rn from public.reservation_item x where x.reservation_id = p_id) i
    join public.garment g on g.id = i.garment_id
    join public.garment_category k on k.id = g.category_id;
  v_one := v_count = 1;
  if not v_one then
    v_objeto := v_count || ' peças (' || v_objeto || ')';
  end if;

  select coalesce(round(sum(p.amount), 2), 0),
         min((p.paid_at at time zone 'America/Araguaina')::date),
         coalesce(array_agg(distinct p.method), array[]::public.payment_method[])
    into v_paid, v_paid_at, v_methods
    from public.reservation_payment p
   where p.reservation_id = p_id and p.state = 'pago' and p.kind in ('sinal', 'integral', 'saldo');
  v_sinal := case when v_paid > 0 then v_paid else round(r.total_net * s.min_signal_percent / 100, 2) end;
  v_full := v_sinal > 0 and v_sinal >= r.total_net - 0.005;
  v_saldo := greatest(0, round(r.total_net - v_sinal, 2));
  v_pct := trim_scale(s.late_fee_daily_percent);
  v_pct_txt := replace(v_pct::text, '.', ',') || '%'
               || case when v_pct = trunc(v_pct) then ' (' || public.extenso_int(v_pct::bigint) || ' por cento)' else '' end;
  select string_agg(case m when 'dinheiro' then 'Dinheiro' when 'link' then 'Link de pagamento'
                           when 'transferencia' then 'Transferência' else 'Outros' end, ', ' order by m)
    into v_other
    from unnest(v_methods) m
   where m not in ('pix', 'credito', 'debito');

  -- Em blocos: uma chamada de função aceita no máximo 100 argumentos.
  return concat_ws(E'\n', concat_ws(E'\n',
    'CONTRATO DE LOCAÇÃO DE VESTUÁRIO E ACESSÓRIOS',
    'Nº ' || regexp_replace(r.code, 'RS', 'CT'),
    '',
    'Pelo presente instrumento particular, as partes:',
    'LOCADORA: ' || store_name || ', inscrita no CNPJ sob nº ' || store_cnpj || ', com sede em ' || store_address
      || ', doravante denominada SENZI ou LOCADORA.',
    'LOCATÁRIA: ' || upper(v_name) || ', nascida em ' || coalesce(to_char(c.birth_date, 'DD/MM/YYYY'), blank)
      || ', inscrita no CPF sob nº ' || v_cpf || ', RG nº ' || blank || ', residente e domiciliada em ' || v_city
      || ', endereço completo ' || long_blank || ', telefone/WhatsApp ' || v_phone || ', e-mail '
      || coalesce(nullif(c.email, ''), blank) || ', Instagram ' || v_insta || '.',
    'Celebram o presente Contrato de Locação de Vestuário e Acessórios, mediante as condições seguintes.',
    '',
    'CLÁUSULA 1 — DO OBJETO',
    '1.1. O objeto deste contrato é a locação temporária de '
      || case when v_one then 'peça de vestuário identificada como ' || v_objeto || ', individualizada'
              else v_objeto || ', individualizadas' end
      || ' no Anexo I — Ficha de Locação e Vistoria.',
    '1.2. A locação confere à LOCATÁRIA o direito de utilização da peça durante o período contratado, sem transferência de propriedade.',
    '1.3. A LOCATÁRIA compromete-se a utilizar a peça exclusivamente para sua finalidade habitual, observando as orientações de conservação fornecidas pela SENZI.',
    '',
    'CLÁUSULA 2 — DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO',
    '2.1. O valor total da locação ' || case when v_one then 'da peça (' || v_objeto || ')' else 'das peças' end
      || ' é de ' || public.brl_full(r.total_net) || '.',
    case
      when v_full then '2.2. O pagamento será realizado integralmente '
        || coalesce('no dia ' || public.date_extenso(v_paid_at), 'na confirmação da reserva')
        || ', correspondente a 100% (cem por cento) do valor total da locação, no importe de ' || public.brl_full(r.total_net) || '.'
      when v_sinal > 0 then '2.2. O pagamento será realizado em duas etapas: sinal de ' || public.brl_full(v_sinal)
        || ', na confirmação da reserva, e saldo de ' || public.brl_full(v_saldo) || ', até a retirada da peça.'
      else '2.2. O pagamento do valor total de ' || public.brl_full(r.total_net)
        || ' será realizado na confirmação da reserva ou, no máximo, até a retirada da peça.'
    end,
    case when v_full
      then '2.3. A reserva será confirmada mediante a identificação do pagamento integral, não havendo saldo remanescente a ser quitado na retirada da peça.'
      else '2.3. A reserva será confirmada mediante a identificação do pagamento previsto no item 2.2, devendo eventual saldo remanescente ser quitado até a retirada da peça.'
    end,
    '2.4. O parcelamento no cartão dependerá das condições comerciais vigentes e será informado antes da confirmação da contratação.',
    '2.5. Não será exigida caução como regra geral. Eventual garantia excepcional deverá ser informada e aceita antes da contratação, com condições expressas de restituição.'
      || case when r.deposit_amount > 0
           then ' Para esta locação, foi acordada garantia (caução) de ' || public.brl_full(r.deposit_amount) || ', restituída após a conferência da devolução.'
           else '' end,
    '',
    'CLÁUSULA 3 — DA RESERVA E DISPONIBILIDADE',
    '3.1. A reserva será considerada confirmada após a identificação da peça, definição do período de locação e confirmação do pagamento '
      || case when v_full then 'integral ' else '' end || 'previsto na Cláusula 2.',
    '3.2. Uma vez confirmada a reserva, a SENZI compromete-se a manter a peça disponível para o período contratado, ressalvadas situações supervenientes devidamente justificadas e tratadas conforme a legislação aplicável.',
    '3.3. A alteração de datas ou substituição da peça dependerá da disponibilidade e concordância entre as partes.',
    ''), concat_ws(E'\n',
    'CLÁUSULA 4 — DA RETIRADA E DEVOLUÇÃO',
    '4.1. A retirada ' || case when v_one then 'da peça' else 'das peças' end
      || ' ocorrerá em data e horário previamente acordados entre as partes'
      || coalesce(', para utilização no evento do dia ' || public.date_extenso(r.event_date), '')
      || ', ficando a devolução estabelecida para o dia ' || public.date_extenso(r.return_due_date) || ', em horário a ser definido.',
    '4.2. A LOCATÁRIA deverá conferir a peça no ato da retirada, com registro de suas condições e eventuais observações.',
    '4.3. A devolução deverá ocorrer no local acordado, acompanhada de todos os acessórios e componentes recebidos.',
    '4.4. A devolução será concluída mediante recebimento e conferência pela SENZI, que poderá registrar a existência de danos ou pendências.',
    '4.5. A ausência de observação imediata não impede a comunicação posterior de dano que não pudesse ser identificado em inspeção ordinária, desde que documentado e comunicado em prazo razoável.',
    '',
    'CLÁUSULA 5 — DO ATRASO NA DEVOLUÇÃO',
    '5.1. O atraso na devolução, quando imputável à LOCATÁRIA, poderá gerar cobrança correspondente a ' || v_pct_txt
      || ' do valor da locação no primeiro dia de atraso, equivalente a ' || public.brl_full(round(r.total_net * v_pct / 100, 2))
      || ', desde que observados os limites legais de validade e proporcionalidade.',
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
    '7.4. Em caso de perda, extravio ou dano irreparável imputável à LOCATÁRIA, a indenização observará o prejuízo efetivamente comprovado, considerando o valor de reposição de referência de '
      || public.brl_full(v_ref) || ', o estado da peça e as circunstâncias do caso. A SENZI informará à LOCATÁRIA os elementos utilizados na avaliação e concederá oportunidade para apresentação de esclarecimentos.',
    '7.5. Não haverá cobrança automática do valor integral de varejo quando incompatível com o dano efetivo ou com as disposições legais aplicáveis.',
    ''), concat_ws(E'\n',
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
    store_city || ', ____ de ________________ de ' || extract(year from public.store_today())::int || '.',
    '',
    store_name || ' — LOCADORA',
    'CNPJ: ' || store_cnpj,
    'Assinatura: ' || long_blank,
    '',
    upper(v_name) || ' — LOCATÁRIA',
    'CPF: ' || v_cpf,
    'Assinatura: ' || long_blank,
    ''), concat_ws(E'\n',
    'ANEXO I — FICHA DE LOCAÇÃO E VISTORIA',
    '1. IDENTIFICAÇÃO DA LOCAÇÃO',
    'Nome da locatária: ' || v_name,
    'CPF: ' || v_cpf,
    'Telefone: ' || v_phone,
    v_anexo,
    '',
    '2. VALORES E CONDIÇÕES DE PAGAMENTO',
    'Preço regular da locação: ' || public.brl(r.total_gross),
    case when r.discount > 0 then 'Desconto: ' || public.brl(r.discount) end,
    'Preço contratado: ' || public.brl(r.total_net),
    'Forma de pagamento:',
    '(' || case when 'pix' = any (v_methods) then 'x' else ' ' end || ') Pix',
    '(' || case when 'credito' = any (v_methods) then 'x' else ' ' end || ') Crédito',
    '(' || case when 'debito' = any (v_methods) then 'x' else ' ' end || ') Débito',
    '(' || case when v_other is not null then 'x' else ' ' end || ') Outra: ' || coalesce(v_other, blank),
    'Parcelamento: ' || blank,
    case
      when v_full then 'Pagamento integral (100%): ' || public.brl(r.total_net)
      when v_sinal > 0 then 'Sinal: ' || public.brl(v_sinal) || E'\nSaldo na retirada: ' || public.brl(v_saldo)
      else 'Valor pago na confirmação: R$ ' || blank || E'\nSaldo na retirada: R$ ' || blank
    end,
    case when r.deposit_amount > 0 then 'Caução: ' || public.brl(r.deposit_amount) end,
    'Valor de referência de reposição: ' || public.brl(v_ref),
    'O valor de reposição constitui referência para avaliação de eventual prejuízo comprovado, conforme a cláusula 7 do contrato.',
    '',
    '3. PERÍODO DA LOCAÇÃO',
    'Data de retirada: ' || to_char(r.pickup_date, 'DD/MM/YYYY'),
    'Data de devolução: ' || to_char(r.return_due_date, 'DD/MM/YYYY'),
    'Horário de devolução: ' || blank,
    'Data do evento: ' || coalesce(to_char(r.event_date, 'DD/MM/YYYY'), blank),
    '',
    '4. VISTORIA DA PEÇA',
    'Condições da peça na retirada: ' || long_blank,
    'Registros fotográficos: ( ) Sim ( ) Não',
    'Condições da peça na devolução: ' || long_blank,
    'Ocorrências e providências: ' || long_blank,
    '',
    '5. ASSINATURAS DE CONFERÊNCIA',
    'Assinatura na retirada — LOCATÁRIA: ' || long_blank,
    'Assinatura na devolução — LOCATÁRIA: ' || long_blank,
    'Conferência — SENZI CLUB: ' || long_blank
  ));
end
$$;

revoke all on function public.reservation_contract_body(uuid) from public, anon, authenticated;

-- Contratos novos saem na versão 2 do modelo.
alter table public.reservation_contract alter column template_version set default 2;

-- Regera o corpo dos contratos ainda não assinados (versão vigente de cada reserva aberta). Assinados ficam como estão.
update public.reservation_contract c
   set body_rendered = public.reservation_contract_body(c.reservation_id),
       template_version = 2
  from public.reservation r
 where r.id = c.reservation_id
   and r.state not in ('cancelada', 'no_show')
   and c.signed_at is null
   and c.version = (select max(x.version) from public.reservation_contract x where x.reservation_id = c.reservation_id);

-- O novo modelo traz o CPF em vários pontos (qualificação, assinatura, Anexo I): sem cliente.edit, todos saem
-- ocultos (antes só o primeiro "CPF 000..."). Mesma função de 20261027000400_reservas.sql, só muda a máscara.
create or replace function public.reservation_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'customerId', r.customer_id,
    'state', r.state,
    'eventDate', r.event_date,
    'eventType', r.event_type,
    'eventVenue', r.event_venue,
    'pickupDate', r.pickup_date,
    'returnDueDate', r.return_due_date,
    'pickedUpAt', public.store_instant(r.picked_up_at),
    'returnedAt', public.store_instant(r.returned_at),
    'channel', r.channel,
    'totalGross', r.total_gross,
    'discount', r.discount,
    'totalNet', r.total_net,
    'depositAmount', r.deposit_amount,
    'lateFee', r.late_fee,
    'notes', r.notes,
    'cancelReason', r.cancel_reason,
    'createdBy', r.created_by,
    'createdAt', public.store_instant(r.created_at),
    'fittingId', r.fitting_id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id,
               'reservationId', i.reservation_id,
               'garmentId', i.garment_id,
               'unitPrice', i.unit_price,
               'grossAmount', i.gross_amount,
               'itemDiscount', i.item_discount,
               'allocatedOrderDiscount', i.allocated_order_discount,
               'netRevenue', i.net_revenue,
               'itemState', i.item_state,
               'pickedUpAt', public.store_instant(i.picked_up_at),
               'returnedAt', public.store_instant(i.returned_at),
               'pickupNote', i.pickup_note,
               'returnNote', i.return_note,
               'alterationNotes', i.alteration_notes
             ) order by i.position)
        from public.reservation_item i
       where i.reservation_id = r.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'reservationId', p.reservation_id,
               'kind', p.kind,
               'method', p.method,
               'amount', p.amount,
               'state', p.state,
               'paidAt', public.store_instant(p.paid_at),
               'dueAt', p.due_at,
               'reference', p.reference,
               'notes', p.notes,
               'refersTo', p.refers_to,
               'createdBy', p.created_by,
               'createdAt', public.store_instant(p.created_at)
             ) order by p.seq)
        from public.reservation_payment p
       where p.reservation_id = r.id
    ), '[]'::jsonb),
    'contract', (
      select jsonb_build_object(
               'id', c.id,
               'reservationId', c.reservation_id,
               'number', c.number,
               'version', c.version,
               'bodyRendered', case when public.has_perm('cliente.edit') then c.body_rendered
                                    else regexp_replace(c.body_rendered, '\d{3}\.(\d{3})\.(\d{3})-\d{2}', '***.\1.\2-**', 'g') end,
               'generatedAt', public.store_instant(c.generated_at),
               'templateVersion', c.template_version,
               'terms', jsonb_build_object('lateFeeDailyPercent', c.late_fee_daily_percent, 'deposit', c.deposit),
               'signedAt', public.store_instant(c.signed_at),
               'signedBy', c.signed_by,
               'signerName', c.signer_name,
               'signatureKind', c.signature_kind,
               'signatureNotes', c.signature_notes,
               'pdfPath', c.pdf_path
             )
        from public.reservation_contract c
       where c.reservation_id = r.id
       order by c.version desc
       limit 1
    ),
    'authorizations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'reservationId', e.reservation_id,
               'kind', e.kind,
               'amount', e.amount,
               'reason', e.reason,
               'authorizedBy', e.authorized_by,
               'authorizedByName', coalesce(u.full_name, '—'),
               'authorizedByRole', 'Administrador',
               'authorizedAt', public.store_instant(e.created_at),
               'refType', e.ref_type
             ) order by e.consumed_at, e.id)
        from public.exception_authorization e
        left join public.app_user u on u.id = e.authorized_by
       where e.reservation_id = r.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id::text,
               'fromState', h.from_state,
               'toState', h.to_state,
               'reason', h.reason,
               'userId', h.user_id,
               'userName', coalesce(u.full_name, 'Sistema'),
               'occurredAt', public.store_instant(h.occurred_at)
             ) order by h.id)
        from public.reservation_history h
        left join public.app_user u on u.id = h.user_id
       where h.reservation_id = r.id
    ), '[]'::jsonb),
    'balance', (
      select jsonb_build_object('devido', m.devido, 'pago', m.pago, 'caucao', m.caucao, 'due', m.due, 'status', m.status)
        from public.reservation_money(r.id) m
    )
  )
  from public.reservation r
  where r.id = p_id
$$;
