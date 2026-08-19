# Auth setup (Supabase + Login/Signup + Admin)

## 1) Create `.env`

```bash
cp .env.example .env
```

Paste your values:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
EXPO_PUBLIC_ADMIN_EMAIL=your@email.com
```

## 2) Run SQL in Supabase

Open **Supabase → SQL Editor**, paste and run:

1. `supabase/schema.sql` (profiles + auth trigger)
2. `supabase/user_data.sql` (finance + reminders cloud sync)
3. `supabase/user_categories.sql` (custom expense/income categories)
4. `supabase/profiles_guard.sql` (last — locks role / Premium / diamonds against
   client writes; run it after the premium, admin and diamond files)

Without the cloud SQL files, login works but data stays device-only. Without
`profiles_guard.sql` any signed-in user can make themselves an admin, so it is
required before a public release.

## 3) Enable providers

In Supabase **Authentication → Providers**:
- Email: ON
- GitHub: ON (add Client ID / Secret from GitHub OAuth App)

GitHub OAuth app settings:
- Homepage: your site or `https://expo.dev`
- Authorization callback URL: `https://xxxx.supabase.co/auth/v1/callback`

Also add redirect URL in Supabase Auth URL config:
- `financetracker://`

## 4) Create admin

1. Sign up in the app
2. In SQL Editor run:

```sql
update public.profiles set role = 'admin' where email = 'your@email.com';
```

3. Logout / login again → **⚙ Admin** appears

SQL Editor is the only way to grant admin: the app never writes `role`, and
`profiles_guard.sql` rejects it if the client tries. This is also how you add or
remove an admin after release, with no app update needed.

## 5) Start app

```bash
cd ~/Projects/finance-tracker
npx expo start -c
```

You will see **Login / Sign up** first. After login, the exact HTML dashboard opens.
