-- Security hardening for existing databases.
-- New databases get this index from 0001_init.sql; this migration is safe to re-run.

-- The assistant rate limit counts a user's recent runs on every message.
create index if not exists agent_runs_owner_created_idx
  on agent_runs (owner_id, created_at desc);

-- Defense in depth: a payout may only reference a contact owned by the same user.
-- (The API already enforces this; the trigger rejects any future code path that forgets.)
create or replace function enforce_payout_owner() returns trigger language plpgsql as $$
begin
  if new.type = 'payout' and new.payee_contact_id is not null then
    if not exists (
      select 1 from contacts c
      where c.id = new.payee_contact_id and c.owner_id = new.owner_id
    ) then
      raise exception 'payout payee must belong to the same owner';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pending_actions_owner_guard on pending_actions;
create trigger pending_actions_owner_guard
  before insert or update of payee_contact_id, owner_id, type on pending_actions
  for each row execute function enforce_payout_owner();

-- Defense in depth: an invoice may only reference a contact owned by the same user.
create or replace function enforce_invoice_owner() returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from contacts c
    where c.id = new.contact_id and c.owner_id = new.owner_id
  ) then
    raise exception 'invoice contact must belong to the same owner';
  end if;
  return new;
end $$;

drop trigger if exists invoices_owner_guard on invoices;
create trigger invoices_owner_guard
  before insert or update of contact_id, owner_id on invoices
  for each row execute function enforce_invoice_owner();
