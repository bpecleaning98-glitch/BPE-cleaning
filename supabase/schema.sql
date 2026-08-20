-- ============================================================================
-- BPE Cleaning Services - schema pentru cabinetul de administrare
--
-- Ruleaza TOT fisierul in Supabase > SQL Editor > New query > Run.
-- Poate fi rulat de mai multe ori fara probleme (totul e idempotent).
--
-- Ce contine:
--   1. admin_emails    cine are voie in cabinet (nu e destul sa fii logat)
--   2. page_views      traficul site-ului, fara cookies si fara IP-uri
--   3. link_campaigns  linkurile de campanie (Facebook, flyere, QR)
--   4. link_clicks     fiecare click pe un link de campanie
--   5. leads           cererile din formular, cu sursa lor
--   6. posts           articolele de blog
--   7. functii de statistica pe care le cheama cabinetul
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Cine are acces la cabinet
--
-- Contul se creeaza manual in Supabase > Authentication > Users. Adresa
-- trebuie sa existe SI in tabelul asta, altfel utilizatorul e logat dar nu
-- vede nimic. Asa un cont creat din greseala nu ajunge niciodata la date.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_emails (
  email text primary key,
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table public.admin_emails enable row level security;

-- security definer: functia trebuie sa poata citi tabelul chiar si pentru un
-- utilizator care nu are voie sa il citeasca direct.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "admins read admin_emails" on public.admin_emails;
create policy "admins read admin_emails"
  on public.admin_emails for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Trafic
--
-- Scris NUMAI de pe server (/api/track, cu service role key), niciodata din
-- browser: asa nimeni nu poate umfla cifrele din consola.
--
-- Fara cookies si fara IP stocat. visitor_hash e un hash zilnic din IP + user
-- agent + un secret; se schimba in fiecare zi, deci nu urmareste pe nimeni in
-- timp, dar e suficient ca sa numere vizitatorii unici dintr-o zi.
-- ---------------------------------------------------------------------------
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id uuid not null,
  visitor_hash text,
  path text not null,
  -- Only the host, never the full address. A referring URL can carry a
  -- search query or a private group path, and none of that is needed to
  -- answer "where do my visitors come from".
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  link_code text,
  device text,
  browser text,
  country text,
  city text,
  is_entry boolean not null default false,
  dwell_ms integer not null default 0,
  lang text
);

alter table public.page_views enable row level security;

drop policy if exists "admins read page_views" on public.page_views;
create policy "admins read page_views"
  on public.page_views for select to authenticated
  using (public.is_admin());

create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_session_idx on public.page_views (session_id);
create index if not exists page_views_path_idx on public.page_views (path);

-- ---------------------------------------------------------------------------
-- 3. Linkuri de campanie
--
-- bpecleaning.ie/go/facebook-oct trimite la o pagina de pe site si retine de
-- unde a venit omul. Codul poate avea data de expirare (linkuri temporare
-- pentru o oferta) - dupa ea linkul nu moare, ci duce pe prima pagina, ca sa
-- nu ramana un flyer tiparit cu un link mort.
-- ---------------------------------------------------------------------------
create table if not exists public.link_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Always lowercase, so /go/Facebook and /go/facebook are the same link and
  -- an exact lookup is enough. Without this a mixed case duplicate could be
  -- inserted and the redirect would find two rows for one address.
  code text not null unique check (code = lower(code) and code ~ '^[a-z0-9-]{2,60}$'),
  label text not null default '',
  destination text not null default '/',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  note text not null default '',
  expires_at timestamptz,
  active boolean not null default true
);

alter table public.link_campaigns enable row level security;

drop policy if exists "admins manage links" on public.link_campaigns;
create policy "admins manage links"
  on public.link_campaigns for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.link_clicks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  link_id uuid references public.link_campaigns (id) on delete cascade,
  code text not null,
  session_id uuid,
  referrer_host text,
  country text,
  city text,
  device text,
  status text not null default 'ok'
);

alter table public.link_clicks enable row level security;

drop policy if exists "admins read link_clicks" on public.link_clicks;
create policy "admins read link_clicks"
  on public.link_clicks for select to authenticated
  using (public.is_admin());

create index if not exists link_clicks_created_idx on public.link_clicks (created_at desc);
create index if not exists link_clicks_link_idx on public.link_clicks (link_id);

-- ---------------------------------------------------------------------------
-- 4. Cereri din formular
--
-- Formularul deschide in continuare WhatsApp (acolo se lucreaza), dar cererea
-- se salveaza si aici, impreuna cu sursa ei. Asa se vede negru pe alb ce
-- canal aduce clienti, nu doar ce canal aduce vizite.
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null default '',
  phone text not null default '',
  email text,
  service text,
  size text,
  preferred_date text,
  area text,
  notes text,
  status text not null default 'new' check (status in ('new', 'contacted', 'booked', 'closed')),
  admin_note text not null default '',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  link_code text,
  referrer_host text,
  landing_path text,
  session_id uuid
);

alter table public.leads enable row level security;

drop policy if exists "admins read leads" on public.leads;
create policy "admins read leads"
  on public.leads for select to authenticated
  using (public.is_admin());

drop policy if exists "admins update leads" on public.leads;
create policy "admins update leads"
  on public.leads for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete leads" on public.leads;
create policy "admins delete leads"
  on public.leads for delete to authenticated
  using (public.is_admin());

create index if not exists leads_created_idx on public.leads (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Blog
--
-- Articolele se scriu in cabinet. Paginile publice se randeaza pe server la
-- fiecare cerere, deci un articol publicat e vizibil imediat, in HTML, exact
-- cum il vrea Google. Nu e nevoie de redeploy.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  slug text not null unique,
  title text not null default '',
  excerpt text not null default '',
  content text not null default '',
  cover_url text,
  cover_alt text not null default '',
  tags text[] not null default '{}',
  seo_title text not null default '',
  seo_description text not null default '',
  author text not null default 'BPE Cleaning Services',
  published boolean not null default false
);

alter table public.posts enable row level security;

drop policy if exists "public read published posts" on public.posts;
create policy "public read published posts"
  on public.posts for select to anon, authenticated
  using (published = true or public.is_admin());

drop policy if exists "admins manage posts" on public.posts;
create policy "admins manage posts"
  on public.posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create index if not exists posts_published_idx on public.posts (published, published_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- Poze pentru articole (bucket public, scriu doar adminii)
insert into storage.buckets (id, name, public)
values ('blog', 'blog', true)
on conflict (id) do nothing;

drop policy if exists "public read blog bucket" on storage.objects;
create policy "public read blog bucket"
  on storage.objects for select to public
  using (bucket_id = 'blog');

drop policy if exists "admins write blog bucket" on storage.objects;
create policy "admins write blog bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'blog' and public.is_admin());

drop policy if exists "admins delete blog bucket" on storage.objects;
create policy "admins delete blog bucket"
  on storage.objects for delete to authenticated
  using (bucket_id = 'blog' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Eticheta de sursa
--
-- Traduce utm_source / domeniul de provenienta intr-un nume citibil, ca in
-- cabinet sa scrie "Facebook", nu "l.facebook.com", "m.facebook.com" si
-- "lm.facebook.com" ca trei surse diferite.
-- ---------------------------------------------------------------------------
create or replace function public.source_label(utm text, host text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(utm, '') <> '' then initcap(utm)
    when host is null or host = '' then 'Direct'
    when host ~ 'facebook|fb\.' then 'Facebook'
    when host ~ 'instagram' then 'Instagram'
    when host ~ 'google' then 'Google'
    when host ~ 'bing' then 'Bing'
    when host ~ 'duckduckgo' then 'DuckDuckGo'
    when host ~ 'yahoo' then 'Yahoo'
    when host ~ 'tiktok' then 'TikTok'
    when host ~ 'linkedin|lnkd\.in' then 'LinkedIn'
    when host ~ 'whatsapp|wa\.me' then 'WhatsApp'
    when host ~ 'youtube|youtu\.be' then 'YouTube'
    when host ~ 'daft\.ie' then 'Daft.ie'
    when host ~ 'reddit' then 'Reddit'
    when host ~ 'pinterest' then 'Pinterest'
    when host ~ 'twitter|t\.co|x\.com' then 'X'
    else host
  end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Statisticile cabinetului
--
-- Toate ruleaza cu drepturile celui care le cheama (security invoker), deci
-- politicile de mai sus raman in vigoare: cine nu e admin nu primeste nimic.
-- ---------------------------------------------------------------------------

-- Numerele mari: vizitatori, vizite, pagini, timp mediu, cereri.
create or replace function public.stats_overview(p_from timestamptz, p_to timestamptz)
returns table (
  visitors bigint,
  sessions bigint,
  views bigint,
  avg_seconds numeric,
  leads bigint,
  link_clicks bigint
)
language sql
stable
as $$
  with v as (
    select * from public.page_views where created_at >= p_from and created_at < p_to
  ),
  s as (
    select session_id, sum(dwell_ms) as ms from v group by session_id
  )
  select
    (select count(distinct visitor_hash) from v where visitor_hash is not null),
    (select count(*) from s),
    (select count(*) from v),
    (select coalesce(round(avg(ms) / 1000.0, 0), 0) from s),
    (select count(*) from public.leads where created_at >= p_from and created_at < p_to),
    (select count(*) from public.link_clicks where created_at >= p_from and created_at < p_to);
$$;

-- Graficul pe zile.
create or replace function public.stats_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, visitors bigint, sessions bigint, views bigint, leads bigint)
language sql
stable
as $$
  with days as (
    select generate_series(p_from::date, (p_to - interval '1 second')::date, interval '1 day')::date as day
  ),
  v as (
    select created_at::date as day, session_id, visitor_hash
    from public.page_views
    where created_at >= p_from and created_at < p_to
  ),
  l as (
    select created_at::date as day from public.leads
    where created_at >= p_from and created_at < p_to
  )
  select
    d.day,
    (select count(distinct visitor_hash) from v where v.day = d.day and v.visitor_hash is not null),
    (select count(distinct session_id) from v where v.day = d.day),
    (select count(*) from v where v.day = d.day),
    (select count(*) from l where l.day = d.day)
  from days d
  order by d.day;
$$;

-- De unde vin oamenii, si cati dintre ei cer o oferta.
create or replace function public.stats_sources(p_from timestamptz, p_to timestamptz)
returns table (source text, sessions bigint, views bigint, leads bigint)
language sql
stable
as $$
  with entries as (
    select distinct on (session_id)
      session_id,
      public.source_label(utm_source, referrer_host) as source
    from public.page_views
    where created_at >= p_from and created_at < p_to
    order by session_id, created_at
  ),
  v as (
    select e.source, count(*) as views
    from public.page_views p join entries e using (session_id)
    where p.created_at >= p_from and p.created_at < p_to
    group by e.source
  ),
  l as (
    select public.source_label(utm_source, referrer_host) as source, count(*) as leads
    from public.leads
    where created_at >= p_from and created_at < p_to
    group by 1
  )
  select
    e.source,
    count(*)::bigint,
    coalesce(max(v.views), 0)::bigint,
    coalesce(max(l.leads), 0)::bigint
  from entries e
  left join v on v.source = e.source
  left join l on l.source = e.source
  group by e.source
  order by 2 desc;
$$;

-- Paginile cele mai vizitate si cat se sta pe ele.
create or replace function public.stats_pages(p_from timestamptz, p_to timestamptz)
returns table (path text, views bigint, avg_seconds numeric)
language sql
stable
as $$
  select
    path,
    count(*)::bigint,
    coalesce(round(avg(nullif(dwell_ms, 0)) / 1000.0, 0), 0)
  from public.page_views
  where created_at >= p_from and created_at < p_to
  group by path
  order by 2 desc
  limit 40;
$$;

-- Telefon / tableta / calculator.
create or replace function public.stats_devices(p_from timestamptz, p_to timestamptz)
returns table (device text, sessions bigint)
language sql
stable
as $$
  select coalesce(device, 'unknown'), count(distinct session_id)::bigint
  from public.page_views
  where created_at >= p_from and created_at < p_to
  group by 1
  order by 2 desc;
$$;

-- Tara si oras, din headerele Vercel. Nu se salveaza niciun IP.
create or replace function public.stats_places(p_from timestamptz, p_to timestamptz)
returns table (country text, city text, sessions bigint)
language sql
stable
as $$
  select coalesce(country, '??'), coalesce(city, ''), count(distinct session_id)::bigint
  from public.page_views
  where created_at >= p_from and created_at < p_to
  group by 1, 2
  order by 3 desc
  limit 30;
$$;

-- Cum se comporta fiecare link de campanie.
create or replace function public.stats_links(p_from timestamptz, p_to timestamptz)
returns table (code text, label text, clicks bigint, leads bigint, active boolean, expires_at timestamptz)
language sql
stable
as $$
  select
    c.code,
    c.label,
    (select count(*) from public.link_clicks k
      where k.link_id = c.id and k.created_at >= p_from and k.created_at < p_to)::bigint,
    (select count(*) from public.leads l
      where l.link_code = c.code and l.created_at >= p_from and l.created_at < p_to)::bigint,
    c.active,
    c.expires_at
  from public.link_campaigns c
  order by 3 desc;
$$;

-- ============================================================================
-- Ultimul pas, o singura data: adauga adresa clientei si pe a ta.
--
--   insert into public.admin_emails (email, label) values
--     ('bpecleaning98@gmail.com', 'BPE'),
--     ('ark4su@gmail.com', 'ArtioMotion')
--   on conflict (email) do nothing;
--
-- Apoi creeaza-le conturile in Authentication > Users > Add user.
-- ============================================================================
