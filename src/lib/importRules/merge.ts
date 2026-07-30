import type { ImportRulesConfig, ImportSourceRule } from '../../types';
import { BUILTIN_IMPORT_RULES } from './builtinRules';

export const DEFAULT_IMPORT_RULES: ImportRulesConfig = {
  enabled: true,
  smsLookbackDays: 14,
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
    priority,
  };
}

/** Merge built-in + admin custom rules (custom overrides built-in by id). */
export function mergeImportRules(saved?: Partial<ImportRulesConfig> | null): ImportRulesConfig {
  const lookbackRaw = Number(saved?.smsLookbackDays);
  const smsLookbackDays =
    Number.isFinite(lookbackRaw) && lookbackRaw > 0
      ? Math.min(90, Math.round(lookbackRaw))
      : DEFAULT_IMPORT_RULES.smsLookbackDays;

  const custom = Array.isArray(saved?.rules)
    ? saved!.rules.map(normalizeRule).filter((r): r is ImportSourceRule => !!r)
    : [];

  const byId = new Map<string, ImportSourceRule>();
  for (const rule of BUILTIN_IMPORT_RULES) {
    byId.set(rule.id, { ...rule, senders: [...rule.senders], bodyIncludes: [...rule.bodyIncludes] });
  }
  for (const rule of custom) {
    const prev = byId.get(rule.id);
    byId.set(rule.id, prev ? { ...prev, ...rule } : rule);
  }

  return {
    enabled: saved?.enabled !== false,
    smsLookbackDays,
    rules: Array.from(byId.values()).sort(
      (a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name),
    ),
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
