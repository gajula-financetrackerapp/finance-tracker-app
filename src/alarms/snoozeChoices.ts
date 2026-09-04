import type { TranslationKey } from '../i18n/translations';

export type SnoozeChoice = { minutes: number; labelKey: TranslationKey };

/**
 * How long a snooze can last.
 *
 * Reminders can arrive a day before they are due, and ten minutes was the only
 * answer to that: the alarm came back six times an hour until the due date.
 * The longer choices let someone put a reminder aside for the evening or for
 * the next morning without marking it done.
 */
export const SNOOZE_CHOICES: SnoozeChoice[] = [
  { minutes: 10, labelKey: 'reminders.snooze10m' },
  { minutes: 30, labelKey: 'reminders.snooze30m' },
  { minutes: 60, labelKey: 'reminders.snooze1h' },
  { minutes: 6 * 60, labelKey: 'reminders.snooze6h' },
  { minutes: 12 * 60, labelKey: 'reminders.snooze12h' },
];

/** What a snooze lasts when nobody picked, and what the ring timeout uses. */
export const DEFAULT_SNOOZE_MINUTES = SNOOZE_CHOICES[0].minutes;
