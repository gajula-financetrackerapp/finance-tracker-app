import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DropdownSelect } from './DropdownSelect';
import { useApp } from '../context/AppContext';
import { dateLocaleForLanguage } from '../i18n/dateLocales';
import { useT } from '../i18n/useT';
import { monthKey } from '../utils';

export const PERIOD_ALL = 'all';

export type PeriodFilterValue = {
  year: string;
  /** `all` or `01`–`12` */
  month: string;
  /** `all` or `01`–`31` */
  day: string;
};

type OpenKey = 'year' | 'month' | 'day' | null;

function monthShort(monthNum: string, language: string | null | undefined) {
  const m = Number(monthNum);
  if (!m || m < 1 || m > 12) return monthNum;
  return new Date(2000, m - 1, 1).toLocaleDateString(dateLocaleForLanguage(language), {
    month: 'short',
  });
}

function clampDay(year: string, month: string, day: string): string {
  if (month === PERIOD_ALL || day === PERIOD_ALL) return PERIOD_ALL;
  const max = new Date(Number(year), Number(month), 0).getDate();
  if (!max || Number(day) > max) return PERIOD_ALL;
  return day;
}

/** True when `date` (YYYY-MM-DD) matches year / month / day filters. */
export function matchesPeriodDate(date: string, period: PeriodFilterValue): boolean {
  const d = date || '';
  if (!d.startsWith(period.year)) return false;
  if (period.month !== PERIOD_ALL && d.slice(5, 7) !== period.month) return false;
  if (period.day !== PERIOD_ALL && d.slice(8, 10) !== period.day) return false;
  return true;
}

/** YYYY-MM when a specific month is selected. */
export function periodMonthKey(period: PeriodFilterValue): string | null {
  if (period.month === PERIOD_ALL) return null;
  return `${period.year}-${period.month}`;
}

export function defaultPeriodFilter(from = new Date()): PeriodFilterValue {
  const key = monthKey(from);
  return {
    year: key.slice(0, 4),
    month: key.slice(5, 7),
    day: PERIOD_ALL,
  };
}

export function buildYearOptions(
  extraYears: Iterable<string> = [],
  anchor = new Date(),
): { value: string; label: string }[] {
  const years = new Set<string>([String(anchor.getFullYear())]);
  for (const y of extraYears) {
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return [...years]
    .sort((a, b) => Number(b) - Number(a))
    .map((value) => ({ value, label: value }));
}

type Props = {
  value: PeriodFilterValue;
  onChange: (next: PeriodFilterValue) => void;
  /** Years to offer (plus the current calendar year). */
  yearsFromData?: string[];
  language?: string | null;
  /** When false, month list is Jan–Dec only (no “All months”). Default true. */
  allowAllMonths?: boolean;
};

/**
 * Shared Year / Month / Day filters — compact, theme-colored, overlay menus.
 */
export function PeriodFilterBar({
  value,
  onChange,
  yearsFromData = [],
  language,
  allowAllMonths = true,
}: Props) {
  const { t } = useT();
  const { theme } = useApp();
  const [openKey, setOpenKey] = useState<OpenKey>(null);

  const yearOptions = useMemo(
    () => buildYearOptions(yearsFromData),
    [yearsFromData],
  );

  const monthOptions = useMemo(() => {
    const opts = allowAllMonths
      ? [{ value: PERIOD_ALL, label: t('allTxns.allMonths') }]
      : [];
    for (let i = 1; i <= 12; i += 1) {
      const v = String(i).padStart(2, '0');
      opts.push({ value: v, label: monthShort(v, language) });
    }
    return opts;
  }, [language, t, allowAllMonths]);

  const dayOptions = useMemo(() => {
    const opts = [{ value: PERIOD_ALL, label: t('allTxns.allDays') }];
    if (value.month === PERIOD_ALL) return opts;
    const y = Number(value.year);
    const m = Number(value.month);
    if (!y || !m) return opts;
    const max = new Date(y, m, 0).getDate();
    for (let d = 1; d <= max; d += 1) {
      const v = String(d).padStart(2, '0');
      opts.push({ value: v, label: String(d) });
    }
    return opts;
  }, [value.year, value.month, t]);

  const selectedYear =
    yearOptions.some((o) => o.value === value.year) ? value.year : yearOptions[0]?.value || value.year;

  const closeThen = (fn: () => void) => {
    fn();
    setOpenKey(null);
  };

  return (
    <View style={[styles.row, { backgroundColor: theme.header }]} pointerEvents="box-none">
      <View style={[styles.cell, openKey === 'year' && styles.cellOpen]} pointerEvents="box-none">
        <DropdownSelect
          compact
          dense
          overlay
          themed
          elevate={openKey === 'year'}
          open={openKey === 'year'}
          onOpenChange={(open) => setOpenKey(open ? 'year' : null)}
          label={t('allTxns.year')}
          value={selectedYear}
          placeholder={t('allTxns.year')}
          options={yearOptions}
          onChange={(year) =>
            closeThen(() =>
              onChange({
                year,
                month: value.month,
                day: clampDay(year, value.month, value.day),
              }),
            )
          }
        />
      </View>
      <View style={[styles.cell, openKey === 'month' && styles.cellOpen]} pointerEvents="box-none">
        <DropdownSelect
          compact
          dense
          overlay
          themed
          elevate={openKey === 'month'}
          open={openKey === 'month'}
          onOpenChange={(open) => setOpenKey(open ? 'month' : null)}
          label={t('allTxns.month')}
          value={value.month}
          placeholder={t('allTxns.month')}
          options={monthOptions}
          onChange={(month) =>
            closeThen(() =>
              onChange({
                year: selectedYear,
                month,
                day: clampDay(selectedYear, month, value.day),
              }),
            )
          }
        />
      </View>
      <View style={[styles.cell, openKey === 'day' && styles.cellOpen]} pointerEvents="box-none">
        <DropdownSelect
          compact
          dense
          overlay
          themed
          elevate={openKey === 'day'}
          open={openKey === 'day'}
          onOpenChange={(open) => setOpenKey(open ? 'day' : null)}
          label={t('allTxns.day')}
          value={value.month === PERIOD_ALL ? PERIOD_ALL : value.day}
          placeholder={t('allTxns.day')}
          options={dayOptions}
          onChange={(day) =>
            closeThen(() => onChange({ year: selectedYear, month: value.month, day }))
          }
          disabled={value.month === PERIOD_ALL}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    overflow: 'visible',
    zIndex: 1,
  },
  cell: { flex: 1, zIndex: 1, overflow: 'visible' },
  cellOpen: { zIndex: 2 },
});
