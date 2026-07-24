import type { ExpenseRepeat } from '../types';
import type { TranslationKey } from './translations';
import { translate } from './translations';

const TEMPLATE_KEYS: Record<string, TranslationKey> = {
  'Electricity bill': 'tmpl.electricity',
  'Internet bill': 'tmpl.internet',
  'OTT subscription': 'tmpl.ott',
  'Phone bill': 'tmpl.phone',
  'Mobile recharge': 'tmpl.recharge',
  Rent: 'tmpl.rent',
  'Water bill': 'tmpl.water',
  'Gas cylinder': 'tmpl.gas',
  'Gym membership': 'tmpl.gym',
};

const PERSON_KEYS: Record<string, TranslationKey> = {
  Self: 'reminders.personSelf',
  Spouse: 'reminders.personSpouse',
  'Kid 1': 'reminders.personKid1',
  'Kid 2': 'reminders.personKid2',
  Father: 'reminders.personFather',
  Mother: 'reminders.personMother',
  Sibling: 'reminders.personSibling',
};

const DAY_KEYS: Record<string, TranslationKey> = {
  Mon: 'reminders.dayMon',
  Tue: 'reminders.dayTue',
  Wed: 'reminders.dayWed',
  Thu: 'reminders.dayThu',
  Fri: 'reminders.dayFri',
  Sat: 'reminders.daySat',
  Sun: 'reminders.daySun',
};

const SLOT_KEYS: Record<string, TranslationKey> = {
  Morning: 'reminders.slotMorning',
  Afternoon: 'reminders.slotAfternoon',
  Evening: 'reminders.slotEvening',
};

const REPEAT_KEYS: Record<ExpenseRepeat, TranslationKey> = {
  monthly: 'reminders.repeatMonthly',
  quarterly: 'reminders.repeatQuarterly',
  half_yearly: 'reminders.repeatHalfYearly',
  yearly: 'reminders.repeatYearly',
  once: 'reminders.repeatOnce',
};

const REPEAT_SHORT_KEYS: Record<ExpenseRepeat, TranslationKey> = {
  monthly: 'reminders.everyMonth',
  quarterly: 'reminders.every3Months',
  half_yearly: 'reminders.every6Months',
  yearly: 'reminders.everyYear',
  once: 'reminders.repeatOnce',
};

export function templateDisplayName(lang: string | null | undefined, name: string) {
  const key = TEMPLATE_KEYS[name];
  return key ? translate(lang, key) : name;
}

export function personDisplayName(lang: string | null | undefined, name: string) {
  const key = PERSON_KEYS[name];
  return key ? translate(lang, key) : name;
}

export function weekDayLabel(lang: string | null | undefined, day: string) {
  const key = DAY_KEYS[day];
  return key ? translate(lang, key) : day;
}

export function medSlotLabel(lang: string | null | undefined, slot: string) {
  const key = SLOT_KEYS[slot];
  return key ? translate(lang, key) : slot;
}

export function repeatOptionLabel(lang: string | null | undefined, repeat: ExpenseRepeat) {
  return translate(lang, REPEAT_KEYS[repeat]);
}

export function repeatShortLabel(lang: string | null | undefined, repeat: ExpenseRepeat) {
  return translate(lang, REPEAT_SHORT_KEYS[repeat]);
}

export function templateDetailKeys(name: string): {
  label?: TranslationKey;
  hint?: TranslationKey;
} {
  switch (name) {
    case 'OTT subscription':
      return { label: 'tmpl.ottLabel', hint: 'tmpl.ottHint' };
    case 'Phone bill':
      return { label: 'tmpl.phoneLabel', hint: 'tmpl.phoneHint' };
    case 'Mobile recharge':
      return { label: 'tmpl.rechargeLabel', hint: 'tmpl.rechargeHint' };
    default:
      return {};
  }
}
