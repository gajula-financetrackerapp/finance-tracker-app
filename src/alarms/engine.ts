import type {
  AppConfig,
  ExpenseReminder,
  GeneralReminder,
  GroceryReminder,
  MedReminder,
} from '../types';
import { todayStr } from '../utils';

export type AlarmType = 'medicine' | 'expense' | 'grocery' | 'general';

export type AlarmInstance = {
  key: string;
  type: AlarmType;
  id: string;
  slot?: string;
  title: string;
  sub: string;
  time: number;
  ringDurationSec: number;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateAtTime(dateStr: string, hhmm: string) {
  return new Date(`${dateStr}T${hhmm || '09:00'}:00`).getTime();
}

function weekdayAbbrev(d = new Date()) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function fmtAmt(n: number) {
  return Math.abs(n).toLocaleString('en-IN');
}

export type AlarmInputs = {
  config: AppConfig;
  expenseReminders: ExpenseReminder[];
  medReminders: MedReminder[];
  groceryReminders: GroceryReminder[];
  generalReminders: GeneralReminder[];
  dismissedKeys: string[];
  snoozeUntil: Record<string, number>;
};

/** Mirrors HTML `buildDueAlarms()` — alarms that should ring right now. */
export function buildDueAlarms(input: AlarmInputs): AlarmInstance[] {
  const { config } = input;
  if (!config.alarmsEnabled) return [];

  const due: AlarmInstance[] = [];
  const now = Date.now();
  const today = todayStr();
  const dismissed = new Set(input.dismissedKeys);
  const snooze = input.snoozeUntil;

  const isSnoozed = (key: string) => !!(snooze[key] && Date.now() < snooze[key]);

  if (config.features.medicineReminder) {
    input.medReminders.forEach((m) => {
      const applies =
        m.frequency === 'weekly' ? (m.days || []).includes(weekdayAbbrev()) : true;
      if (!applies) return;
      const useCustom = m.mode === 'custom';
      const ringDurationSec =
        useCustom && typeof m.alarmDurationSec === 'number'
          ? m.alarmDurationSec
          : config.alarmDurationSec;
      (m.times || []).forEach((slot) => {
        const key = `med:${m.id}:${today}:${slot}`;
        const already = !!(m.done?.[today] || {})[slot];
        if (already || dismissed.has(key) || isSnoozed(key)) return;
        const timeStr =
          useCustom && m.customTimes?.[slot]
            ? m.customTimes[slot]
            : config.medicineTimes[slot as keyof typeof config.medicineTimes] || '08:00';
        const target = dateAtTime(today, timeStr);
        if (now >= target) {
          due.push({
            key,
            type: 'medicine',
            id: m.id,
            slot,
            title: `💊 Time to take: ${m.name}`,
            sub: `${slot} dose · tap Mark Done once taken`,
            time: target,
            ringDurationSec,
          });
        }
      });
    });
  }

  if (config.features.expenseReminder) {
    input.expenseReminders.forEach((r) => {
      if (r.paid) return;
      const useCustom = r.mode === 'custom';
      const offsets =
        useCustom && r.offsets?.length ? r.offsets : config.expenseOffsets;
      const alertTime = useCustom && r.customTime ? r.customTime : config.alertTime;
      const ringDurationSec =
        useCustom && typeof r.alarmDurationSec === 'number'
          ? r.alarmDurationSec
          : config.alarmDurationSec;
      const sorted = [...offsets].sort((a, b) => a - b);
      for (const off of sorted) {
        const triggerDate = addDays(r.dueDate, -off);
        const key = `exp:${r.id}:${r.dueDate}:${off}`;
        if (dismissed.has(key) || isSnoozed(key)) continue;
        const target = dateAtTime(triggerDate, alertTime);
        if (now >= target) {
          const label =
            off === 0 ? 'due today' : off === 1 ? 'due tomorrow' : `due in ${off} days`;
          due.push({
            key,
            type: 'expense',
            id: r.id,
            title: `💳 ${r.name} is ${label}`,
            sub: `${fmtAmt(r.amount)} · ${label}`,
            time: target,
            ringDurationSec,
          });
          break;
        }
      }
    });
  }

  if (config.features.groceryExpiryReminder) {
    input.groceryReminders.forEach((g) => {
      const useCustom = g.mode === 'custom';
      const offsets =
        useCustom && g.offsets?.length ? g.offsets : config.groceryOffsets;
      const alertTime =
        useCustom && g.customTime ? g.customTime : config.alertTime;
      const ringDurationSec =
        useCustom && typeof g.alarmDurationSec === 'number'
          ? g.alarmDurationSec
          : config.alarmDurationSec;
      const sorted = [...offsets].sort((a, b) => a - b);
      for (const off of sorted) {
        const triggerDate = addDays(g.expiryDate, -off);
        const key = `groc:${g.id}:${g.expiryDate}:${off}`;
        if (dismissed.has(key) || isSnoozed(key)) continue;
        const target = dateAtTime(triggerDate, alertTime);
        if (now >= target) {
          const label =
            off === 0
              ? 'expires today'
              : off === 1
                ? 'expires tomorrow'
                : `expires in ${off} days`;
          due.push({
            key,
            type: 'grocery',
            id: g.id,
            title: `🥦 ${g.item} ${label}`,
            sub: g.category || 'Grocery',
            time: target,
            ringDurationSec,
          });
          break;
        }
      }
    });
  }

  if (config.features.generalReminder) {
    input.generalReminders.forEach((r) => {
      const ringDurationSec =
        typeof r.alarmDurationSec === 'number' ? r.alarmDurationSec : config.alarmDurationSec;
      if (r.repeat === 'once') {
        if (r.done) return;
        const key = `gen:${r.id}:${r.date}:once`;
        if (dismissed.has(key) || isSnoozed(key)) return;
        const target = dateAtTime(r.date, r.time);
        if (now >= target) {
          due.push({
            key,
            type: 'general',
            id: r.id,
            title: `⏰ ${r.title}`,
            sub: 'Tap Mark Done once handled',
            time: target,
            ringDurationSec,
          });
        }
      } else {
        const applies =
          r.repeat === 'weekly' ? (r.days || []).includes(weekdayAbbrev()) : true;
        if (!applies) return;
        if (r.doneDate === today) return;
        const key = `gen:${r.id}:${today}:rep`;
        if (dismissed.has(key) || isSnoozed(key)) return;
        const target = dateAtTime(today, r.time);
        if (now >= target) {
          due.push({
            key,
            type: 'general',
            id: r.id,
            title: `⏰ ${r.title}`,
            sub: 'Tap Mark Done once handled',
            time: target,
            ringDurationSec,
          });
        }
      }
    });
  }

  due.sort((a, b) => a.time - b.time);
  return due;
}

export function daysUntil(dateStr: string) {
  const today = todayStr();
  const a = new Date(`${today}T00:00:00`).getTime();
  const b = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}
