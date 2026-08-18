import {
  CORE_BANK_NAME,
  CORE_CARD_NAME,
  accountDeleteBlock,
  accountNameClash,
  bankAccountId,
  cardAccountId,
  isCoreBankAccount,
  isCoreCardAccount,
  normalizeFinanceState,
} from '../src/cashBooks';
import type { FinanceState } from '../src/types';

let fail = 0;
function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

/** Closing and reopening the app runs the saved state back through normalize. */
const reload = (state: FinanceState) =>
  normalizeFinanceState(JSON.parse(JSON.stringify(state)) as FinanceState, 'INR');

/** Renaming keeps the type, which is what the Accounts editor saves. */
const rename = (state: FinanceState, id: string, name: string): FinanceState => ({
  ...state,
  accounts: state.accounts.map((a) => (a.id === id ? { ...a, name } : a)),
});

// ---------- a fresh install still gets its two accounts ----------
const fresh = normalizeFinanceState(null, 'INR');
const bankId = bankAccountId(fresh.accounts)!;
const cardId = cardAccountId(fresh.accounts)!;
check('a new book opens with a bank and a card', fresh.accounts.length === 2);
check('the bank is named as standard', fresh.accounts.some((a) => a.name === CORE_BANK_NAME));
check('the card is named as standard', fresh.accounts.some((a) => a.name === CORE_CARD_NAME));

// ---------- a rename survives a restart ----------
let renamed = rename(fresh, bankId, 'HDFC Savings');
renamed = rename(renamed, cardId, 'Amex Platinum');
const after = reload(renamed);

check('no extra account appears on reopening', after.accounts.length === 2);
check('the renamed bank keeps its id', after.accounts.some((a) => a.id === bankId));
check('the renamed card keeps its id', after.accounts.some((a) => a.id === cardId));
check(
  'the bank keeps the name you gave it',
  after.accounts.find((a) => a.id === bankId)?.name === 'HDFC Savings',
);
check(
  'the card keeps the name you gave it',
  after.accounts.find((a) => a.id === cardId)?.name === 'Amex Platinum',
);
check(
  'the renamed bank is still treated as the bank',
  isCoreBankAccount(after.accounts.find((a) => a.id === bankId)!),
);
check(
  'the renamed card is still treated as the card',
  isCoreCardAccount(after.accounts.find((a) => a.id === cardId)!),
);
check('the renamed bank still resolves as the bank', bankAccountId(after.accounts) === bankId);
check('the renamed card still resolves as the card', cardAccountId(after.accounts) === cardId);
check('new income still lands in the renamed bank', after.defaultAccountId === bankId);

// Reopening many times must stay put, not add one account per launch.
let repeated = after;
for (let i = 0; i < 5; i++) repeated = reload(repeated);
check('five more launches add nothing', repeated.accounts.length === 2);
check('five more launches keep the names', repeated.accounts.every((a) => a.id === bankId || a.id === cardId));

// ---------- a missing core account is still replaced ----------
const bankOnly = reload({ ...after, accounts: after.accounts.filter((a) => a.id === bankId) });
check('a book with no card gets one', bankOnly.accounts.some(isCoreCardAccount));
check('adding the card leaves the renamed bank alone', bankOnly.accounts.some((a) => a.id === bankId));

const cardOnly = reload({ ...after, accounts: after.accounts.filter((a) => a.id === cardId) });
check('a book with no bank gets one', cardOnly.accounts.some(isCoreBankAccount));
check('adding the bank leaves the renamed card alone', cardOnly.accounts.some((a) => a.id === cardId));

// ---------- adding your own account leaves the defaults alone ----------
const addAccount = (
  state: FinanceState,
  id: string,
  name: string,
  type: string,
): FinanceState => ({
  ...state,
  accounts: [
    ...state.accounts,
    { id, name, type, currency: 'INR', amount: 0, openingBalance: 0, icon: '🏦', excluded: false },
  ],
});

const added = reload(addAccount(fresh, 'x1', 'HDFC', 'Bank'));
check('your new account is kept', added.accounts.some((a) => a.id === 'x1'));
check('the default bank survives alongside it', added.accounts.some((a) => a.id === bankId));
check('the default card survives alongside it', added.accounts.some((a) => a.id === cardId));
check('nothing extra is invented', added.accounts.length === 3);
check(
  'the stock-named bank is still where income lands',
  added.defaultAccountId === bankId,
);

// A second card of your own must not be relabelled onto the default's name.
const twoCards = reload(addAccount(fresh, 'x2', 'Cr.Card', 'Card'));
check('your second card is kept', twoCards.accounts.some((a) => a.id === 'x2'));
check('your second card keeps the name you chose', twoCards.accounts.find((a) => a.id === 'x2')?.name === 'Cr.Card');
check(
  'no two accounts end up sharing a name',
  new Set(twoCards.accounts.map((a) => a.name)).size === twoCards.accounts.length,
);

// Removing an extra account must not bring it back.
const pruned = reload({ ...added, accounts: added.accounts.filter((a) => a.id !== 'x1') });
check('a deleted extra account stays deleted', !pruned.accounts.some((a) => a.id === 'x1'));
check('deleting an extra leaves the two defaults', pruned.accounts.length === 2);

// ---------- four accounts: spares go, the last of each stays ----------
// The two that shipped, renamed, plus one bank and one card of your own.
let four = rename(fresh, bankId, 'HDFC Savings');
four = rename(four, cardId, 'Amex Platinum');
four = addAccount(four, 'b2', 'ICICI', 'Bank');
four = addAccount(four, 'c2', 'SBI Card', 'Card');
four = reload(four);
check('all four accounts load', four.accounts.length === 4);

check('the renamed bank can go while a spare bank remains', accountDeleteBlock(four.accounts, bankId) === null);
check('the spare bank can go instead', accountDeleteBlock(four.accounts, 'b2') === null);
check('the renamed card can go while a spare card remains', accountDeleteBlock(four.accounts, cardId) === null);
check('the spare card can go instead', accountDeleteBlock(four.accounts, 'c2') === null);

// Drop one of each, then the survivors are the last of their kind.
const twoLeft = reload({
  ...four,
  accounts: four.accounts.filter((a) => a.id !== 'b2' && a.id !== cardId),
});
check('deleting a spare bank and a card leaves two', twoLeft.accounts.length === 2);
check('the deleted bank does not come back', !twoLeft.accounts.some((a) => a.id === 'b2'));
check('the deleted card does not come back', !twoLeft.accounts.some((a) => a.id === cardId));
check('a bank is still standing', twoLeft.accounts.some(isCoreBankAccount));
check('a card is still standing', twoLeft.accounts.some(isCoreCardAccount));
check('the last bank is refused', accountDeleteBlock(twoLeft.accounts, bankId) === 'lastBank');
check('the last card is refused', accountDeleteBlock(twoLeft.accounts, 'c2') === 'lastCard');
check(
  'the last bank is refused by name too, not just by being the default',
  accountDeleteBlock(
    reload({ ...four, accounts: four.accounts.filter((a) => a.id === 'b2' || a.id === 'c2') })
      .accounts,
    'b2',
  ) === 'lastBank',
);

// An archived account cannot stand in for a live one.
const withArchivedBank = addAccount(
  { ...twoLeft, accounts: twoLeft.accounts.map((a) => (a.id === bankId ? { ...a, excluded: true } : a)) },
  'b3',
  'Axis',
  'Bank',
);
check(
  'an excluded bank cannot be the one left standing',
  accountDeleteBlock(withArchivedBank.accounts, 'b3') === 'lastBank',
);
check('deleting an unknown id is not blocked', accountDeleteBlock(four.accounts, 'nope') === null);

// ---------- one name belongs to one account ----------
const list = [
  { id: 'a', name: 'HDFC Savings' },
  { id: 'b', name: 'Amex Platinum' },
];
check('adding a name already in use is refused', accountNameClash(list, 'HDFC Savings')?.id === 'a');
check('the check ignores case', accountNameClash(list, 'hdfc savings')?.id === 'a');
check('the check ignores stray spaces', accountNameClash(list, '  HDFC Savings  ')?.id === 'a');
check('renaming onto another account is refused', accountNameClash(list, 'Amex Platinum', 'a')?.id === 'b');
check('keeping your own name is allowed', accountNameClash(list, 'HDFC Savings', 'a') === undefined);
check('changing case of your own name is allowed', accountNameClash(list, 'hdfc savings', 'a') === undefined);
check('a name nobody uses is allowed', accountNameClash(list, 'ICICI') === undefined);
check('an empty name is not treated as a clash', accountNameClash(list, '   ') === undefined);
check(
  'the stock names are protected too',
  accountNameClash(fresh.accounts, CORE_BANK_NAME)?.id === bankId &&
    accountNameClash(fresh.accounts, CORE_CARD_NAME)?.id === cardId,
);

// ---------- books saved under the old labels still canonicalise ----------
const legacy = normalizeFinanceState(
  {
    accounts: [
      { id: 'b1', name: 'Bank', type: '', currency: 'INR', amount: 0, openingBalance: 0 },
      { id: 'c1', name: 'Card', type: '', currency: 'INR', amount: 0, openingBalance: 0 },
    ],
    transactions: [],
  } as unknown as FinanceState,
  'INR',
);
check('an older book keeps its two accounts', legacy.accounts.length === 2);
check('the old Bank label is brought up to date', legacy.accounts.find((a) => a.id === 'b1')?.name === CORE_BANK_NAME);
check('the old Card label is brought up to date', legacy.accounts.find((a) => a.id === 'c1')?.name === CORE_CARD_NAME);

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
