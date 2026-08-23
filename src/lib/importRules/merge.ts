import type { ImportRulesConfig, ImportSourceRule, SmsImportMonthRange } from '../../types';
import { BUILTIN_IMPORT_RULES } from './builtinRules';

export const DEFAULT_IMPORT_RULES: ImportRulesConfig = {
  enabled: true,
  smsMonthRange: 'this_month',
  rules: [],
};

function normalizeRule(raw: Partial<ImportSourceRule> | null | undefined): ImportSourceRule | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const senders = Array.isArray(raw.senders)
    ? raw.senders.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const bodyIncludes = Array.isArray(raw.bodyIncludes)
    ? raw.bodyIncludes.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const bodyExcludes = Array.isArray(raw.bodyExcludes)
    ? raw.bodyExcludes.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const kind = raw.kind === 'income' ? 'income' : 'expense';
  const category =
    typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Others';
  const name =
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : raw.id.trim();
  const priority =
    typeof raw.priority === 'number' && Number.isFinite(raw.priority) ? raw.priority : 0;
  const paymentTypeRaw = typeof raw.paymentType === 'string' ? raw.paymentType.trim().toLowerCase() : '';
  const paymentType =
    paymentTypeRaw === 'upi' || paymentTypeRaw === 'card' || paymentTypeRaw === 'bank'
      ? paymentTypeRaw
      : undefined;
  return {
    id: raw.id.trim(),
    name,
    enabled: raw.enabled !== false,
    senders,
    bodyIncludes,
    bodyExcludes: bodyExcludes.length ? bodyExcludes : undefined,
    kind,
    category,
    notePrefix:
      typeof raw.notePrefix === 'string' && raw.notePrefix.trim()
        ? raw.notePrefix.trim()
        : undefined,
    paymentType,
    priority,
  };
}

function normalizeMonthRange(raw: unknown): SmsImportMonthRange {
  return raw === 'previous_month' ? 'previous_month' : 'this_month';
}

/** Start/end timestamps for the admin-selected SMS month window. */
export function smsImportMonthBounds(
  range: SmsImportMonthRange,
  now = new Date(),
): { minDateMs: number; maxDateMs: number } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (range === 'previous_month') {
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { minDateMs: start.getTime(), maxDateMs: end.getTime() };
  }
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  return { minDateMs: start.getTime(), maxDateMs: now.getTime() };
}

/** Merge built-in + admin custom rules (custom overrides built-in by id). */
export function mergeImportRules(saved?: Partial<ImportRulesConfig> | null): ImportRulesConfig {
  const smsMonthRange = normalizeMonthRange(
    (saved as { smsMonthRange?: unknown } | null | undefined)?.smsMonthRange,
  );

  const custom = Array.isArray(saved?.rules)
    ? saved!.rules.map(normalizeRule).filter((r): r is ImportSourceRule => !!r)
    : [];

  const builtinIds = new Set(BUILTIN_IMPORT_RULES.map((r) => r.id));
  const byId = new Map<string, ImportSourceRule>();
  for (const rule of BUILTIN_IMPORT_RULES) {
    byId.set(rule.id, {
      ...rule,
      senders: [...rule.senders],
      bodyIncludes: [...rule.bodyIncludes],
      bodyExcludes: rule.bodyExcludes ? [...rule.bodyExcludes] : undefined,
    });
  }
  for (const rule of custom) {
    const prev = byId.get(rule.id);
    if (prev && builtinIds.has(rule.id)) {
      // Never freeze match logic from an older app build — only keep admin toggles.
      byId.set(rule.id, {
        ...prev,
        enabled: rule.enabled !== false,
        category: rule.category || prev.category,
        priority: typeof rule.priority === 'number' ? rule.priority : prev.priority,
      });
      continue;
    }
    byId.set(rule.id, prev ? { ...prev, ...rule } : rule);
  }

  return {
    enabled: saved?.enabled !== false,
    smsMonthRange,
    rules: Array.from(byId.values()).sort(
      (a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name),
    ),
  };
}

/**
 * The admin's own edits, stripped of the built-ins they were merged with.
 *
 * Sending the merged list would pin every phone to the built-ins of whatever
 * app version the admin happened to be running, and mergeImportRules would
 * then have to discard most of it anyway. A built-in is worth sending only
 * where the admin moved one of the three fields an override may carry.
 */
export function importRulesForCloud(config: ImportRulesConfig): ImportRulesConfig {
  const builtinById = new Map(BUILTIN_IMPORT_RULES.map((r) => [r.id, r]));
  const rules = config.rules.filter((rule) => {
    const builtin = builtinById.get(rule.id);
    if (!builtin) return true;
    return (
      rule.enabled !== builtin.enabled ||
      rule.category !== builtin.category ||
      (rule.priority || 0) !== (builtin.priority || 0)
    );
  });
  return {
    enabled: config.enabled !== false,
    smsMonthRange: normalizeMonthRange(config.smsMonthRange),
    rules,
  };
}

/** Only admin-saved custom/overrides — not the full merged list. */
export function customImportRulesOnly(
  saved?: Partial<ImportRulesConfig> | null,
): ImportSourceRule[] {
  if (!Array.isArray(saved?.rules)) return [];
  return saved!.rules.map(normalizeRule).filter((r): r is ImportSourceRule => !!r);
}

export function activeImportRules(config: ImportRulesConfig): ImportSourceRule[] {
  if (config.enabled === false) return [];
  return config.rules.filter((r) => r.enabled !== false);
}
