export const theme = {
  // Distinct from Money Tracker's bright yellow — deep teal fintech look
  header: '#0F3D3E',
  accent: '#1FA7A3',
  accentDark: '#147F7C',
  accentSoft: '#D8F3F2',
  bg: '#F3F6F5',
  card: '#FFFFFF',
  ink: '#10221F',
  muted: '#6B7C78',
  line: '#E3EBE9',
  green: '#1F9D63',
  red: '#D64545',
  track: '#E8EEEC',
  white: '#FFFFFF',
  shadow: 'rgba(16, 34, 31, 0.08)',
};

export const EXPENSE_CATS = [
  { name: 'Shopping', icon: '🛒', color: '#1FA7A3' },
  { name: 'Food', icon: '🍔', color: '#E07A3D' },
  { name: 'Transport', icon: '🚌', color: '#4C8DFF' },
  { name: 'Bills', icon: '📄', color: '#8B6DFF' },
  { name: 'Health', icon: '💊', color: '#D64545' },
  { name: 'Entertainment', icon: '🎮', color: '#E5A100' },
  { name: 'Groceries', icon: '🛍️', color: '#2E9E5B' },
  { name: 'Others', icon: '🪙', color: '#6B7C78' },
];

export const INCOME_CATS = [
  { name: 'Salary', icon: '💼', color: '#1F9D63' },
  { name: 'Bonus', icon: '🏆', color: '#E5A100' },
  { name: 'Investments', icon: '📈', color: '#4C8DFF' },
  { name: 'Others', icon: '🪙', color: '#6B7C78' },
];

export function catMeta(name: string, kind: 'expense' | 'income' = 'expense') {
  const list = kind === 'income' ? INCOME_CATS : EXPENSE_CATS;
  return list.find((c) => c.name === name) || list[list.length - 1];
}

export function fmt(n: number) {
  const abs = Math.abs(n).toLocaleString('en-IN');
  return `₹${abs}`;
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function uid() {
  return `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
