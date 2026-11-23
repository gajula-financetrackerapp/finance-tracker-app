# MoneyLit website

Static marketing and legal website for `moneylit.gaincreations.com`.

## Local preview

This repository requires the workstation Node environment:

```sh
source ~/android-toolchain/env.sh
cd website
npm run build
npm run serve
```

Open `http://localhost:4173`.

## Cloudflare Pages

Create a Pages project from this GitHub repository with:

- Production branch: the repository's default branch
- Root directory: `website`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 22

No environment variables are required.

After the first deployment, add `moneylit.gaincreations.com` under the Pages
project's **Custom domains** settings. Cloudflare will show the DNS target to
use at GoDaddy.

## GoDaddy DNS

In the `gaincreations.com` DNS manager, create the record Cloudflare requests.
For a subdomain this is normally:

- Type: `CNAME`
- Name: `moneylit`
- Value: the project's Cloudflare Pages hostname, such as
  `moneylit.pages.dev`
- TTL: default

Do not change or delete unrelated DNS records. Confirm the exact target in
Cloudflare before saving.
