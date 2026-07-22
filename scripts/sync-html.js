#!/usr/bin/env node
/**
 * Sync assets/dashboard.html → src/dashboardHtml.ts
 * Usage: node scripts/sync-html.js [path-to-html]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcHtml =
  process.argv[2] ||
  path.join(root, 'assets', 'dashboard.html');
const outTs = path.join(root, 'src', 'dashboardHtml.ts');

if (!fs.existsSync(srcHtml)) {
  console.error('HTML not found:', srcHtml);
  process.exit(1);
}

const html = fs.readFileSync(srcHtml, 'utf8');
const out = `/* Auto-generated from ${path.relative(root, srcHtml)} — run: npm run sync:html */\nexport const DASHBOARD_HTML = ${JSON.stringify(html)};\n`;
fs.writeFileSync(outTs, out);
console.log('Synced', srcHtml, '→', outTs, `(${html.length} chars)`);
