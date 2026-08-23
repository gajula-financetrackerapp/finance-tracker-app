import type { Account, ExpenseReminder } from '../types';
import { isCoreCardAccount } from '../cashBooks';
import { issuerSlug } from './importRules/parseDueNotice';

export type CardSkin = {
  from: string;
  to: string;
  ink: string;
  muted: string;
};

const SKINS: Record<string, CardSkin> = {
  hdfc: { from: '#003A70', to: '#0B1F3A', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  sbi: { from: '#1E4B9B', to: '#122A58', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  icici: { from: '#C41E3A', to: '#1A0A0C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.78)' },
  axis: { from: '#6B1538', to: '#1C0A12', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)' },
  kotak: { from: '#C8102E', to: '#3B0A12', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  bob: { from: '#E85D04', to: '#3D1E08', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.78)' },
  rbl: { from: '#5B2C83', to: '#1A1028', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  yes: { from: '#0066B3', to: '#0A2540', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  idfc: { from: '#8B1E1E', to: '#2A0C0C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  indusind: { from: '#9B1B30', to: '#2A0A12', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  amex: { from: '#006FCF', to: '#012A4A', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  citi: { from: '#003B70', to: '#011627', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  hsbc: { from: '#DB0011', to: '#3D0008', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  stanchart: { from: '#00A3E0', to: '#023047', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.8)' },
  au: { from: '#E87722', to: '#3D220C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.8)' },
  federal: { from: '#004B87', to: '#011627', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  dbs: { from: '#E31C23', to: '#2A0A0C', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.75)' },
  card: { from: '#2A3348', to: '#0E1118', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.7)' },
};

export function skinForIssuer(issuer?: string | null): CardSkin {
  const slug = issuerSlug(issuer || 'Card');
  return SKINS[slug] || SKINS.card;
}

export type CreditCardView = {
  id: string;
  issuer: string;
  last4: string | null;
  remaining: number | null;
  totalDue: number | null;
  minDue: number | null;
  dueDate: string | null;
  paid: boolean;
  reminderId?: string;
  accountId?: string;
};

function accountMatchesReminder(account: Account, r: ExpenseReminder): boolean {
  const name = (account.name || '').toLowerCase();
  if (r.cardLast4 && name.includes(r.cardLast4)) return true;
  if (r.cardIssuer && name.includes(r.cardIssuer.toLowerCase())) return true;
  return false;
}

/** Cards we can draw: one per statement reminder, plus leftover card accounts. */
export function listCreditCardViews(
  accounts: Account[],
  reminders: ExpenseReminder[],
): CreditCardView[] {
  const bills = reminders.filter((r) => r.source === 'card-bill');
  const cards = accounts.filter((a) => !a.excluded && isCoreCardAccount(a));
  const used = new Set<string>();
  const out: CreditCardView[] = [];

  for (const r of bills) {
    const account = cards.find((a) => accountMatchesReminder(a, r));
    if (account) used.add(account.id);
    out.push({
      id: r.id,
      issuer: r.cardIssuer || r.name.replace(/\s+Card.*$/i, '') || 'Card',
      last4: r.cardLast4 || null,
      remaining: r.paid ? 0 : r.amount,
      totalDue: r.totalDue ?? r.amount,
      minDue: r.minDue ?? null,
      dueDate: r.dueDate || null,
      paid: !!r.paid,
      reminderId: r.id,
      accountId: account?.id,
    });
  }

  for (const account of cards) {
    if (used.has(account.id)) continue;
    if (bills.length === 1 && cards.length === 1) {
      out[0].accountId = account.id;
      used.add(account.id);
      continue;
    }
    out.push({
      id: account.id,
      issuer: account.name || 'Card',
      last4: null,
      remaining: null,
      totalDue: null,
      minDue: null,
      dueDate: null,
      paid: false,
      accountId: account.id,
    });
  }

  return out.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
}

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function openCardBillCount(cards: CreditCardView[]): number {
  return cards.filter((c) => !c.paid && (c.remaining || 0) > 0).length;
}

export function formatCardDueShort(iso?: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  if (!day || !month) return null;
  return `${day} ${MONTH_SHORT[month - 1]}`;
}
