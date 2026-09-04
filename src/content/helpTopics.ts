import { tr, type TranslationKey } from '../i18n/translations';

export type HelpTopic = { title: string; body: string };

/**
 * In-app Help topics. Unlike Terms and Privacy, the guide is translated — the
 * notice on the screen only claims English for the legal sections.
 */
const TOPIC_KEYS: { title: TranslationKey; body: TranslationKey }[] = [
  { title: 'help.startTitle', body: 'help.startBody' },
  { title: 'help.balanceTitle', body: 'help.balanceBody' },
  { title: 'help.accountsTitle', body: 'help.accountsBody' },
  { title: 'help.monthlyTitle', body: 'help.monthlyBody' },
  { title: 'help.buyListTitle', body: 'help.buyListBody' },
  { title: 'help.remindersTitle', body: 'help.remindersBody' },
  { title: 'help.premiumTitle', body: 'help.premiumBody' },
  { title: 'help.cloudTitle', body: 'help.cloudBody' },
  { title: 'help.backupTitle', body: 'help.backupBody' },
  { title: 'help.moreTitle', body: 'help.moreBody' },
];

export function helpTopics(appName: string): HelpTopic[] {
  const name = appName.trim() || 'MoneyLit';
  return TOPIC_KEYS.map(({ title, body }) => ({
    title: tr(title),
    body: tr(body).replace(/\{name\}/g, name),
  }));
}
