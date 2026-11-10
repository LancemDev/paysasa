-- PaySasa AI demo seed.
-- 1. Sign the demo user up first (Supabase Auth dashboard or the app), using the email below.
-- 2. Replace Sarah's email with her PayPal sandbox personal-account email.
-- 3. Run this file. It is safe to re-run.
-- 4. To make the sent invoices real (so reminders and payments work), run from backend/server:
--    .venv/bin/python -m scripts.link_seed_to_paypal   (needs PAYPAL_ADAPTER=real credentials)
--
-- Payout idempotency keys get a random suffix. PayPal refuses to reuse a sender_batch_id, so a
-- re-seeded payout must not reuse the key an earlier demo run already sent.
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

  -- The books below stay in USD (PayPal can settle USD). The app displays every amount in the
  -- profile's currency, so the demo opens in KES while the PayPal invoices remain USD.
  insert into profiles (id, display_name, default_currency)
  values (uid, 'Kwame', 'KES')
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
     'demo-payout-priya-1106-' || substr(md5(random()::text), 1, 10), '2026-09-12 09:05+00', '2026-10-10 13:45+00', null, null),
    (act_marcus, uid, 'payout', 'locked', inv_daniel_sent, c_marcus,
     20000, 'USD', 10.00, 'Payout Marcus Reed $200.00 upon settlement', null,
     'demo-payout-marcus-1102-' || substr(md5(random()::text), 1, 10), '2026-11-01 10:05+00', '2026-11-01 10:05+00', null, null),
    (act_reminder, uid, 'invoice_reminder', 'failed', inv_amara_overdue, null,
     null, null, null, 'Remind Amara Okafor: $3,500.00 is 9 days overdue',
     'Hi Amara, a friendly nudge that invoice DEMO-INV-1001 for Brand Film — Phase 2 ($3,500.00) was due on 28 October. Could you let me know when payment is scheduled? Thanks, Kwame',
     'demo-reminder-amara-1101', '2026-11-06 08:00+00', '2026-11-06 08:05+00', '2026-11-06 08:05+00', null)
    -- Note: seeded with a demo PayPal invoice ID not present in any PayPal environment; kept failed so the UI shows the handled state.
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

-- Second wave: more clients, a colorist, and payouts in every remaining state.
do $$
declare
  uid uuid;
  c_zara uuid; c_kofi uuid; c_elena uuid; c_priya uuid; c_marcus uuid; c_daniel uuid;
  inv_zara_overdue uuid := '11111111-1111-4111-8111-111111111107';
  inv_zara_sent    uuid := '11111111-1111-4111-8111-111111111108';
  inv_kofi_paid    uuid := '11111111-1111-4111-8111-111111111109';
  inv_kofi_draft   uuid := '11111111-1111-4111-8111-111111111110';
  act_elena_await  uuid := '22222222-2222-4222-8222-222222222204';
  act_priya_locked uuid := '22222222-2222-4222-8222-222222222205';
  act_zara_remind  uuid := '22222222-2222-4222-8222-222222222206';
  act_elena_done   uuid := '22222222-2222-4222-8222-222222222207';
  act_marcus_cxl   uuid := '22222222-2222-4222-8222-222222222208';
  r record;
begin
  select id into uid from auth.users where email = 'demo@paysasa.app';
  if uid is null then raise exception 'Demo user not found'; end if;

  insert into contacts (owner_id, name, email, role, aliases) values
    (uid, 'Zara Mensah',  'zara.mensah@example.com',  'client',     '{"Zara from Kente Labs"}'),
    (uid, 'Kofi Boateng', 'kofi.boateng@example.com', 'client',     '{"the restaurant guy"}'),
    (uid, 'Elena Rossi',  'elena.rossi@example.com',  'contractor', '{"my colorist"}')
  on conflict (owner_id, email) do nothing;

  select id into c_zara   from contacts where owner_id = uid and email = 'zara.mensah@example.com';
  select id into c_kofi   from contacts where owner_id = uid and email = 'kofi.boateng@example.com';
  select id into c_elena  from contacts where owner_id = uid and email = 'elena.rossi@example.com';
  select id into c_priya  from contacts where owner_id = uid and email = 'priya.nair@example.com';
  select id into c_marcus from contacts where owner_id = uid and email = 'marcus.reed@example.com';
  select id into c_daniel from contacts where owner_id = uid and email = 'daniel.carter@example.com';

  insert into invoices (id, owner_id, contact_id, paypal_invoice_id, description, amount_minor,
                        currency, status, paypal_status, due_date, sent_at, paid_at, created_at, updated_at)
  values
    (inv_zara_overdue, uid, c_zara, 'DEMO-INV-1007', 'App Launch Teaser', 420000,
     'USD', 'sent', 'SENT', '2026-11-01', '2026-10-18 12:00+00', null,
     '2026-10-18 12:00+00', '2026-10-18 12:00+00'),
    (inv_zara_sent, uid, c_zara, 'DEMO-INV-1008', 'Investor Day Highlights', 280000,
     'USD', 'sent', 'SENT', '2026-11-30', '2026-11-05 09:30+00', null,
     '2026-11-05 09:30+00', '2026-11-05 09:30+00'),
    (inv_kofi_paid, uid, c_kofi, 'DEMO-INV-1009', 'Menu Photoshoot', 150000,
     'USD', 'paid', 'PAID', '2026-11-10', '2026-10-27 15:00+00', '2026-11-07 18:20+00',
     '2026-10-27 15:00+00', '2026-11-07 18:20+00'),
    (inv_kofi_draft, uid, c_kofi, null, 'Holiday Promo Reel', 95000,
     'USD', 'draft', null, '2026-12-05', null, null,
     '2026-11-08 11:00+00', '2026-11-08 11:00+00')
  on conflict (id) do nothing;

  insert into pending_actions (id, owner_id, type, status, trigger_invoice_id, payee_contact_id,
                               amount_minor, currency, split_percent, summary, draft_message,
                               idempotency_key, paypal_payout_batch_id, created_at, updated_at, decided_at, executed_at)
  values
    (act_elena_await, uid, 'payout', 'awaiting_approval', inv_kofi_paid, c_elena,
     18000, 'USD', 12.00, 'Payout Elena Rossi $180.00', null,
     'demo-payout-elena-1109-' || substr(md5(random()::text), 1, 10), null, '2026-10-27 15:05+00', '2026-11-07 18:20+00', null, null),
    (act_priya_locked, uid, 'payout', 'locked', inv_zara_sent, c_priya,
     42000, 'USD', 15.00, 'Payout Priya Nair $420.00 upon settlement', null,
     'demo-payout-priya-1108-' || substr(md5(random()::text), 1, 10), null, '2026-11-05 09:35+00', '2026-11-05 09:35+00', null, null),
    (act_zara_remind, uid, 'invoice_reminder', 'failed', inv_zara_overdue, null,
     null, null, null, 'Remind Zara Mensah: $4,200.00 is 8 days overdue',
     'Hi Zara, a quick reminder that invoice DEMO-INV-1007 for the App Launch Teaser ($4,200.00) was due on 1 November. Could you share when payment will go out? Thanks, Kwame',
     'demo-reminder-zara-1107', null, '2026-11-09 08:00+00', '2026-11-09 08:05+00', '2026-11-09 08:05+00', null),
    (act_elena_done, uid, 'payout', 'succeeded', '11111111-1111-4111-8111-111111111104', c_elena,
     20000, 'USD', 10.00, 'Payout Elena Rossi $200.00', null,
     'demo-payout-elena-1104', 'DEMOBATCH0007', '2026-10-02 08:35+00', '2026-10-29 09:12+00',
     '2026-10-29 09:00+00', '2026-10-29 09:01+00'),
    (act_marcus_cxl, uid, 'payout', 'cancelled', '11111111-1111-4111-8111-111111111105', c_marcus,
     9000, 'USD', 10.00, 'Payout Marcus Reed $90.00 upon settlement', null,
     'demo-payout-marcus-1105', null, '2026-09-20 10:05+00', '2026-10-16 11:00+00', null, null)
  on conflict (id) do nothing;

  for r in
    select * from (values
      ('agent',  'payout.scheduled',  'Payout Marcus Reed $90.00 upon settlement', 'pending_action', act_marcus_cxl, '2026-09-20 10:05+00'::timestamptz),
      ('user',   'payout.cancelled',  'Payout Marcus Reed $90.00: cancelled because the invoice was cancelled', 'pending_action', act_marcus_cxl, '2026-10-16 11:00+00'::timestamptz),
      ('agent',  'payout.scheduled',  'Payout Elena Rossi $200.00 upon settlement', 'pending_action', act_elena_done, '2026-10-02 08:35+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Zara Mensah a $4,200.00 invoice for App Launch Teaser', 'invoice', inv_zara_overdue, '2026-10-18 12:00+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Kofi Boateng a $1,500.00 invoice for Menu Photoshoot', 'invoice', inv_kofi_paid, '2026-10-27 15:00+00'::timestamptz),
      ('agent',  'payout.scheduled',  'Payout Elena Rossi $180.00 upon settlement', 'pending_action', act_elena_await, '2026-10-27 15:05+00'::timestamptz),
      ('paypal', 'payout.unlocked',   'Payout Elena Rossi $200.00 unlocked: needs your approval', 'pending_action', act_elena_done, '2026-10-28 16:10+00'::timestamptz),
      ('user',   'payout.approved',   'Kwame approved: Payout Elena Rossi $200.00', 'pending_action', act_elena_done, '2026-10-29 09:00+00'::timestamptz),
      ('paypal', 'payout.succeeded',  'Payout Elena Rossi $200.00: PayPal completed the payout', 'pending_action', act_elena_done, '2026-10-29 09:12+00'::timestamptz),
      ('agent',  'invoice.sent',      'Sent Zara Mensah a $2,800.00 invoice for Investor Day Highlights', 'invoice', inv_zara_sent, '2026-11-05 09:30+00'::timestamptz),
      ('agent',  'payout.scheduled',  'Payout Priya Nair $420.00 upon settlement', 'pending_action', act_priya_locked, '2026-11-05 09:35+00'::timestamptz),
      ('paypal', 'invoice.paid',      'Kofi Boateng paid $1,500.00 for Menu Photoshoot', 'invoice', inv_kofi_paid, '2026-11-07 18:20+00'::timestamptz),
      ('paypal', 'payout.unlocked',   'Payout Elena Rossi $180.00 unlocked: needs your approval', 'pending_action', act_elena_await, '2026-11-07 18:20+00'::timestamptz),
      ('agent',  'reminder.drafted',  'Drafted a reminder to Zara Mensah: $4,200.00 is 8 days overdue', 'pending_action', act_zara_remind, '2026-11-09 08:00+00'::timestamptz)
    ) as v(actor, event, message, entity_type, entity_id, created_at)
  loop
    insert into activity_log (owner_id, actor, event, message, entity_type, entity_id, created_at)
    select uid, r.actor::actor_kind, r.event, r.message, r.entity_type, r.entity_id, r.created_at
    where not exists (
      select 1 from activity_log
      where owner_id = uid and event = r.event and entity_id = r.entity_id and created_at = r.created_at
    );
  end loop;
end $$;
