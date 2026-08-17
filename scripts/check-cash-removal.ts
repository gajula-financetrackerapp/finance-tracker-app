import {
  accountChipLabel,
  bankAccountId,
  cardAccountId,
  CORE_BANK_NAME,
  CORE_CARD_NAME,
  mergeCashIntoBank,
  normalizeCashBooks,
  normalizeFinanceState,
} from '../src/cashBooks';
import { resolveImportAccountId } from '../src/lib/importRules/parseImportText';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from '../src/constants';
import type { Account, CashBooksState } from '../src/types';

let fail = 0;
function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const book = (s: CashBooksState) => s.books[0].finance;
const names = (s: CashBooksState) => book(s).accounts.map((a) => a.name.trim().toLowerCase());

function booksWith(
  accounts: { id: string; name: string; openingBalance?: number; amount?: number }[],
  transactions: Record<string, unknown>[] = [],
  defaultAccountId?: string,
): CashBooksState {
  return {
    activeBookId: 'b1',
    books: [
      {
        id: 'b1',
        name: 'Personal',
        icon: '📒',
        archived: false,
        finance: {
          accounts: accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.name,
            currency: 'INR',
            amount: a.amount ?? 0,
            openingBalance: a.openingBalance ?? 0,
            icon: '💵',
            excluded: false,
          })),
          transactions: transactions as never,
          budget: 0,
          categoryBudgets: [],
          defaultAccountId: defaultAccountId ?? accounts[0]?.id,
        },
      },
    ],
  } as CashBooksState;
}

// ---------- naming ----------

const fresh = normalizeFinanceState(null, 'INR');
check(
  'new install has the bank + credit card only',
  fresh.accounts.length === 2 &&
    fresh.accounts.some((a) => a.name === CORE_BANK_NAME) &&
    fresh.accounts.some((a) => a.name === CORE_CARD_NAME) &&
    !fresh.accounts.some((a) => a.name === 'Cash'),
);

// Books saved under the old labels are relabelled on load.
const renamed = normalizeCashBooks(
  booksWith([
    { id: 'bank', name: 'Bank' },
    { id: 'card', name: 'Card' },
  ]),
  'INR',
);
check(
  'old "Bank" / "Card" names are migrated',
  names(renamed).join(',') ===
    `${CORE_BANK_NAME.toLowerCase()},${CORE_CARD_NAME.toLowerCase()}`,
);
check('a deleted Cash account is not recreated on load', !names(renamed).includes('cash'));
check(
  'renaming is idempotent',
  names(normalizeCashBooks(renamed, 'INR')).join(',') === names(renamed).join(','),
);

const renamedAccounts = book(renamed).accounts;
check('bank lookup survives the rename', bankAccountId(renamedAccounts) === 'bank');
check('card lookup survives the rename', cardAccountId(renamedAccounts) === 'card');
check(
  'chip labels keep their icons',
  accountChipLabel(renamedAccounts[0]).startsWith('🏦') &&
    accountChipLabel(renamedAccounts[1]).startsWith('💳'),
);

// A custom Card-type account must not shadow the real credit card.
const withCustomCard = normalizeCashBooks(
  booksWith([
    { id: 'hdfc', name: 'HDFC Card' },
    { id: 'bank', name: 'Bank' },
    { id: 'card', name: 'Card' },
  ]),
  'INR',
);
check(
  'the core credit card wins over a custom card account',
  cardAccountId(book(withCustomCard).accounts) === 'card',
);

// ---------- import routing (the rename hazard) ----------

const importAccounts = book(renamed).accounts as Account[];
check(
  'card spends do not land on the bank named "…Debit Card"',
  resolveImportAccountId(importAccounts, 'card') === 'card',
);
check('bank debits go to the bank', resolveImportAccountId(importAccounts, 'bank') === 'bank');
check('UPI falls back to the bank', resolveImportAccountId(importAccounts, 'upi') === 'bank');

// ---------- merging Cash away ----------

const merged = mergeCashIntoBank(
  booksWith(
    [
      { id: 'bank', name: 'Bank' },
      { id: 'cash', name: 'Cash' },
      { id: 'card', name: 'Card' },
    ],
    [{ id: 't1', kind: 'expense', accountId: 'cash', amount: 100, date: '2026-08-01' }],
  ),
);
check('Cash is merged away', merged.changed && !names(merged.state).includes('cash'));
check(
  'its transactions move to the bank',
  book(merged.state).transactions.length === 1 &&
    book(merged.state).transactions[0].accountId === 'bank',
);
check('the move is reported', merged.movedTxns === 1);

// Totals must survive: Cash's opening balance folds into the bank's.
const funded = mergeCashIntoBank(
  booksWith([
    { id: 'bank', name: 'Bank', openingBalance: 200 },
    { id: 'cash', name: 'Cash', openingBalance: 500 },
  ]),
);
check(
  'opening balances are added together',
  book(funded.state).accounts.find((a) => a.id === 'bank')?.openingBalance === 700,
);

// Cash↔Bank transfers become meaningless once they are one account.
const selfTransfer = mergeCashIntoBank(
  booksWith(
    [
      { id: 'bank', name: 'Bank' },
      { id: 'cash', name: 'Cash' },
    ],
    [
      {
        id: 't2',
        kind: 'transfer',
        fromAccountId: 'bank',
        toAccountId: 'cash',
        amount: 50,
        date: '2026-08-01',
      },
    ],
  ),
);
check('a Cash↔Bank transfer is dropped', book(selfTransfer.state).transactions.length === 0);

// A transfer to a third account keeps working, re-pointed at the bank.
const keptTransfer = mergeCashIntoBank(
  booksWith(
    [
      { id: 'bank', name: 'Bank' },
      { id: 'cash', name: 'Cash' },
      { id: 'wallet', name: 'Wallet' },
    ],
    [
      {
        id: 't3',
        kind: 'transfer',
        fromAccountId: 'cash',
        toAccountId: 'wallet',
        amount: 50,
        date: '2026-08-01',
      },
    ],
  ),
);
check(
  'a Cash→Wallet transfer is re-pointed at the bank',
  book(keptTransfer.state).transactions.length === 1 &&
    book(keptTransfer.state).transactions[0].fromAccountId === 'bank',
);

// The default account must not dangle.
const wasDefault = mergeCashIntoBank(
  booksWith(
    [
      { id: 'bank', name: 'Bank' },
      { id: 'cash', name: 'Cash' },
    ],
    [],
    'cash',
  ),
);
check('the default account moves off Cash', book(wasDefault.state).defaultAccountId === 'bank');

// Never strip the only account.
const lone = mergeCashIntoBank(booksWith([{ id: 'cash', name: 'Cash' }]));
check('a lone Cash account is kept', names(lone.state).includes('cash'));

// Merging is safe to re-run, which is what the cloud/backup restore paths do.
check('merging again is a no-op', mergeCashIntoBank(merged.state).changed === false);

// ---------- account types offered in the editor ----------

check(
  'only bank and credit card types are offered',
  ACCOUNT_TYPES.length === 2 && ACCOUNT_TYPES.includes('Bank') && ACCOUNT_TYPES.includes('Card'),
);
check(
  'every offered type has a readable label',
  ACCOUNT_TYPES.every((t) => !!ACCOUNT_TYPE_LABELS[t]),
);
check('the card type reads as Credit Card', ACCOUNT_TYPE_LABELS.Card === 'Credit Card');
check(
  'the core accounts use types that still exist in the picker',
  fresh.accounts.every((a) => (ACCOUNT_TYPES as readonly string[]).includes(a.type || '')),
);

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
