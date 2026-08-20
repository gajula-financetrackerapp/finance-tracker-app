export type AboutBlock = { heading: string; body: string };

export function aboutBlocks(appName: string, version: string): AboutBlock[] {
  const name = appName.trim() || 'Kashio';
  return [
    {
      heading: 'What we build',
      body: `${name} is a personal finance organiser for everyday money tracking — incomes and expenses, Cash and Bank accounts, budgets, reminders, and a simple buy list.`,
    },
    {
      heading: 'Our approach',
      body: 'We keep the app practical and readable: clear monthly summaries on Home, account balances you can trust, and optional Premium for themes, avatars, backup, and multi-device cloud sync.',
    },
    {
      heading: 'Not a bank',
      body: `${name} does not move money, issue cards, or give financial advice. Figures you enter are for your own records.`,
    },
    {
      heading: 'Version',
      body: `App version ${version}`,
    },
  ];
}
