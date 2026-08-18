#!/usr/bin/env node
/**
 * Guard against the silent English fallback.
 *
 * A key missing from a locale is not an error at runtime — the lookup quietly
 * serves English instead — so a language can drift a long way behind without
 * anyone noticing. This fails instead, and names what to top up with
 * `npm run i18n:fill`.
 *
 * Plain JS on purpose: it reads JSON only, so it needs no TypeScript loader.
 */
const fs = require('fs');
const path = require('path');

const LOCALE_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const en = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'en.json'), 'utf8'));
const keys = Object.keys(en);

// en.translated.json records what was last translated; it is not a language.
const SKIP = new Set(['en.json', 'en.translated.json']);
const codes = fs
  .readdirSync(LOCALE_DIR)
  .filter((f) => f.endsWith('.json') && !SKIP.has(f))
  .map((f) => f.replace('.json', ''))
  .sort();

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;

let fail = 0;
const short = [];

console.log(`en.json defines ${keys.length} keys across ${codes.length} other languages\n`);

for (const code of codes) {
  const dict = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, `${code}.json`), 'utf8'));
  const missing = keys.filter((k) => !dict[k] || !String(dict[k]).trim());
  if (missing.length) short.push({ code, missing, pct: ((keys.length - missing.length) / keys.length) * 100 });

  // A placeholder the translator dropped leaves a gap in the sentence; one it
  // invented renders as literal braces.
  const bad = keys.filter((k) => {
    const target = String(dict[k] || '');
    if (!target) return false;
    const want = (String(en[k] || '').match(PLACEHOLDER) || []).sort().join(',');
    const got = (target.match(PLACEHOLDER) || []).sort().join(',');
    return want !== got;
  });
  if (bad.length) {
    fail++;
    console.log(`FAIL  ${code}: ${bad.length} placeholder mismatch(es), e.g. ${bad.slice(0, 3).join(', ')}`);
  }
}

if (short.length) {
  fail++;
  console.log(`FAIL  ${short.length} of ${codes.length} language(s) incomplete:`);
  for (const s of short) {
    console.log(
      `        ${s.code}: ${s.missing.length} missing (${s.pct.toFixed(1)}%), e.g. ${s.missing.slice(0, 3).join(', ')}`,
    );
  }
} else {
  console.log(`ok    all ${codes.length} languages complete`);
}

console.log(fail ? `\n${fail} check(s) failed — run: npm run i18n:fill` : '\nall locales complete');
process.exit(fail ? 1 : 0);
