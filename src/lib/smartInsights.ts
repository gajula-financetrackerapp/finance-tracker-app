import type { CategoryBudget, Transaction } from '../types';

export type InsightSeverity = 'info' | 'warn' | 'good';

export type SmartInsight = {
  id: string;
  severity: InsightSeverity;
  /** i18n key under insights.* */
    messageKey:
    | 'insights.budgetOver'
    | 'insights.budgetRisk'
    | 'insights.categorySpike'
    | 'insights.topCategory'
    | 'insights.spendDown'
    | 'insights.noIncome'
    | 'insights.paceOvershoot'
    | 'insights.empty'
    | 'insights.lockedSample';
  params: Record<string, string>;
  category?: string;
};

type Input = {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  monthKey: string; // YYYY-MM
  /** Format amounts for display in message params */
  formatMoney: (n: number) => string;
  /** Display name for a category */
  categoryLabel: (name: string) => string;
};

function shiftMonthKey(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function sumKind(transactions: Transaction[], monthKey: string, kind: 'expense' | 'income') {
  let total = 0;
  for (const t of transactions) {
    if (t.homeHidden) continue;
    if (t.kind !== kind) continue;
    if (!(t.date || '').startsWith(monthKey)) continue;
    total += t.amount || 0;
  }
  return total;
}

function byCategory(transactions: Transaction[], monthKey: string, kind: 'expense' | 'income') {
  const map: Record<string, number> = {};
  for (const t of transactions) {
    if (t.homeHidden) continue;
    if (t.kind !== kind) continue;
    if (!(t.date || '').startsWith(monthKey)) continue;
    const cat = t.category || 'Others';
    map[cat] = (map[cat] || 0) + (t.amount || 0);
  }
  return map;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  warn: 0,
  info: 1,
  good: 2,
};

/**
 * Rule-based Smart Insights for a month. Pure / local — no network.
 */
export function buildSmartInsights(input: Input): SmartInsight[] {
  const { transactions, budgets, monthKey, formatMoney, categoryLabel } = input;
  const prevKey = shiftMonthKey(monthKey, -1);
  const expenseNow = sumKind(transactions, monthKey, 'expense');
  const incomeNow = sumKind(transactions, monthKey, 'income');
  const expensePrev = sumKind(transactions, prevKey, 'expense');
  const catsNow = byCategory(transactions, monthKey, 'expense');
  const catsPrev = byCategory(transactions, prevKey, 'expense');
  const monthBudgets = budgets.filter((b) => b.month === monthKey && b.limit > 0);

  const out: SmartInsight[] = [];

  // Budget over / risk
  for (const b of monthBudgets) {
    const spent = catsNow[b.category] || 0;
    if (spent <= 0) continue;
    if (spent > b.limit) {
      out.push({
        id: `budget-over-${b.category}`,
        severity: 'warn',
        messageKey: 'insights.budgetOver',
        params: {
          category: categoryLabel(b.category),
          spent: formatMoney(spent),
          limit: formatMoney(b.limit),
        },
        category: b.category,
      });
    } else if (spent / b.limit >= 0.8) {
      const pct = Math.round((spent / b.limit) * 100);
      out.push({
        id: `budget-risk-${b.category}`,
        severity: 'warn',
        messageKey: 'insights.budgetRisk',
        params: {
          category: categoryLabel(b.category),
          pct: String(pct),
          remaining: formatMoney(Math.max(0, b.limit - spent)),
        },
        category: b.category,
      });
    }
  }

  // Category spike vs previous month
  for (const [cat, now] of Object.entries(catsNow)) {
    const prev = catsPrev[cat] || 0;
    if (now < 200) continue;
    if (prev <= 0) continue;
    const growth = (now - prev) / prev;
    if (growth >= 0.25 && now - prev >= 100) {
      out.push({
        id: `spike-${cat}`,
        severity: 'info',
        messageKey: 'insights.categorySpike',
        params: {
          category: categoryLabel(cat),
          pct: String(Math.round(growth * 100)),
          amount: formatMoney(now),
        },
        category: cat,
      });
    }
  }

  // Top category share
  const top = Object.entries(catsNow).sort((a, b) => b[1] - a[1])[0];
  if (top && expenseNow > 0 && top[1] / expenseNow >= 0.25) {
    out.push({
      id: `top-${top[0]}`,
      severity: 'info',
      messageKey: 'insights.topCategory',
      params: {
        category: categoryLabel(top[0]),
        amount: formatMoney(top[1]),
        pct: String(Math.round((top[1] / expenseNow) * 100)),
      },
      category: top[0],
    });
  }

  // Spend down vs last month
  if (expensePrev > 0 && expenseNow > 0 && expenseNow < expensePrev * 0.85) {
    const pct = Math.round(((expensePrev - expenseNow) / expensePrev) * 100);
    out.push({
      id: 'spend-down',
      severity: 'good',
      messageKey: 'insights.spendDown',
      params: {
        pct: String(pct),
        amount: formatMoney(expensePrev - expenseNow),
      },
    });
  }

  // Expenses but no income
  if (expenseNow > 0 && incomeNow <= 0) {
    out.push({
      id: 'no-income',
      severity: 'info',
      messageKey: 'insights.noIncome',
      params: { spent: formatMoney(expenseNow) },
    });
  }

  // Pace: projected month-end from daily average (current month only)
  const today = new Date();
  const [y, m] = monthKey.split('-').map(Number);
  const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
  if (isCurrent && expenseNow > 0) {
    const dim = daysInMonth(monthKey);
    const day = Math.max(1, Math.min(today.getDate(), dim));
    const projected = (expenseNow / day) * dim;
    const totalBudget = monthBudgets.reduce((s, b) => s + b.limit, 0);
    if (totalBudget > 0 && projected > totalBudget * 1.05) {
      out.push({
        id: 'pace-overshoot',
        severity: 'warn',
        messageKey: 'insights.paceOvershoot',
        params: {
          projected: formatMoney(Math.round(projected)),
          budget: formatMoney(totalBudget),
        },
      });
    }
  }

  if (out.length === 0) {
    if (expenseNow <= 0) {
      return [
        {
          id: 'empty',
          severity: 'info',
          messageKey: 'insights.empty',
          params: {},
        },
      ];
    }
  }

  // De-dupe by id, rank, keep top 5
  const seen = new Set<string>();
  return out
    .filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 5);
}

/** Sample insight shown (locked) for Free users. */
export function sampleInsight(): SmartInsight {
  return {
    id: 'sample',
    severity: 'info',
    messageKey: 'insights.lockedSample',
    params: {},
  };
}
