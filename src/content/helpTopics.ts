export type HelpTopic = { title: string; body: string };

/** In-app Help topics (English body, like Terms). */
export function helpTopics(appName: string): HelpTopic[] {
  const name = appName.trim() || 'Pulse Wallet';
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
      body: 'Premium unlocks extras such as themes, character avatars, file backup/restore, and cloud sync across devices.\n\nFree keeps data mainly on this phone and may show ads.',
    },
    {
      title: 'Backup & clear cache',
      body: 'Backup / Restore (Premium) share or import a JSON file. Clear cache only removes temporary export files — it does not delete your transactions or settings.',
    },
    {
      title: 'Need more help?',
      body: 'Use Feedback in App Settings to send us a message. You can also read Terms of Use and Privacy Policy from the same Support section.',
    },
  ];
}
