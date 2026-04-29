-- Full Supabase update for Sophon Driver / Delivery app
-- Goal:
-- 1) ensure the main tables used by the app exist
-- 2) keep staff accounts in app_users
-- 3) delete all saved operational data from purchase_orders
-- 4) delete saved custom prices from product_prices
-- 5) keep operational audit logs in app_logs for website activity syncing

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- app_users (keep this table and its rows)
-- =========================================================
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password text not null default '',
  full_name text not null default '',
  role text not null default 'Sales',
  department text not null default 'Sales',
  employee_code text not null default '',
  position text not null default '',
  email text not null default '',
  phone text not null default '',
  area text not null default '',
  vehicle_type text not null default '',
  max_orders integer,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists username text;
alter table public.app_users add column if not exists password text not null default '';
alter table public.app_users add column if not exists full_name text not null default '';
alter table public.app_users add column if not exists role text not null default 'Sales';
alter table public.app_users add column if not exists department text not null default 'Sales';
alter table public.app_users add column if not exists employee_code text not null default '';
alter table public.app_users add column if not exists position text not null default '';
alter table public.app_users add column if not exists email text not null default '';
alter table public.app_users add column if not exists phone text not null default '';
alter table public.app_users add column if not exists area text not null default '';
alter table public.app_users add column if not exists vehicle_type text not null default '';
alter table public.app_users add column if not exists max_orders integer;
alter table public.app_users add column if not exists note text not null default '';
alter table public.app_users add column if not exists created_at timestamptz not null default now();
alter table public.app_users add column if not exists updated_at timestamptz not null default now();

create unique index if not exists app_users_username_uidx
  on public.app_users (username);

-- =========================================================
-- purchase_orders (operational workflow data)
-- =========================================================
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null,
  customer_name text not null default '',
  contact text not null default '',
  items_text text not null default '',
  estimated_amount numeric(12,2),
  confirmed_amount numeric(12,2),
  delivery_date date,
  address text not null default '',
  maps_url text not null default '',
  area text not null default '',
  status text not null default 'LINE_RECEIVED',
  source text not null default '',
  selected_products jsonb not null default '[]'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_orders add column if not exists po_number text;
alter table public.purchase_orders add column if not exists customer_name text not null default '';
alter table public.purchase_orders add column if not exists contact text not null default '';
alter table public.purchase_orders add column if not exists items_text text not null default '';
alter table public.purchase_orders add column if not exists estimated_amount numeric(12,2);
alter table public.purchase_orders add column if not exists confirmed_amount numeric(12,2);
alter table public.purchase_orders add column if not exists delivery_date date;
alter table public.purchase_orders add column if not exists address text not null default '';
alter table public.purchase_orders add column if not exists maps_url text not null default '';
alter table public.purchase_orders add column if not exists area text not null default '';
alter table public.purchase_orders add column if not exists status text not null default 'LINE_RECEIVED';
alter table public.purchase_orders add column if not exists source text not null default '';
alter table public.purchase_orders add column if not exists selected_products jsonb not null default '[]'::jsonb;
alter table public.purchase_orders add column if not exists raw_data jsonb not null default '{}'::jsonb;
alter table public.purchase_orders add column if not exists created_at timestamptz not null default now();
alter table public.purchase_orders add column if not exists updated_at timestamptz not null default now();

create unique index if not exists purchase_orders_po_number_uidx
  on public.purchase_orders (po_number);

create index if not exists purchase_orders_delivery_date_idx
  on public.purchase_orders (delivery_date);

create index if not exists purchase_orders_status_idx
  on public.purchase_orders (status);

-- =========================================================
-- app_logs (operational audit trail)
-- =========================================================
create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  order_id text not null default '',
  driver_id text not null default '',
  status text not null default '',
  note text not null default '',
  acted_by_id text not null default '',
  acted_by_name text not null default '',
  acted_by_role text not null default '',
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_logs add column if not exists order_id text not null default '';
alter table public.app_logs add column if not exists driver_id text not null default '';
alter table public.app_logs add column if not exists status text not null default '';
alter table public.app_logs add column if not exists note text not null default '';
alter table public.app_logs add column if not exists acted_by_id text not null default '';
alter table public.app_logs add column if not exists acted_by_name text not null default '';
alter table public.app_logs add column if not exists acted_by_role text not null default '';
alter table public.app_logs add column if not exists timestamp timestamptz not null default now();
alter table public.app_logs add column if not exists created_at timestamptz not null default now();
alter table public.app_logs add column if not exists updated_at timestamptz not null default now();

create index if not exists app_logs_order_id_idx
  on public.app_logs (order_id);

create index if not exists app_logs_timestamp_idx
  on public.app_logs (timestamp desc);

-- =========================================================
-- product_prices (saved custom prices)
-- =========================================================
create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_code text not null,
  product_name text not null default '',
  selling_price numeric(12,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_prices add column if not exists product_code text;
alter table public.product_prices add column if not exists product_name text not null default '';
alter table public.product_prices add column if not exists selling_price numeric(12,2) not null default 0;
alter table public.product_prices add column if not exists note text not null default '';
alter table public.product_prices add column if not exists created_at timestamptz not null default now();
alter table public.product_prices add column if not exists updated_at timestamptz not null default now();

create unique index if not exists product_prices_product_code_uidx
  on public.product_prices (product_code);

-- =========================================================
-- Delete all saved information except staff accounts
-- =========================================================
delete from public.purchase_orders;
delete from public.app_logs;
delete from public.product_prices;

commit;

-- Optional:
-- If your browser app still cannot read/write these tables with the publishable key,
-- check your RLS policies in Supabase. Do not open them publicly unless you intend to.
