-- Closed settlements are financial history and must remain immutable.
-- Safe to run on databases where the old test-only delete feature was applied.
drop policy if exists "split_settlements_delete_closed" on public.split_settlements;
revoke delete on public.split_settlements from authenticated;
drop function if exists public.split_delete_closed_settlement(uuid);
drop function if exists public.split_delete_all_closed_settlements();
