create table suppliers (
  id serial primary key,
  name text not null,
  contact text,
  phone text,
  created_at timestamp default now()
);