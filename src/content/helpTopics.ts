export type HelpTopic = { title: string; body: string };

/** In-app Help topics (English body, like Terms). */
export function helpTopics(appName: string): HelpTopic[] {
  const name = appName.trim() || 'Kashio';
  return [
    {
      title: 'Getting started',
      body: `${name} helps you track money, reminders, and a buy list.\n\nSign in to save your data. Guests can browse but cannot add or edit records.`,
    },
    {
      title: 'Home balance',
      body: 'Home Income, Expenses, and Balance are for the selected month only (income − expenses that month).\n\nThey are not your full wallet total. Account balances live under Accounts.',
    },
    {
      title: 'Accounts (Cash & Bank)',
      body: 'Cash and Bank hold your money. Existing amount is what’s already there excluding this month’s income. Current month income is added from Home → Income (Received in).\n\nUse Paid with / Received in so each transaction hits the right account. Duplicate account names are merged into one.',
    },
    {
      title: 'Monthly balance',
      body: 'On each account card, open Monthly balance to see amounts till each month end (for example Till May, Till June). The big number on the card is your cumulative total today.',
    },
    {
      title: 'Buy list',
      body: 'Add items you plan to purchase. At the shop, tick each item as picked. Buy list does not send items to Finance or Grocery reminders.',
    },
    {
      title: 'Reminders',
      body: 'Use Reminders for bills, medicine, grocery expiry, and general notes. Alarms depend on your phone permissions and power settings.',
    },
    {
      title: 'Premium',
      body: 'Premium unlocks extras such as themes, character avatars, Smart Insights, file backup/restore, and cloud sync.\n\nFree keeps data mainly on this phone and may show ads.\n\nAdmin accounts include Premium and are exempt from cloud retention limits described under Cloud sync.',
    },
    {
      title: 'Cloud sync',
      body: 'Cloud sync is a Premium feature. While Premium is active, the cloud keeps about the last two years of dated finance data (transactions, budgets, related bill images). Reminders and the buy list stay for the whole Premium period.\n\nOnly one device can stay signed in at a time.\n\nIf Premium ends, cloud data is held for a 3-month grace period with no further sync. If you renew in that window, sync resumes. If you do not renew, all cloud data for your account is deleted and you continue as a Free user. Data on this phone is not deleted by that cloud wipe.\n\nAdmins are exempt from the 2-year prune and the post-grace cloud wipe.',
    },
    {
      title: 'Backup & restore',
      body: 'Backup / Restore (Premium) share or import a JSON file.\n\nExport includes a snapshot of your data and optional dataStart / dataEnd dates from your transactions.\n\nImport does not wipe everything. It updates transactions and category budgets only for the date range in the file; data outside that range on this phone stays. Accounts are taken from the file only if this phone has no transactions yet (for example after reinstall); otherwise your current accounts stay. You will be asked whether to also replace reminders and the buy list.\n\nIf Premium cloud sync is on, the merged result syncs to the cloud (still within the ~2-year cloud window).\n\nJSON files you save to Files, Drive, or email remain under your control and are not deleted when cloud data is purged.\n\nClear cache only removes temporary export files — it does not delete your transactions or settings.',
    },
    {
      title: 'Need more help?',
      body: 'Use Feedback in App Settings to send us a message. You can also read Terms of Use and Privacy Policy from the same Support section.',
    },
  ];
}
