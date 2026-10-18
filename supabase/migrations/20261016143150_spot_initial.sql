-- Applied with explicit approval to the Spot test project; version matches remote migration history.
-- Source/evidence/photo attribution is kept in payload to retain one compact POI document.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists vector with schema extensions;

create table public.pois (
  id text primary key,
  name text not null check (char_length(name) between 1 and 400),
  description text not null default '',
  category text not null check (category in ('park','cafe','museum','landmark','playground','other')),
  longitude double precision not null check (longitude between 70.9 and 71.8),
  latitude double precision not null check (latitude between 50.85 and 51.45),
  location extensions.geography(point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ->> 'id' = id),
  content_hash text not null,
  updated_at timestamptz not null default now()
);
create index pois_location_gix on public.pois using gist (location);
create index pois_category_idx on public.pois (category);

create table public.poi_documents (
  poi_id text primary key references public.pois (id) on delete cascade,
  document text not null,
  document_hash text not null,
  fts tsvector generated always as (to_tsvector('russian'::regconfig, document)) stored,
  embedding extensions.vector(768),
  embedding_model text not null,
  embedding_dimensions integer not null check (embedding_dimensions = 768),
  embedding_version text not null,
  updated_at timestamptz not null default now()
);
create index poi_documents_fts_gin on public.poi_documents using gin (fts);
create index poi_documents_embedding_hnsw on public.poi_documents using hnsw (embedding extensions.vector_cosine_ops);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','completed','failed')),
  source text not null,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_summary text
);

alter table public.pois enable row level security;
alter table public.poi_documents enable row level security;
alter table public.ingestion_runs enable row level security;
revoke all on public.pois, public.poi_documents, public.ingestion_runs from anon, authenticated;
grant select on public.pois, public.poi_documents to anon, authenticated;
grant all on public.pois, public.poi_documents, public.ingestion_runs to service_role;
create policy "Public POI read" on public.pois for select to anon, authenticated using (true);
create policy "Public search documents read" on public.poi_documents for select to anon, authenticated using (true);
-- No public INSERT/UPDATE/DELETE policies or privileges. Ingestion logs are private.

create function public.spot_nearby(
  query_longitude double precision,
  query_latitude double precision,
  radius_metres double precision default 3000,
  match_count integer default 80
) returns table (payload jsonb)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if query_longitude not between -180 and 180 or query_latitude not between -90 and 90
    or radius_metres not between 100 and 8000 or match_count not between 1 and 80
    or query_longitude is null or query_latitude is null or radius_metres is null or match_count is null then
    raise exception 'INVALID_SEARCH_ARGUMENTS';
  end if;
  return query
    select p.payload from public.pois p
    where extensions.st_dwithin(p.location,
      extensions.st_setsrid(extensions.st_makepoint(query_longitude, query_latitude), 4326)::extensions.geography, radius_metres)
    order by p.location operator(extensions.<->)
      extensions.st_setsrid(extensions.st_makepoint(query_longitude, query_latitude), 4326)::extensions.geography
    limit match_count;
end;
$$;

create function public.spot_search(
  query_longitude double precision,
  query_latitude double precision,
  radius_metres double precision,
  query_text text,
  query_embedding extensions.vector(768),
  query_model text,
  query_dimensions integer,
  query_version text,
  match_count integer default 30
) returns table (payload jsonb)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if query_longitude not between -180 and 180 or query_latitude not between -90 and 90
    or radius_metres not between 100 and 8000 or match_count not between 1 and 50
    or query_dimensions <> 768 or char_length(query_text) > 1200
    or query_longitude is null or query_latitude is null or radius_metres is null
    or query_dimensions is null or query_embedding is null or match_count is null then
    raise exception 'INVALID_SEARCH_ARGUMENTS';
  end if;
  if not exists (
    select 1 from public.poi_documents d join public.pois p on p.id = d.poi_id
    where d.embedding_model = query_model and d.embedding_dimensions = query_dimensions
      and d.embedding_version = query_version and d.document_hash = p.content_hash and d.embedding is not null
  ) then raise exception 'EMBEDDING_CORPUS_NOT_READY'; end if;
  return query
  with geographical as materialized (
    select p.id, p.payload, p.location, p.content_hash
    from public.pois p where extensions.st_dwithin(p.location,
      extensions.st_setsrid(extensions.st_makepoint(query_longitude, query_latitude), 4326)::extensions.geography, radius_metres)
  ), lexical as (
    select d.poi_id, row_number() over (order by ts_rank_cd(d.fts, websearch_to_tsquery('russian'::regconfig, query_text)) desc, d.poi_id) as rank
    from public.poi_documents d join geographical g on g.id = d.poi_id
    where d.fts @@ websearch_to_tsquery('russian'::regconfig, query_text) and d.document_hash = g.content_hash
    limit 60
  ), semantic as (
    select d.poi_id, row_number() over (order by d.embedding operator(extensions.<=>) query_embedding, d.poi_id) as rank
    from public.poi_documents d join geographical g on g.id = d.poi_id
    where d.embedding_model = query_model and d.embedding_dimensions = query_dimensions
      and d.embedding_version = query_version and d.document_hash = g.content_hash and d.embedding is not null
    order by d.embedding operator(extensions.<=>) query_embedding
    limit 60
  ), fusion as (
    select coalesce(l.poi_id, s.poi_id) as poi_id,
      coalesce(1.0 / (60 + l.rank), 0) + coalesce(1.0 / (60 + s.rank), 0) as score
    from lexical l full outer join semantic s on l.poi_id = s.poi_id
  )
  select g.payload from fusion f join geographical g on g.id = f.poi_id
  order by f.score desc, g.id limit match_count;
end;
$$;

revoke all on function public.spot_nearby(double precision, double precision, double precision, integer) from public;
revoke all on function public.spot_search(double precision, double precision, double precision, text, extensions.vector, text, integer, text, integer) from public;
grant execute on function public.spot_nearby(double precision, double precision, double precision, integer) to anon, authenticated;
grant execute on function public.spot_search(double precision, double precision, double precision, text, extensions.vector, text, integer, text, integer) to anon, authenticated;
