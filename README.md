# Kashio

Android personal finance app (Expo / React Native): incomes and expenses, accounts, budgets, reminders, a buy list, and SMS import on a real Android build.

Package: `com.financetracker.app` · version `1.3.2` (versionCode 132).

## Run

```bash
cd ~/Projects/finance-tracker
npm install
npx expo start -c
```

Expo Go is fine for UI. SMS import, alarms while the app is closed, and Google return-to-app need a **development or production APK**, not Expo Go.

```bash
npx expo run:android
```

Remote QR (same Expo Go limits):

```bash
npx expo start --tunnel
```

## Store builds (EAS)

```bash
npm run eas:login
npm run build:android:preview      # installable APK
npm run build:android:production   # Play Store .aab
```

AdMob app IDs and other secrets come from environment variables in `app.config.js` (local `.env` or EAS). Without a production AdMob app ID, Google sample test units are used.

## Notes

- Data lives on the device. Premium cloud sync, when enabled, copies dated finance records to the backend.
- Android SMS import uses **READ_SMS** only (the inbox is listed; the app does not receive SMS in the background).
