-- Enable realtime so Mark paid / Confirm received sync to the other phone.
-- Run once in Supabase → SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table public.split_settlements;
  exception
    when duplicate_object then null;
    when undefined_object then
      raise notice 'supabase_realtime publication missing — enable Realtime in project settings';
  end;
  begin
    alter publication supabase_realtime add table public.split_expenses;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
