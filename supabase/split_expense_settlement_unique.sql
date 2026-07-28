-- Prevent more than one open settlement between the same pair of users.
-- Optional but recommended after the Mark-paid duplicate fix.

create unique index if not exists split_settlements_one_open_pair_idx
  on public.split_settlements (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id),
    currency
  )
  where status = 'open';
