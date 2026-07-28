import { dateLocaleForLanguage } from '../i18n/dateLocales';
import { todayStr } from '../utils';

export type DateSection<T> = { title: string; day: string; data: T[] };

/** Normalize to YYYY-MM-DD when possible. */
export function normalizeIsoDate(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export function formatDaySectionLabel(
  iso: string,
  language: string | null | undefined,
  labels: { today: string; yesterday: string },
): string {
  const d = normalizeIsoDate(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || iso;
  const today = todayStr();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterday = todayStr(yest);
  if (d === today) return labels.today;
  if (d === yesterday) return labels.yesterday;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(dateLocaleForLanguage(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Group already-sorted items by calendar day.
 * Preserves input order within each day and across days.
 */
export function groupItemsByDate<T>(
  items: T[],
  getDate: (item: T) => string,
  language: string | null | undefined,
  labels: { today: string; yesterday: string },
): DateSection<T>[] {
  const sections: DateSection<T>[] = [];
  const indexByDay = new Map<string, number>();

  for (const item of items) {
    const day = normalizeIsoDate(getDate(item)) || 'unknown';
    let idx = indexByDay.get(day);
    if (idx == null) {
      idx = sections.length;
      indexByDay.set(day, idx);
      sections.push({
        day,
        title: formatDaySectionLabel(day, language, labels),
        data: [],
      });
    }
    sections[idx].data.push(item);
  }

  return sections;
}
