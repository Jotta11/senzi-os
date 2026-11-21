-- Acervo dividido em dois grupos (submenu Vestidos / Bolsas): cada categoria de peça pertence a um grupo.
-- A categoria de bolsa (antes "Bolsa & acessório") passa a se chamar só "Bolsa" e fica em Bolsas; as demais
-- (vestidos, macacão, conjunto, saia) ficam em Vestidos. O slug `bolsa-acessorio` não muda (é interno).
-- Busca, contagens e investido aceitam o grupo (`p_group`; null = acervo inteiro, como antes).

alter table public.garment_category
  add column grupo text not null default 'vestidos' check (grupo in ('vestidos', 'bolsas'));

update public.garment_category set grupo = 'bolsas', name = 'Bolsa' where slug = 'bolsa-acessorio';

drop function public.list_garment_categories();
drop function public.search_garments(text, text, text, public.size_equiv, int, int);
drop function public.garment_counts(text, text, public.size_equiv);
drop function public.acervo_investment();
drop function public.garment_matching(text, text, public.size_equiv);

create function public.garment_matching(p_q text, p_cat text, p_size public.size_equiv, p_group text default null)
returns table (id uuid, code text, state public.garment_state)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.code, g.state
  from public.garment g
  join public.garment_category c on c.id = g.category_id
  where (coalesce(p_cat, '') = '' or c.slug = p_cat)
    and (coalesce(p_group, '') = '' or c.grupo = p_group)
    and (p_size is null or g.size_equiv = p_size)
    and (
      public.norm(btrim(p_q)) = ''
      or strpos(public.norm(g.code || ' ' || g.name || ' ' || g.color_primary || ' ' || g.fabric), public.norm(btrim(p_q))) > 0
    )
$$;

create function public.list_garment_categories()
returns table (slug text, name text, cleaning_days int, grupo text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.view');
  return query select c.slug, c.name, c.cleaning_days, c.grupo from public.garment_category c order by c.sort_order, c.name;
end
$$;

-- `p_state_group`: null = tudo menos baixadas; 'todos' = inclusive baixadas. → {"items": [Garment…], "total": n}
create function public.search_garments(
  p_q text,
  p_cat text,
  p_state_group text,
  p_size public.size_equiv,
  p_limit int,
  p_offset int,
  p_group text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_states public.garment_state[];
  v_total bigint;
  v_items jsonb;
begin
  perform public.require_perm('acervo.view');
  if p_state_group is not null and p_state_group <> 'todos' then
    v_states := public.state_group_states(p_state_group);
    if v_states is null then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'stateGroup';
    end if;
  end if;
  if coalesce(p_limit, 0) < 1 or p_limit > 200 or coalesce(p_offset, -1) < 0 then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if p_group is not null and p_group not in ('vestidos', 'bolsas') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'group';
  end if;

  with hits as (
    select m.id, m.code
    from public.garment_matching(p_q, p_cat, p_size, p_group) m
    where case
      when p_state_group = 'todos' then true
      when v_states is not null then m.state = any (v_states)
      else m.state <> 'baixado'
    end
  ),
  page as (
    select h.id, h.code from hits h order by h.code limit p_limit offset p_offset
  )
  select (select count(*) from hits),
         coalesce((select jsonb_agg(public.garment_json(pg.id) order by pg.code) from page pg), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total);
end
$$;

create function public.garment_counts(p_q text, p_cat text, p_size public.size_equiv, p_group text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  perform public.require_perm('acervo.view');
  select jsonb_build_object(
    'todos', count(*),
    'ativas', count(*) filter (where m.state <> 'baixado'),
    'disponivel', count(*) filter (where m.state = any (public.state_group_states('disponivel'))),
    'reservado', count(*) filter (where m.state = any (public.state_group_states('reservado'))),
    'em_uso', count(*) filter (where m.state = any (public.state_group_states('em_uso'))),
    'ciclo', count(*) filter (where m.state = any (public.state_group_states('ciclo'))),
    'bloqueado', count(*) filter (where m.state = any (public.state_group_states('bloqueado')))
  ) into v
  from public.garment_matching(p_q, p_cat, p_size, p_group) m;
  return v;
end
$$;

create function public.acervo_investment(p_group text default null)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.cost');
  return (
    select coalesce(sum(g.acquisition_cost), 0)
    from public.garment g
    join public.garment_category c on c.id = g.category_id
    where g.state <> 'baixado' and (coalesce(p_group, '') = '' or c.grupo = p_group)
  );
end
$$;

revoke all on function public.garment_matching(text, text, public.size_equiv, text) from public, anon, authenticated;
revoke all on function public.list_garment_categories() from public, anon;
revoke all on function public.search_garments(text, text, text, public.size_equiv, int, int, text) from public, anon;
revoke all on function public.garment_counts(text, text, public.size_equiv, text) from public, anon;
revoke all on function public.acervo_investment(text) from public, anon;

grant execute on function public.list_garment_categories() to authenticated;
grant execute on function public.search_garments(text, text, text, public.size_equiv, int, int, text) to authenticated;
grant execute on function public.garment_counts(text, text, public.size_equiv, text) to authenticated;
grant execute on function public.acervo_investment(text) to authenticated;
