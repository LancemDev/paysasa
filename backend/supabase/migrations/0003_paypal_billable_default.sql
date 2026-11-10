-- PayPal can't invoice or pay out in Kenyan Shillings (KES), so KES can't be the default for new invoices.
-- Put the default back to USD and move profiles that 0002 switched to KES. KES stays available for display.
-- Safe to re-run.
alter table public.profiles alter column default_currency set default 'USD';

update public.profiles
set default_currency = 'USD'
where default_currency = 'KES';
