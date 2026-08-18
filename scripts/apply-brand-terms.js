#!/usr/bin/env node
/**
 * Put the paid tier names back where a translator turned them into words.
 *
 * Reads the policy in i18n-brand-terms.json and applies it to every locale. Safe
 * to run again after any fill: it works from the English source and the policy
 * file, never from whatever a previous run happened to leave behind.
 *
 * Usage: node scripts/apply-brand-terms.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALE_DIR = path.join(ROOT, 'src', 'i18n', 'locales');
const POLICY = path.join(__dirname, 'i18n-brand-terms.json');
const dry = process.argv.includes('--dry');

const en = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, 'en.json'), 'utf8'));
const policy = JSON.parse(fs.readFileSync(POLICY, 'utf8'));

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Write via a temporary file and rename, so a reader never sees half a file. */
function write(file, data) {
  const ordered = {};
  for (const k of Object.keys(en)) if (k in data) ordered[k] = data[k];
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Whether this language is written in the Latin alphabet.
 *
 * Decided from a broad sample rather than one key, so a single English leftover
 * cannot flip the answer.
 */
function usesLatin(data) {
  const vals = Object.values(data)
    .filter((v) => typeof v === 'string' && /\p{L}/u.test(v))
    .slice(0, 200);
  if (!vals.length) return true;
  const latin = vals.filter((v) => !/[^\p{Script=Latin}\P{L}]/u.test(v)).length;
  return latin / vals.length > 0.7;
}

/**
 * Replace a whole word, whatever the case, without eating a longer word.
 *
 * Called with from === to on purpose, to capitalise the brand a translator drops
 * into the middle of a sentence as "Extras premium".
 */
function swapWord(text, from, to) {
  if (!from) return text;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<!\\p{L})${esc}(?!\\p{L})`, 'giu'), to);
}

const report = { latin: 0, other: 0, changed: 0, files: 0, leftovers: [] };

for (const file of fs.readdirSync(LOCALE_DIR)) {
  if (!file.endsWith('.json')) continue;
  const code = file.replace(/\.json$/, '');
  if (code === 'en' || code === 'en.translated') continue;

  const full = path.join(LOCALE_DIR, file);
  const data = read(full);
  const before = JSON.stringify(data);
  const latin = usesLatin(data);
  latin ? report.latin++ : report.other++;

  if (latin) {
    // What this language turned the brand into, captured before it is replaced.
    const wasPremium = data['premium.title'];
    const wasPlus = data['premium.colPlus'];

    for (const [key, value] of Object.entries(policy.englishWhenLatinScript)) {
      if (key in data) data[key] = value;
    }

    for (const [brand, keys] of Object.entries(policy.brandKeys)) {
      const was = brand === 'Premium' ? wasPremium : wasPlus;
      for (const key of keys) {
        if (typeof data[key] !== 'string') continue;
        // Swap the mistranslation, then the brand itself, which also fixes the
        // lower case "premium" a translator leaves mid sentence.
        data[key] = swapWord(swapWord(data[key], was, brand), brand, brand);
      }
    }
  }

  for (const [key, value] of Object.entries(policy.byLanguage[code] || {})) {
    if (key in en) data[key] = value;
  }

  // Anything still carrying the wrong name needs a human, so say which.
  if (latin) {
    for (const [brand, keys] of Object.entries(policy.brandKeys)) {
      for (const key of keys) {
        const v = data[key];
        if (typeof v === 'string' && !new RegExp(brand, 'i').test(v)) {
          report.leftovers.push(`${code}  ${key} = ${JSON.stringify(v)}`);
        }
      }
    }
  }

  report.files++;
  if (JSON.stringify(data) !== before) {
    report.changed++;
    if (!dry) write(full, data);
  }
}

console.log(
  `${report.files} locales read (${report.latin} Latin, ${report.other} other script)`
);
console.log(`${report.changed} updated${dry ? ' (dry run, nothing written)' : ''}`);
if (report.leftovers.length) {
  console.log('\nstill missing the brand name, add to byLanguage in the policy:');
  for (const line of report.leftovers) console.log('  ' + line);
}
