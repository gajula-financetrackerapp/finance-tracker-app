# Finance Tracker (React Native / Android)

Android app that shows your **exact HTML GUI** inside a React Native WebView.

## Location

`/Users/ramkumarg/Projects/finance-tracker`

## GUI source

- Latest HTML is copied to `assets/dashboard.html`
- Bundled into the app as `src/dashboardHtml.ts`
- Original file used: `finance tracker improved_latest.html`

When you update the HTML later:

```bash
npm run sync:html -- "/Users/ramkumarg/Downloads/finance tracker improved_latest.html"
# or after copying into assets/dashboard.html:
npm run sync:html
```

Then restart Expo (`npx expo start -c`).

## Run

```bash
cd ~/Projects/finance-tracker
npm install
npx expo start -c
```

Remote test (other country / network):

```bash
npx expo start --tunnel
```

Uses **Expo SDK 54** (Expo Go compatible).

## Notes

- UI/behavior matches the HTML file (finance, reminders, shopping, admin, themes).
- Data still uses browser `localStorage` inside the WebView (per device / Expo Go).
- Voice / some browser-only APIs may be limited inside Android WebView.
