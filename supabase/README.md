# Premium sync (Supabase)

## Apply SQL

1. Run `schema.sql`, `user_data.sql`, `user_categories.sql`, `cash_books.sql` if not already.
2. Run **`premium_sync.sql`** (Premium flags, session lock, purge function, bill-images bucket). If Storage has no buckets yet, also run **`bill_images_bucket.sql`**.
3. Run **`ensure_profile_session.sql`** (profile upsert RPC + safer `claim_session`).
4. Run **`app_settings.sql`** then **`admin_premium_users.sql`** (shared Premium price, feature gates, admin set-user-premium, monthly/yearly billing filter). Re-run `admin_premium_users.sql` after updates.
5. Run **`split_expense.sql`** (friends, groups, shared expenses, settlements, email invite RPCs).
6. If invites don’t show for the other user, also run **`split_expense_invite_fix.sql`**.
7. If create group errors with “infinite recursion”, run **`split_expense_groups_fix.sql`**.
8. If expenses warn with “infinite recursion” on `split_expense_shares`, run **`split_expense_expenses_fix.sql`**.
9. For delete-friend / cancel-invite, run **`split_expense_remove_friend.sql`**.
10. For editing split expenses from History, run **`split_expense_update.sql`**.
11. For edit/delete groups, run **`split_expense_group_edit.sql`**.
12. To block expired-Premium friends on new splits, run **`split_expense_require_premium_participants.sql`**.
13. To prevent duplicate open settlements between the same friends, run **`split_expense_settlement_unique.sql`**.
   If it fails because duplicates already exist, cancel/complete extras in the `split_settlements` table first.
14. For % / shares / adjustment split modes, run **`split_expense_modes.sql`**.
15. So Mark paid syncs to the other phone live, run **`split_expense_realtime.sql`** (also enable Realtime for those tables in Dashboard if needed).
16. For optional Finance categories on split expenses (Charts), run **`split_expense_finance_category.sql`**.
17. To manage AdMob settings for every phone from Admin, run **`google_ads.sql`**. It replaces `get_app_settings` to carry the ad payload, so run it again if you ever re-run `admin_premium_users.sql`.

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

## Account deletion requests

**Required:** run the full **`account_deletion.sql`** in Supabase → SQL Editor, after
`user_data.sql`, `user_categories.sql`, `admin_list_users.sql`, `profiles_guard.sql` and
`bill_images_bucket.sql`.

A project running `admin_list_users.sql` from before `count_admin_profiles` was added to it
used to fail here with *function public.count\_admin\_profiles() does not exist* — and only
when someone actually asked to be deleted, since that call sits inside a function body that
Postgres does not check until it runs. `account_deletion.sql` now supplies that function when
it is missing, so running the one file is enough. Re-running it never replaces an existing
one: `admin_list_users.sql` owns the real definition and its admin allowlist.

When someone taps App settings → Delete account, the app calls `request_account_deletion`,
which switches their account off (`profiles.disabled_at`) and adds them to
`account_deletion_requests`. It cannot delete the account: removing a row from `auth.users`
stays with an admin. The reason is also written, without a user id, to
`account_deletion_reasons`, so it survives the deletion it describes.

A disabled account cannot be used. The app signs itself out within a minute and refuses the
next sign-in, and the policies in this script stop a disabled session reading or writing
cloud rows even if some build fails to notice.

In the app: Admin → **Users** shows a count of waiting requests, each with:

- **Delete** — clears their `bill-images` folder, then `admin_delete_user`
- **Restore** — `admin_restore_account`, for a request made by mistake

Re-running `user_data.sql` or `user_categories.sql` recreates their policies without the
disabled check, so run `account_deletion.sql` again after either.

## Issues and feature requests

**Required:** run the full **`feedback.sql`** in Supabase → SQL Editor, after `schema.sql`,
`admin_list_users.sql` and `profiles_guard.sql`.

Report an issue and Request a feature used to build a `mailto:` link, so Submit only opened
the user's mail app and the message arrived only if they finished the job themselves. Now the
app calls `submit_feedback`, which stores the row, and an admin reads it in the app.

The user's reach is one function that can only append. `feedback_messages` has its grants
revoked from `anon` and `authenticated`, only an admin may select from it, and
`submit_feedback` fills in the account, the timestamp and the status itself — so nobody can
post as somebody else, mark their own report resolved, or read another person's words. Inside
it: signed-in callers only, at most 10 messages per account per day, 4,000 characters each,
and the same text twice within ten minutes counts once, which covers a double tap.

In the app: Admin → **Feedback** shows a count of unread messages on the tab, and opens on the
**Unread** filter — Issues, Features, Done and All are beside it, each carrying its own count
from `admin_feedback_counts`. Messages arrive fifty at a time, newest first, with **Load older**
asking `admin_list_feedback` for what comes before the oldest row on screen; the cursor is the
row id, so a page can neither repeat nor skip. Long messages show three lines until tapped.

Each row carries the topic, who sent it, the app version and platform, and:

- **Mark done** — `admin_set_feedback_status`, and **Mark unread** to put it back
- **Delete** — `admin_delete_feedback`, for the ones that are only noise

Nothing is emailed anywhere. The email or WhatsApp destination under the list is only where
you reply from, and where a future forwarding function would send to.

## Behaviour

| Tier | Storage |
|------|---------|
| Free | Local only. Backup/Restore via file share. |
| Premium | Local + Supabase DB + `bill-images` storage. Only data from `premium_since` (server time) is uploaded. |

Downgrade freezes cloud and sets `cloud_purge_at = now() + 3 months`.
