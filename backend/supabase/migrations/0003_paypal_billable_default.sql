-- PayPal can't invoice or pay out in Kenyan Shillings (KES), so KES is a display currency only:
-- new invoices fall back to USD at creation time (see app/money.invoice_currency), while the
-- dashboard restates every amount in the profile's chosen currency. KES remains a valid profile
-- default_currency; do not force existing KES profiles back to USD.
-- Safe to re-run.
alter table public.profiles alter column default_currency set default 'USD';
