-- PaySasa AI: initial schema. Money is always bigint minor units plus a 3-letter currency code.

-- Enums
create type contact_role   as enum ('client', 'contractor');
create type invoice_status as enum ('draft', 'sent', 'paid', 'cancelled', 'failed');
create type action_type    as enum ('payout', 'invoice_reminder');
create type action_status  as enum ('locked', 'awaiting_approval', 'executing', 'submitted',
                                    'succeeded', 'failed', 'rejected', 'cancelled');
create type actor_kind     as enum ('agent', 'user', 'paypal', 'system');

create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null,
  default_currency char(3) not null default 'USD',
  created_at       timestamptz not null default now()
);

create table contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null,
  role       contact_role not null,
  aliases    text[] not null default '{}',      -- e.g. {'my editor'}
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);

create table invoices (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  contact_id        uuid not null references contacts(id),
  paypal_invoice_id text unique,
  description       text not null,
  amount_minor      bigint not null check (amount_minor > 0),
  currency          char(3) not null,
  status            invoice_status not null default 'draft',
  paypal_status     text,                        -- raw PayPal status, for debugging
  due_date          date,
  sent_at           timestamptz,
  paid_at           timestamptz,
  last_reminder_at  timestamptz,
  error             text,
  agent_run_id      uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table pending_actions (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users(id) on delete cascade,
  type                   action_type not null,
  status                 action_status not null,
  trigger_invoice_id     uuid references invoices(id),  -- payout unlocks when this is paid; reminder targets it
  payee_contact_id       uuid references contacts(id),
  amount_minor           bigint check (amount_minor > 0),
  currency               char(3),
  split_percent          numeric(5,2),
  summary                text not null,          -- grid text, e.g. 'Payout Sarah $240 upon settlement'
  draft_message          text,                   -- reminders: the note the LLM drafted
  idempotency_key        text not null unique,   -- sent to PayPal as sender_batch_id
  paypal_payout_batch_id text,
  error                  text,
  decided_at             timestamptz,
  executed_at            timestamptz,
  agent_run_id           uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table agent_runs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  user_message text not null,
  reply        text,
  tool_calls   jsonb not null default '[]',
  status       text not null default 'running',   -- running | completed | failed
  error        text,
  created_at   timestamptz not null default now()
);

create table activity_log (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  actor       actor_kind not null,
  event       text not null,                      -- e.g. 'invoice.sent', 'payout.unlocked'
  message     text not null,                      -- one human-readable line for the grid
  entity_type text,
  entity_id   uuid,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table webhook_events (
  id           text primary key,                  -- PayPal event id; makes processing idempotent
  event_type   text not null,
  resource_id  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create index on invoices (owner_id, status);
create index on pending_actions (trigger_invoice_id);
create index on pending_actions (owner_id, status);
create index agent_runs_owner_created_idx on agent_runs (owner_id, created_at desc);

-- updated_at
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger invoices_updated before update on invoices
  for each row execute function set_updated_at();
create trigger actions_updated before update on pending_actions
  for each row execute function set_updated_at();

-- Row-level security: users can only READ their own rows. All writes use the server's service role.
alter table profiles        enable row level security;
alter table contacts        enable row level security;
alter table invoices        enable row level security;
alter table pending_actions enable row level security;
alter table agent_runs      enable row level security;
alter table activity_log    enable row level security;
alter table webhook_events  enable row level security;   -- no policies: server only

create policy read_own on profiles        for select using (id = auth.uid());
create policy read_own on contacts        for select using (owner_id = auth.uid());
create policy read_own on invoices        for select using (owner_id = auth.uid());
create policy read_own on pending_actions for select using (owner_id = auth.uid());
create policy read_own on agent_runs      for select using (owner_id = auth.uid());
create policy read_own on activity_log    for select using (owner_id = auth.uid());

-- Realtime for the dashboard
alter publication supabase_realtime add table invoices, pending_actions, contacts, activity_log;
