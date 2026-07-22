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

Open **Supabase → SQL Editor**, paste and run `supabase/schema.sql`.

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

## 5) Start app

```bash
cd ~/Projects/finance-tracker
npx expo start -c
```

You will see **Login / Sign up** first. After login, the exact HTML dashboard opens.
