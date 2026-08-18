#!/usr/bin/env node
/**
 * Superseded — use `npm run i18n:fill` instead.
 *
 * This retranslates every key rather than only the missing ones, so running it
 * discards existing translations, and it needs google-translate-api-x, which is
 * not a declared dependency. The languages it covered are now in
 * scripts/fill_locale_translations.py.
 *
 * One-shot generator: translate en.json → locale files for new languages.
 * Usage: node scripts/generate-europe-locales.js
 */
const fs = require('fs');
const path = require('path');
const { translate } = require('google-translate-api-x');

const ROOT = path.join(__dirname, '..');
const LOCALE_DIR = path.join(ROOT, 'src/i18n/locales');
const en = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'en.json'), 'utf8'));

/** App code → Google Translate target */
const TARGETS = {
  ar: 'ar',
  zh: 'zh-CN',
  ru: 'ru',
  es: 'es',
  de: 'de',
  fr: 'fr',
  it: 'it',
  pt: 'pt',
  nl: 'nl',
  pl: 'pl',
  sv: 'sv',
  ro: 'ro',
  el: 'el',
  cs: 'cs',
  hu: 'hu',
  fi: 'fi',
  da: 'da',
  nb: 'no',
  uk: 'uk',
  bg: 'bg',
  hr: 'hr',
  sk: 'sk',
  sl: 'sl',
  lt: 'lt',
  lv: 'lv',
  et: 'et',
  ga: 'ga',
  mt: 'mt',
  ja: 'ja',
  ko: 'ko',
  sw: 'sw',
  am: 'am',
  ha: 'ha',
  yo: 'yo',
  zu: 'zu',
  af: 'af',
  ig: 'ig',
  sn: 'sn',
  so: 'so',
  xh: 'xh',
};

const PLACEHOLDER_RE = /\{[a-zA-Z0-9_]+\}/g;

function protect(text) {
  const tokens = [];
  const masked = text.replace(PLACEHOLDER_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `⟨${i}⟩`;
  });
  return { masked, tokens };
}

function restore(text, tokens) {
  return text.replace(/⟨\s*(\d+)\s*⟩/g, (_, n) => tokens[Number(n)] ?? _).replace(/<\s*(\d+)\s*>/g, (_, n) => tokens[Number(n)] ?? _);
}

async function translateBatch(texts, to) {
  const out = [];
  const chunkSize = 25;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    let attempt = 0;
    for (;;) {
      try {
        const res = await translate(chunk, {
          from: 'en',
          to,
          forceBatch: true,
          rejectOnPartialFail: false,
        });
        const arr = Array.isArray(res) ? res : [res];
        for (let j = 0; j < chunk.length; j++) {
          const row = arr[j];
          out.push((row && row.text) || chunk[j]);
        }
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= 5) throw err;
        const wait = 1500 * attempt;
        console.warn(`  retry ${attempt} after ${wait}ms:`, err.message || err);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
}

async function buildLocale(code, gtCode, force) {
  const outPath = path.join(LOCALE_DIR, `${code}.json`);
  if (!force && fs.existsSync(outPath)) {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const keys = Object.keys(en);
    const identical = keys.filter((k) => existing[k] === en[k]).length;
    // Skip only when mostly translated (not an English stub)
    if (identical < keys.length * 0.5) {
      console.log(`skip ${code} (looks translated)`);
      return;
    }
    console.log(`replace stub ${code} (${identical}/${keys.length} still English)`);
  } else {
    console.log(`create ${code} → ${gtCode}`);
  }

  const keys = Object.keys(en);
  const protectedList = keys.map((k) => protect(en[k]));
  const masked = protectedList.map((p) => p.masked);
  const translated = await translateBatch(masked, gtCode);

  const next = {};
  for (let i = 0; i < keys.length; i++) {
    next[keys[i]] = restore(translated[i] || en[keys[i]], protectedList[i].tokens);
  }
  fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`  wrote ${code}.json (${keys.length} keys)`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => a !== '--force');
  const codes = only.length ? only : Object.keys(TARGETS);
  for (const code of codes) {
    const gt = TARGETS[code];
    if (!gt) {
      console.warn('unknown', code);
      continue;
    }
    await buildLocale(code, gt, force);
  }
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
