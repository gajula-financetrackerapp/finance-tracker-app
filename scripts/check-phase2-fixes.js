const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const app = read('src/context/AppContext.tsx');
const cashBooks = read('src/cashBooks.ts');
check(
  'receipt saves use a pinned book updater',
  app.includes('persistBookFinanceLocalAndCloud') &&
    app.includes('const bookId = getActiveBook(cashBooksRef.current).id'),
);
check(
  'transaction deletes create cloud tombstones',
  app.includes('deletedTransactionIds: [...new Set('),
);
check(
  'retention folds removed transaction net into opening balances',
  cashBooks.includes('accountOpening(account, allTransactions) + accountTxnNet(removed, account.id)'),
);
check(
  'cloud merge filters deletion tombstones',
  cashBooks.includes('const deletedTransactionIds = [') &&
    cashBooks.includes('!deleted.has(t.id) && !cloudTxnIds.has(t.id)'),
);

const lockGate = read('src/components/AppLockGate.tsx');
const systemModal = read('src/components/SystemSafeArea.tsx');
const bottomSheet = read('src/components/BottomSheet.tsx');
const lightbox = read('src/components/BillImageLightbox.tsx');
check(
  'app lock uses a native topmost modal',
  lockGate.includes('<SystemModal') && lockGate.includes('allowWhenLocked'),
);
check(
  'other native modals are suppressed while locked',
  systemModal.includes('allowWhenLocked || !locked') &&
    bottomSheet.includes('props.visible && !locked') &&
    lightbox.includes('!!uri && !locked'),
);

const bills = read('src/lib/billStorage.ts');
check(
  'bill deletion drains paginated storage from offset zero',
  bills.includes('for (let pass = 0; pass < 100; pass += 1)') &&
    bills.includes('limit: 100') &&
    bills.includes('offset: 0'),
);

const split = read('src/context/SplitContext.tsx');
check(
  'settlement finance callback tracks readiness',
  /postSettlementFinance[\s\S]*?\}, \[ready\]\);/.test(split),
);

const notifications = read('src/lib/reminderNotifications.ts');
const schedule = read('src/alarms/schedule.ts');
check(
  'notification permission respects canAskAgain',
  notifications.includes("current.status === 'denied' && current.canAskAgain === false"),
);
check(
  'Android channel is created before requesting permission',
  notifications.indexOf('await ensureChannel(mod, prefs)') <
    notifications.indexOf('const permission = await ensureReminderPermission(true)'),
);
check(
  'reminder fingerprint includes displayed content',
  schedule.includes('[p.key, p.at, p.title, p.body]'),
);

for (const item of checks) console.log(`${item.ok ? 'ok ' : 'FAIL'} ${item.name}`);
const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} later-phase check(s) failed`);
  process.exit(1);
}
console.log(`\nall ${checks.length} later-phase checks passed`);
