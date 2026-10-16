-- PaySasa AI demo seed.
-- 1. Sign the demo user up first (Supabase Auth dashboard or the app), using the email below.
-- 2. Replace Sarah's email with her PayPal sandbox personal-account email.
-- 3. Run this file. It is safe to re-run.
do $$
declare
  demo_email  text := 'demo@paysasa.app';                 -- the demo user's login email
  sarah_email text := 'sarah-sandbox@personal.example.com'; -- TODO: Sarah's PayPal sandbox email
  uid uuid;
begin
  select id into uid from auth.users where email = demo_email;
  if uid is null then
    raise exception 'Demo user % not found in auth.users. Sign up first.', demo_email;
  end if;

  insert into profiles (id, display_name, default_currency)
  values (uid, 'Kwame', 'USD')
  on conflict (id) do nothing;

  insert into contacts (owner_id, name, email, role, aliases) values
    (uid, 'John Doe', 'john@example.com', 'client',     '{}'),
    (uid, 'Sarah',    sarah_email,        'contractor', '{"my editor"}')
  on conflict (owner_id, email) do nothing;
end $$;
