# Premium sync (Supabase)

## Apply SQL

1. Run `schema.sql`, `user_data.sql`, `user_categories.sql`, `cash_books.sql` if not already.
2. Run **`premium_sync.sql`** (Premium flags, session lock, purge function, bill-images bucket).

## Edge Function (3-month frozen cloud purge)

```bash
supabase functions deploy purge-frozen-cloud
```

Schedule daily (Dashboard → Edge Functions → Schedules), e.g. `0 3 * * *`.

The function calls `purge_expired_cloud_data()` with the service role.

## Behaviour

| Tier | Storage |
|------|---------|
| Free | Local only. Backup/Restore via file share. |
| Premium | Local + Supabase DB + `bill-images` storage. Only data from `premium_since` (server time) is uploaded. |

Downgrade freezes cloud and sets `cloud_purge_at = now() + 3 months`.
