import type { ExpenseRepeat, ExpenseReminder } from '../types';

export type RecurringExpenseTemplate = {
  name: string;
  icon: string;
  amount: number;
  dayOfMonth: number;
  /** Placeholder for optional detail text. */
  detailHint?: string;
  detailLabel?: string;
  /** Show family-member multi-select (phone bills, etc.). */
  showPeople?: boolean;
  /** Default schedule for this template. */
  defaultRepeat?: ExpenseRepeat;
};

/** Templates for common monthly bills / subscriptions. */
export const RECURRING_EXPENSE_TEMPLATES: RecurringExpenseTemplate[] = [
  { name: 'Electricity bill', icon: '⚡', amount: 1500, dayOfMonth: 10, defaultRepeat: 'monthly' },
  { name: 'Internet bill', icon: '🌐', amount: 799, dayOfMonth: 5, defaultRepeat: 'monthly' },
  {
    name: 'OTT subscription',
    icon: '📺',
    amount: 649,
    dayOfMonth: 1,
    detailLabel: 'Which app / plan? (optional)',
    detailHint: 'e.g. Netflix, Hotstar, Prime Video, Disney+',
    defaultRepeat: 'monthly',
  },
  {
    name: 'Phone bill',
    icon: '📞',
    amount: 599,
    dayOfMonth: 8,
    showPeople: true,
    detailLabel: 'Carrier / plan (optional)',
    detailHint: 'e.g. Airtel, Jio, Vi postpaid',
    defaultRepeat: 'monthly',
  },
  {
    name: 'Mobile recharge',
    icon: '📱',
    amount: 299,
    dayOfMonth: 15,
    detailHint: 'e.g. prepaid pack',
    detailLabel: 'Note (optional)',
    defaultRepeat: 'monthly',
  },
  { name: 'Rent', icon: '🏠', amount: 15000, dayOfMonth: 1, defaultRepeat: 'monthly' },
  { name: 'Water bill', icon: '💧', amount: 400, dayOfMonth: 12, defaultRepeat: 'monthly' },
  { name: 'Gas cylinder', icon: '🔥', amount: 1100, dayOfMonth: 20, defaultRepeat: 'monthly' },
  { name: 'Gym membership', icon: '🏋', amount: 999, dayOfMonth: 1, defaultRepeat: 'monthly' },
];

export const EXPENSE_REPEAT_OPTIONS: { id: ExpenseRepeat; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'half_yearly', label: 'Half-yearly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'once', label: 'One-time' },
];

/** Suggested people for phone / shared bills — user can add more. */
export const DEFAULT_FAMILY_MEMBER_OPTIONS = [
  'Self',
  'Spouse',
  'Kid 1',
  'Kid 2',
  'Father',
  'Mother',
  'Sibling',
];

export function templateShowsPeople(name: string) {
  const n = (name || '').toLowerCase();
  return /\bphone bill\b|\bmobile bill\b/.test(n);
}

export function templateForName(name: string): RecurringExpenseTemplate | undefined {
  return RECURRING_EXPENSE_TEMPLATES.find((t) => t.name === name);
}

export function getExpenseRepeat(r: Pick<ExpenseReminder, 'repeat' | 'recurring'>): ExpenseRepeat {
  if (r.repeat) return r.repeat;
  if (r.recurring) return 'monthly';
  return 'once';
}

export function isRepeatingExpense(r: Pick<ExpenseReminder, 'repeat' | 'recurring'>) {
  return getExpenseRepeat(r) !== 'once';
}

export function expenseRepeatLabel(repeat: ExpenseRepeat) {
  switch (repeat) {
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly (every 3 months)';
    case 'half_yearly':
      return 'Half-yearly (every 6 months)';
    case 'yearly':
      return 'Yearly';
    default:
      return 'One-time';
  }
}

export function expenseRepeatShortLabel(repeat: ExpenseRepeat) {
  switch (repeat) {
    case 'monthly':
      return 'Every month';
    case 'quarterly':
      return 'Every 3 months';
    case 'half_yearly':
      return 'Every 6 months';
    case 'yearly':
      return 'Every year';
    default:
      return 'One-time';
  }
}

function monthsForRepeat(repeat: ExpenseRepeat): number {
  switch (repeat) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'half_yearly':
      return 6;
    case 'yearly':
      return 12;
    default:
      return 0;
  }
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(year: number, monthIndex: number, dayOfMonth: number) {
  const dim = daysInMonth(year, monthIndex);
  return Math.min(Math.max(1, dayOfMonth), dim);
}

function toIso(year: number, monthIndex: number, day: number) {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Next due date on (or clamped to) `dayOfMonth` — today or later. */
export function nextDueDateForDayOfMonth(dayOfMonth: number, from = new Date()): string {
  const dom = Math.min(31, Math.max(1, Math.round(dayOfMonth) || 1));
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  let y = start.getFullYear();
  let m = start.getMonth();
  let day = clampDay(y, m, dom);
  let candidate = new Date(y, m, day);
  if (candidate < start) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    day = clampDay(y, m, dom);
    candidate = new Date(y, m, day);
  }
  return toIso(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
}

/** @deprecated Prefer advanceDueDateByRepeat */
export function advanceMonthlyDueDate(dueDate: string, dayOfMonth?: number): string {
  return advanceDueDateByRepeat(dueDate, 'monthly', dayOfMonth);
}

/** Roll due date forward by the subscription period. */
export function advanceDueDateByRepeat(
  dueDate: string,
  repeat: ExpenseRepeat,
  dayOfMonth?: number,
): string {
  const months = monthsForRepeat(repeat);
  if (months <= 0) return dueDate;

  const [y0, m0, d0] = dueDate.split('-').map(Number);
  const preferred = dayOfMonth || d0 || 1;
  let y = y0;
  let m = m0; // 1-based from ISO
  m += months;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const monthIndex = m - 1;
  const day = clampDay(y, monthIndex, preferred);
  return toIso(y, monthIndex, day);
}

export function ordinalDay(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatExpenseReminderLabel(r: {
  name: string;
  detail?: string;
  forPeople?: string[];
}) {
  const parts = [r.name];
  if (r.detail?.trim()) parts.push(r.detail.trim());
  if (r.forPeople?.length) parts.push(`for ${r.forPeople.join(', ')}`);
  return parts.join(' · ');
}
