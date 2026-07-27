# Premium sync (Supabase)

## Apply SQL

1. Run `schema.sql`, `user_data.sql`, `user_categories.sql`, `cash_books.sql` if not already.
2. Run **`premium_sync.sql`** (Premium flags, session lock, purge function, bill-images bucket). If Storage has no buckets yet, also run **`bill_images_bucket.sql`**.
3. Run **`ensure_profile_session.sql`** (profile upsert RPC + safer `claim_session`).
4. Run **`app_settings.sql`** then **`admin_premium_users.sql`** (shared Premium price, feature gates, admin set-user-premium, monthly/yearly billing filter). Re-run `admin_premium_users.sql` after updates.

## Edge Function (3-month frozen cloud purge)

```bash
supabase functions deploy purge-frozen-cloud
```

Schedule daily (Dashboard → Edge Functions → Schedules), e.g. `0 3 * * *`.

The function calls `purge_expired_cloud_data()` with the service role.

## OAuth sign-in (Google / Apple)

Right now Google/Apple are **off** on the project until you enable them.

### 1. Enable Google in Supabase

1. Open [Authentication → Providers](https://supabase.com/dashboard/project/egbcgwqhwubiasiuxekr/auth/providers)
2. Turn **Google** on
3. Paste **Client ID** + **Client Secret** from Google Cloud (below)

### 2. Create Google OAuth credentials

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create **OAuth client ID** → type **Web application**
3. Authorized redirect URI (exact):

```
https://egbcgwqhwubiasiuxekr.supabase.co/auth/v1/callback
```

4. Copy Client ID + Secret into the Supabase Google provider form → Save

### 3. Allow app redirect URLs (fixes “localhost refused to connect” / endless loading)

[Authentication → URL Configuration](https://supabase.com/dashboard/project/egbcgwqhwubiasiuxekr/auth/url-configuration):

1. **Site URL**:

```
financetracker://auth/callback
```

2. **Additional Redirect URLs** (add all of these):

```
financetracker://**
financetracker://auth/callback
exp://**
```

If you test in **Expo Go**, after tapping Google check the Metro console for:
`[oauth] Google redirectTo= exp://…`
and add that exact URL (or keep `exp://**`).

Endless “Choose an account to continue to ….supabase.co” usually means the redirect back to the app is not allowlisted — add the URLs above, save, retry.

### 4. Apple (optional)

Same flow: enable **Apple** under Providers and add Apple Developer Services ID / key.
Apple accounts are also provider-verified (no app email to send).

Google/Apple accounts are already verified by the provider, so users do not need a separate email confirmation step.

## Admin user list

**Required:** run the full **`admin_list_users.sql`** in Supabase → SQL Editor.

That script:

- creates `list_signed_in_profiles` (reads **all** `auth.users`, with name + email)
- creates `admin_delete_user` (either admin can delete users **and** the other admin)
- recognizes admins via `role = 'admin'`, profile email, or JWT email allowlist
- promotes both allowlisted admin emails to `role = 'admin'`

In the app: Admin → Users → **Refresh users**.

You cannot delete your own account from this screen. The last remaining admin also cannot be deleted.

## Behaviour

| Tier | Storage |
|------|---------|
| Free | Local only. Backup/Restore via file share. |
| Premium | Local + Supabase DB + `bill-images` storage. Only data from `premium_since` (server time) is uploaded. |

Downgrade freezes cloud and sets `cloud_purge_at = now() + 3 months`.
