-- Switch the default profile currency to Kenyan Shillings (KES) and support major currency selection.
alter table public.profiles alter column default_currency set default 'KES';

-- Existing profiles created with the old default are moved to KES unless they explicitly chose another supported currency.
update public.profiles
set default_currency = 'KES'
where default_currency = 'USD';
