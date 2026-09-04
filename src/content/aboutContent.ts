import { tr, type TranslationKey } from '../i18n/translations';

export type AboutBlock = { heading: string; body: string };

const BLOCK_KEYS: { heading: TranslationKey; body: TranslationKey }[] = [
  { heading: 'about.buildTitle', body: 'about.buildBody' },
  { heading: 'about.approachTitle', body: 'about.approachBody' },
  { heading: 'about.notBankTitle', body: 'about.notBankBody' },
  { heading: 'about.versionTitle', body: 'about.versionBody' },
];

export function aboutBlocks(appName: string, version: string): AboutBlock[] {
  const name = appName.trim() || 'MoneyLit';
  return BLOCK_KEYS.map(({ heading, body }) => ({
    heading: tr(heading),
    body: tr(body).replace(/\{name\}/g, name).replace(/\{version\}/g, version),
  }));
}
