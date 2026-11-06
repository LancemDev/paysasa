-- PaySasa AI demo seed.
-- 1. Sign the demo user up first (Supabase Auth dashboard or the app), using the email below.
-- 2. Replace Sarah's email with her PayPal sandbox personal-account email.
-- 3. Run this file. It is safe to re-run.
do $$
declare
  demo_email  text := 'demo@paysasa.app';                 -- the demo user's login email
  sarah_email text := 'sarah-sandbox@personal.example.com'; -- TODO: Sarah's PayPal sandbox email
  uid uuid;
  c_amara uuid; c_daniel uuid; c_liam uuid; c_marcus uuid; c_priya uuid;
  inv_amara_overdue uuid := '11111111-1111-4111-8111-111111111101';
  inv_daniel_sent   uuid := '11111111-1111-4111-8111-111111111102';
  inv_liam_draft    uuid := '11111111-1111-4111-8111-111111111103';
  inv_daniel_paid   uuid := '11111111-1111-4111-8111-111111111104';
  inv_liam_cancel   uuid := '11111111-1111-4111-8111-111111111105';
  inv_amara_paid    uuid := '11111111-1111-4111-8111-111111111106';
  act_priya         uuid := '22222222-2222-4222-8222-222222222201';
  act_marcus        uuid := '22222222-2222-4222-8222-222222222202';
  act_reminder      uuid := '22222222-2222-4222-8222-222222222203';
  r record;
begin
  select id into uid from auth.users where email = demo_email;
  if uid is null then
    raise exception 'Demo user % not found in auth.users. Sign up first.', demo_email;
  end if;

  insert into profiles (id, display_name, default_currency)
  values (uid, 'Kwame', 'USD')
  on conflict (id) do nothing;

  insert into contacts (owner_id, name, email, role, aliases) values
    (uid, 'Daniel Carter', 'daniel.carter@example.com', 'client',     '{}'),
    (uid, 'Amara Okafor',  'amara.okafor@example.com',  'client',     '{"the fintech founder"}'),
    (uid, 'Liam Chen',     'liam.chen@example.com',     'client',     '{"Liam from Northwind"}'),
    (uid, 'Priya Nair',    'priya.nair@example.com',    'contractor', '{"my designer"}'),
    (uid, 'Marcus Reed',   'marcus.reed@example.com',   'contractor', '{"sound guy"}'),
    (uid, 'Sarah',         sarah_email,                 'contractor', '{"my editor"}')
  on conflict (owner_id, email) do nothing;

  select id into c_amara  from contacts where owner_id = uid and email = 'amara.okafor@example.com';
  select id into c_daniel from contacts where owner_id = uid and email = 'daniel.carter@example.com';
  select id into c_liam   from contacts where owner_id = uid and email = 'liam.chen@example.com';
  select id into c_marcus from contacts where owner_id = uid and email = 'marcus.reed@example.com';
  select id into c_priya  from contacts where owner_id = uid and email = 'priya.nair@example.com';

  -- Invoices: one of each display state, with dates spread over the last two months.
  insert into invoices (id, owner_id, contact_id, paypal_invoice_id, description, amount_minor,
                        currency, status, paypal_status, due_date, sent_at, paid_at, created_at, updated_at)
  values
    -- overdue: sent but past its due date
    (inv_amara_overdue, uid, c_amara,  'DEMO-INV-1001', 'Brand Film — Phase 2', 350000,
     'USD', 'sent',      'SENT',      '2026-10-28', '2026-10-14 09:15+00', null,
     '2026-10-14 09:15+00', '2026-10-14 09:15+00'),
    -- awaiting payment: sent, not due yet
    (inv_daniel_sent,   uid, c_daniel, 'DEMO-INV-1002', 'November Retainer', 200000,
     'USD', 'sent',      'SENT',      '2026-11-15', '2026-11-01 10:00+00', null,
     '2026-11-01 10:00+00', '2026-11-01 10:00+00'),
    -- draft: not sent
    (inv_liam_draft,    uid, c_liam,   null,            'Product Launch Cut', 180000,
     'USD', 'draft',     null,        '2026-11-25', null, null,
     '2026-11-04 14:20+00', '2026-11-04 14:20+00'),
    -- paid last week
    (inv_daniel_paid,   uid, c_daniel, 'DEMO-INV-1004', 'October Retainer', 200000,
     'USD', 'paid',      'PAID',      '2026-10-30', '2026-10-02 08:30+00', '2026-10-28 16:10+00',
     '2026-10-02 08:30+00', '2026-10-28 16:10+00'),
    -- cancelled
    (inv_liam_cancel,   uid, c_liam,   'DEMO-INV-1005', 'Podcast Bundle', 90000,
     'USD', 'cancelled', 'CANCELLED', '2026-10-15', '2026-09-20 10:00+00', null,
     '2026-09-20 10:00+00', '2026-10-16 11:00+00'),
    -- paid two months ago; funds the Priya payout awaiting approval
    (inv_amara_paid,    uid, c_amara,  'DEMO-INV-1006', 'Brand Film — Phase 1', 250000,
     'USD', 'paid',      'PAID',      '2026-09-30', '2026-09-12 09:00+00', '2026-10-10 13:45+00',
     '2026-09-12 09:00+00', '2026-10-10 13:45+00')
  on conflict (id) do nothing;

  -- Pending actions: an unlocked payout, a locked payout and an overdue reminder.
  insert into pending_actions (id, owner_id, type, status, trigger_invoice_id, payee_contact_id,
                               amount_minor, currency, split_percent, summary, draft_message,
                               idempotency_key, created_at, updated_at, decided_at, executed_at)
  values
    (act_priya, uid, 'payout', 'awaiting_approval', inv_amara_paid, c_priya,
     37500, 'USD', 15.00, 'Payout Priya Nair $375.00', null,
     'demo-payout-priya-1106', '2026-09-12 09:05+00', '2026-10-10 13:45+00', null, null),
    (act_marcus, uid, 'payout', 'locked', inv_daniel_sent, c_marcus,
     20000, 'USD', 10.00, 'Payout Marcus Reed $200.00 upon settlement', null,
     'demo-payout-marcus-1102', '2026-11-01 10:05+00', '2026-11-01 10:05+00', null, null),
    (act_reminder, uid, 'invoice_reminder', 'awaiting_approval', inv_amara_overdue, null,
     null, null, null, 'Remind Amara Okafor: $3,500.00 is 9 days overdue',
     'Hi Amara, a friendly nudge that invoice DEMO-INV-1001 for Brand Film — Phase 2 ($3,500.00) was due on 28 October. Could you let me know when payment is scheduled? Thanks, Kwame',
     'demo-reminder-amara-1101', '2026-11-06 08:00+00', '2026-11-06 08:00+00', null, null)
  on conflict (id) do nothing;

  -- Activity feed, in the same shape the app writes.
  for r in
    select * from (values
      ('agent',  'invoice.sent',      'Sent Amara Okafor a $2,500.00 invoice for Brand Film — Phase 1',
       'invoice', inv_amara_paid, '{"from": "draft", "to": "sent"}'::jsonb, '2026-09-12 09:00+00'::timestamptz),
      ('agent',  'payout.scheduled',  'Payout Priya Nair $375.00 upon settlement',
       'pending_action', act_priya, '{"amount_minor": 37500, "currency": "USD", "invoice_id": "11111111-1111-4111-8111-111111111106"}'::jsonb, '2026-09-12 09:05+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Liam Chen a $900.00 invoice for Podcast Bundle',
       'invoice', inv_liam_cancel, '{"from": "draft", "to": "sent"}'::jsonb, '2026-09-20 10:00+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Daniel Carter a $2,000.00 invoice for October Retainer',
       'invoice', inv_daniel_paid, '{"from": "draft", "to": "sent"}'::jsonb, '2026-10-02 08:30+00'::timestamptz),
      ('paypal', 'invoice.paid',      'Amara Okafor paid $2,500.00 for Brand Film — Phase 1',
       'invoice', inv_amara_paid, '{"from": "sent", "to": "paid"}'::jsonb, '2026-10-10 13:45+00'::timestamptz),
      ('paypal', 'payout.unlocked',   'Payout Priya Nair $375.00 unlocked: needs your approval',
       'pending_action', act_priya, '{"from": "locked", "to": "awaiting_approval"}'::jsonb, '2026-10-10 13:45+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Amara Okafor a $3,500.00 invoice for Brand Film — Phase 2',
       'invoice', inv_amara_overdue, '{"from": "draft", "to": "sent"}'::jsonb, '2026-10-14 09:15+00'::timestamptz),
      ('user',   'invoice.cancelled', 'Invoice to Liam Chen for Podcast Bundle was cancelled',
       'invoice', inv_liam_cancel, '{"from": "sent", "to": "cancelled"}'::jsonb, '2026-10-16 11:00+00'::timestamptz),
      ('paypal', 'invoice.paid',      'Daniel Carter paid $2,000.00 for October Retainer',
       'invoice', inv_daniel_paid, '{"from": "sent", "to": "paid"}'::jsonb, '2026-10-28 16:10+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Daniel Carter a $2,000.00 invoice for November Retainer',
       'invoice', inv_daniel_sent, '{"from": "draft", "to": "sent"}'::jsonb, '2026-11-01 10:00+00'::timestamptz),
      ('agent',  'payout.scheduled',  'Payout Marcus Reed $200.00 upon settlement',
       'pending_action', act_marcus, '{"amount_minor": 20000, "currency": "USD", "invoice_id": "11111111-1111-4111-8111-111111111102"}'::jsonb, '2026-11-01 10:05+00'::timestamptz),
      ('agent',  'reminder.drafted',  'Drafted a reminder to Amara Okafor: $3,500.00 is 9 days overdue',
       'pending_action', act_reminder, '{"to": "awaiting_approval"}'::jsonb, '2026-11-06 08:00+00'::timestamptz)
    ) as v(actor, event, message, entity_type, entity_id, details, created_at)
  loop
    insert into activity_log (owner_id, actor, event, message, entity_type, entity_id, details, created_at)
    select uid, r.actor::actor_kind, r.event, r.message, r.entity_type, r.entity_id, r.details, r.created_at
    where not exists (
      select 1 from activity_log
      where owner_id = uid and event = r.event and entity_id = r.entity_id and created_at = r.created_at
    );
  end loop;
end $$;
