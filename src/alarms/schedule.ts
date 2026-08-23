import type { AlarmInputs, AlarmType } from './engine';
import { translate } from '../i18n/translations';
import { medSlotLabel, personDisplayName, templateDisplayName } from '../i18n/reminderLabels';
import { isReminderTypeEnabled } from '../lib/appFeatures';

/**
 * A reminder handed to the phone ahead of time, so it still arrives when Kashio
 * is closed.
 *
 * The in-app engine in ./engine.ts answers "what should be ringing right now".
 * This answers the opposite question — "what is coming, and when" — because a
 * notification has to be booked with the system before the moment arrives.
 * The two read the same reminders and the same settings, and the keys match, so
 * an alarm the user has already dealt with in the app is not booked here.
 */
export type PlannedAlarm = {
  key: string;
  type: AlarmType;
  /** The reminder this came from, carried so a tap can open the right screen. */
  id: string;
  title: string;
  body: string;
  /** When it should arrive, as epoch milliseconds. */
  at: number;
};

/** How far ahead reminders are booked with the system. */
export const SCHEDULE_HORIZON_DAYS = 14;

/**
 * Android will not hold an unlimited queue of pending alarms, and a phone that
 * has not been opened in a fortnight does not need every last one. The nearest
 * ones matter; the rest are re-booked on the next launch.
 */
export const SCHEDULE_LIMIT = 120;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function dayStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dayStr(d);
}

function dateAtTime(dateStr: string, hhmm: string) {
  return new Date(`${dateStr}T${hhmm || '09:00'}:00`).getTime();
}

function weekdayAbbrev(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function fmtAmt(n: number, currencyCode: string) {
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  return Math.abs(n).toLocaleString(locale);
}

export type ScheduleOptions = {
  /** Overridable for tests. Defaults to now. */
  now?: number;
  horizonDays?: number;
  limit?: number;
};

/**
 * Every reminder that falls due between now and the horizon, in the order it
 * will arrive. Anything already in the past is left to the in-app engine: the
 * phone cannot be told about a moment that has gone.
 */
export function buildScheduledAlarms(
  input: AlarmInputs,
  opts: ScheduleOptions = {},
): PlannedAlarm[] {
  const { config } = input;
  if (!config.alarmsEnabled) return [];

  const now = opts.now ?? Date.now();
  const today = dayStr(new Date(now));
  const horizonDays = opts.horizonDays ?? SCHEDULE_HORIZON_DAYS;

  /** Whole days, so a fortnight ahead means every alarm on that last day too. */
  const days: string[] = [];
  for (let i = 0; i <= horizonDays; i += 1) days.push(addDays(today, i));
  const horizon = new Date(`${days[days.length - 1]}T23:59:59.999`).getTime();

  const lang = config.language;
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const dismissed = new Set(input.dismissedKeys);
  const snooze = input.snoozeUntil;
  const planned: PlannedAlarm[] = [];

  /** A future alarm the user has already dismissed or snoozed past is not news. */
  const skip = (key: string, at: number) =>
    at <= now || at > horizon || dismissed.has(key) || (snooze[key] || 0) > at;

  const add = (alarm: PlannedAlarm) => {
    if (skip(alarm.key, alarm.at)) return;
    planned.push(alarm);
  };

  if (isReminderTypeEnabled(config.features, 'medicine')) {
    input.medReminders.forEach((m) => {
      const useCustom = m.mode === 'custom';
      days.forEach((day) => {
        const applies =
          m.frequency === 'weekly' ? (m.days || []).includes(weekdayAbbrev(day)) : true;
        if (!applies) return;
        (m.times || []).forEach((slot) => {
          if ((m.done?.[day] || {})[slot]) return;
          const timeStr =
            useCustom && m.customTimes?.[slot]
              ? m.customTimes[slot]
              : config.medicineTimes[slot as keyof typeof config.medicineTimes] || '08:00';
          add({
            key: `med:${m.id}:${day}:${slot}`,
            type: 'medicine',
            id: m.id,
            title: t('reminders.alarmMedTitle').replace('{name}', m.name),
            body: t('reminders.alarmMedSub').replace('{slot}', medSlotLabel(lang, slot)),
            at: dateAtTime(day, timeStr),
          });
        });
      });
    });
  }

  if (isReminderTypeEnabled(config.features, 'expense')) {
    input.expenseReminders.forEach((r) => {
      if (r.paid) return;
      if (r.source === 'card-bill' && !(r.amount > 0.009)) return;
      const useCustom = r.mode === 'custom';
      const offsets = useCustom && r.offsets?.length ? r.offsets : config.expenseOffsets;
      const alertTime = useCustom && r.customTime ? r.customTime : config.alertTime;
      offsets.forEach((off) => {
        const label =
          off === 0
            ? t('reminders.dueToday')
            : off === 1
              ? t('reminders.dueTomorrow')
              : t('reminders.dueInNd').replace('{n}', String(off));
        add({
          key: `exp:${r.id}:${r.dueDate}:${off}`,
          type: 'expense',
          id: r.id,
          title: t('reminders.alarmExpTitle')
            .replace('{name}', templateDisplayName(lang, r.name))
            .replace('{label}', label),
          body: [
            fmtAmt(r.amount, config.currency),
            r.detail,
            r.forPeople?.length
              ? t('reminders.forPeople').replace(
                  '{list}',
                  r.forPeople.map((p) => personDisplayName(lang, p)).join(', '),
                )
              : '',
            label,
          ]
            .filter(Boolean)
            .join(' · '),
          at: dateAtTime(addDays(r.dueDate, -off), alertTime),
        });
      });
    });
  }

  if (isReminderTypeEnabled(config.features, 'grocery')) {
    input.groceryReminders.forEach((g) => {
      const useCustom = g.mode === 'custom';
      const offsets = useCustom && g.offsets?.length ? g.offsets : config.groceryOffsets;
      const alertTime = useCustom && g.customTime ? g.customTime : config.alertTime;
      offsets.forEach((off) => {
        const label =
          off === 0
            ? t('reminders.expiresToday')
            : off === 1
              ? t('reminders.expiresTomorrow')
              : t('reminders.expiresInNd').replace('{n}', String(off));
        add({
          key: `groc:${g.id}:${g.expiryDate}:${off}`,
          type: 'grocery',
          id: g.id,
          title: t('reminders.alarmGrocTitle')
            .replace('{item}', g.item)
            .replace('{label}', label),
          body: g.category || t('reminders.grocery'),
          at: dateAtTime(addDays(g.expiryDate, -off), alertTime),
        });
      });
    });
  }

  if (isReminderTypeEnabled(config.features, 'general')) {
    input.generalReminders.forEach((r) => {
      if (r.repeat === 'once') {
        if (r.done) return;
        add({
          key: `gen:${r.id}:${r.date}:once`,
          type: 'general',
          id: r.id,
          title: `⏰ ${r.title}`,
          body: t('reminders.alarmGenSub'),
          at: dateAtTime(r.date, r.time),
        });
        return;
      }
      days.forEach((day) => {
        const applies = r.repeat === 'weekly' ? (r.days || []).includes(weekdayAbbrev(day)) : true;
        if (!applies) return;
        if (r.doneDate === day) return;
        add({
          key: `gen:${r.id}:${day}:rep`,
          type: 'general',
          id: r.id,
          title: `⏰ ${r.title}`,
          body: t('reminders.alarmGenSub'),
          at: dateAtTime(day, r.time),
        });
      });
    });
  }

  planned.sort((a, b) => a.at - b.at);
  return planned.slice(0, opts.limit ?? SCHEDULE_LIMIT);
}

/**
 * A cheap stand-in for the whole plan, so a rebuild that changes nothing does
 * not tear down and re-book the same alarms on every render.
 */
export function schedulePrint(planned: PlannedAlarm[], channelId: string) {
  return `${channelId}|${planned.map((p) => `${p.key}@${p.at}`).join(',')}`;
}
