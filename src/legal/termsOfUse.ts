export type LegalSection = { heading: string; body: string };

/** English Terms of Use for in-app display. */
export function termsOfUseSections(appName: string): LegalSection[] {
  const name = appName.trim() || 'Pulse Wallet';
  return [
    {
      heading: '1. Acceptance',
      body: `By installing, accessing, or using ${name} (“the App”), you agree to these Terms of Use. If you do not agree, do not use the App.`,
    },
    {
      heading: '2. What the App is',
      body: `${name} is a personal finance organiser. You can track income and expenses across money accounts and credit cards, import bank messages, set budgets, and see charts and reports, alongside separate workspaces for reminders, a shopping list and splitting costs with friends. Section 3 describes every feature and how it works.\n\nThe App is not a bank, payment service, tax filing service, investment platform, or professional accounting product. It does not move money, issue cards, read your bank balance, or provide regulated financial advice. Every figure in the App comes from what you or your messages entered, and is for your own records only.`,
    },
    {
      heading: '3. How the App works',
      body: `The sections below walk through every feature in the order you are likely to meet it, from the Home screen through to your account and data. Each one describes what the feature does and how it behaves, so you know what you are agreeing to use.\n\nSome features can be switched off, priced differently, or released gradually by the publisher, so what you see in the App is always the final word. Amounts and prices named here are defaults and may change.`,
    },
    {
      heading: '3.1 Home summary',
      body: `The band at the top of Home shows Expenses, Income and Balance for the current calendar month. Tapping Expenses or Income opens the matching list.\n\nWhen you have a credit card, each figure is split into two rows. The Bank row is money moving through the accounts that hold real money, which includes a card bill you paid. The Cr.Card row reads the card against its limit instead, showing how much of the limit you have used, the limit itself, and what is left. The two rows together account for everything you spent.\n\nYou can hide the summary band, choose whether Home opens on Expenses or Income, and set how transactions are sorted, in App Settings under Home page.`,
    },
    {
      heading: '3.2 Adding a transaction',
      body: `The + button opens the add form. Choose Expense, Income or Credit card, pick a category, then enter the amount, the account it came from or went to, the date, and an optional note.\n\nYou can attach a photo of a bill to a transaction. Grocery entries can be broken into individual items with expiry dates, which can raise grocery reminders for you automatically.\n\nAny transaction can be edited or deleted later by tapping it in a list.`,
    },
    {
      heading: '3.3 Credit cards',
      body: `A credit card is not a pot of money, so the App tracks it against its limit. Use “Credit card limit” to record the limit your bank gave you; this is stored as the card's starting balance and is never counted as income.\n\nWhat you spend on the card is an expense that reduces the available limit. “Credit card bill” records paying the card off as a transfer from the account that paid it to the card. That restores the available limit and counts as money out of the paying account, while the individual spends stay counted against the card, so the same money is never counted twice.\n\nThe limit does not reset at the end of the month. An unpaid spend keeps your available limit reduced for as long as it is unpaid, and paying the bill is what gives the limit back.`,
    },
    {
      heading: '3.4 Accounts',
      body: `Accounts are where your money sits. There are two kinds: a money account, shown as Bank / Cash / Debit Card, and a Credit Card. You can add more accounts, rename them, give them an icon, or hide one you no longer use.\n\nFor a money account the App shows what existed up to the end of last month, this month's income and expenses, and the resulting balance. For a credit card it shows the total credit limit, how much of it is used, and what is available.\n\nBalances are worked out from your starting balance plus everything you have recorded since. The App never contacts your bank to check them.`,
    },
    {
      heading: '3.5 Transactions list',
      body: `The Transactions screen lists your income or expenses for a chosen day, month or year. A row of chips lets you narrow the list to a single account, and the total for that filtered view is shown alongside.\n\nThe summary at the top mirrors Home: Expenses, Income and Balance for your money accounts, with the credit card's expense, total limit and available limit on their own row underneath.\n\nApp Settings also offers an All transactions view, where you can filter by period, select many rows at once, and delete them together.`,
    },
    {
      heading: '3.6 Importing from SMS',
      body: `On Android the App can read bank messages already in your inbox and turn them into draft transactions. It asks for SMS permission first, and you can refuse. Messages are read on your device and are not uploaded anywhere.\n\nIt scans a recent window of messages, works out the amount, date, merchant, whether it was money in or out, and which account or card was used, then guesses a category from the merchant name. Messages that are not transactions, such as one-time passwords, failed payments, statements, due-date notices and loan or credit-limit offers, are filtered out.\n\nNothing is saved until you confirm. You can select or clear everything, untick individual rows, and change a category before importing. Rows you have already imported are remembered and will not be added twice.\n\nWhere SMS is unavailable you can paste message text instead. Imported entries are only as accurate as the messages they came from, and you are responsible for checking them.`,
    },
    {
      heading: '3.7 Categories',
      body: `Transactions are grouped into categories such as Groceries, Food, Transport, Rent, EMI, bills and Salary. You can add your own with a chosen icon and colour, rename or delete the ones you added, and reset the list back to the defaults. The Others category cannot be removed, so nothing is ever left without a home.`,
    },
    {
      heading: '3.8 Budgets',
      body: `You can set a monthly limit for any expense category and watch what you have spent against it, including copying last month's limits into this one. Budgets are a guide for you; the App does not block spending or stop you recording a transaction that goes over one.`,
    },
    {
      heading: '3.9 Charts, Calendar and Smart Insights',
      body: `Charts show where your money went as a category breakdown, along with spending trends and a month-to-month comparison. The Calendar shows each day of a month with its totals, and tapping a day lists that day's entries.\n\nSmart Insights reads your own recorded data on your device and points out things like a budget you are close to passing, a category that jumped compared with last month, or a month with no income recorded. Insights are observations about what you entered, not advice, and are a Premium feature.`,
    },
    {
      heading: '3.10 Cash books',
      body: `A cash book is a separate set of accounts, transactions and budgets, so you can keep, for example, home and business records apart. You start with one called Personal, and you can create more, rename them, change their icon, archive ones you have finished with, or delete them. Only the book you have open is shown anywhere in the App.`,
    },
    {
      heading: '3.11 Reminders and alarms',
      body: `The Reminders workspace covers recurring bills, medicines with morning, afternoon and evening doses, groceries approaching their expiry date, and plain general reminders. You can set how far ahead you are warned, what time the daily alert arrives, and how long an alarm rings, and you can test an alarm at any time.\n\nReminders are a convenience only. Whether one actually reaches you depends on your device's settings, permissions, battery state and operating system limits, so please do not rely on them for anything critical.`,
    },
    {
      heading: '3.12 Shopping list and Split expenses',
      body: `The Shopping workspace keeps a simple list of items with quantities that you can search and tick off as bought.\n\nThe Split workspace lets you share costs with friends and groups, dividing an amount equally, by exact amounts, by percentage, by shares or with adjustments, and keeps a running record of who owes what. It needs a signed-in account and is a Premium feature. The App only keeps the record; it never moves money between you and anyone else.`,
    },
    {
      heading: '3.13 Search, currency and language',
      body: `Search from the header looks across your transactions, reminders, shopping items and settings. You can change the display currency from the header chip, which changes how amounts are shown and does not convert them. The App is available in many languages, and help and legal documents remain in English.`,
    },
    {
      heading: '3.14 Themes and avatars',
      body: `You can change the look of the App with themes and give your profile a character avatar. A free theme is always available, and the rest can be unlocked with Premium or rented with diamonds.`,
    },
    {
      heading: '3.15 Diamonds',
      body: `Diamonds are an in-app reward with no cash value. They cannot be bought, sold, transferred or exchanged for money, and they are not refundable.\n\nYou earn them by choosing to watch a rewarded advertisement through to the end, and by inviting friends. There is a limit on how many you can earn from advertisements each day. Your balance and the daily limit are held and checked on our server using server time, so changing your device's clock will not increase what you can earn.\n\nYou can spend diamonds on a Premium pass lasting a set number of days, or on individual extras such as an avatar, a theme, or Smart Insights for a period. A pass or an unlock bought with diamonds gives you the feature for its stated time only, after which it simply ends. Prices, the reward per advertisement and the daily limit are shown in the App and can change at any time.\n\nA Premium pass earned with diamonds unlocks features but does not remove advertisements. Only paid Premium is advertisement-free.`,
    },
    {
      heading: '3.16 Inviting friends',
      body: `Each signed-in account gets its own invite code. If a friend enters your code, both of you receive diamonds, subject to a limit on how many invites are rewarded.\n\nA code can only be used once per person, you cannot use your own, and we may withhold rewards where we believe codes are being abused, for example through duplicate or automated accounts.`,
    },
    {
      heading: '3.17 Free, Plus and Premium',
      body: `Free use keeps your records on your device, shows advertisements, and leaves some features locked. Plus unlocks individual features you choose, and Premium unlocks everything, removes advertisements, and enables cloud sync.\n\nPayment is made manually by UPI, after which you send us the payment reference and we activate your account. Activation is therefore not instant. Prices, plan contents and billing periods are shown in the App and may change; changes do not affect a period you have already paid for.`,
    },
    {
      heading: '3.18 Advertisements',
      body: `Free users may see banner and native advertisements in parts of the App, and may choose to watch rewarded video advertisements to earn diamonds. Watching a rewarded advertisement is always your choice and is never required to use a feature you already have.\n\nAdvertisements are supplied by third parties and are subject to their own terms and privacy policies. Paid Premium removes them.`,
    },
    {
      heading: '3.19 Cloud sync',
      body: `With Premium and a signed-in account, your cash books, transactions, budgets, reminders, categories and attached bill images can sync so you can pick up on another device. Sync needs a working connection and can be delayed or incomplete, so please do not treat it as your only copy.\n\nCloud storage generally keeps around the last two years of dated records. Older entries stay on the device that created them.\n\nYou can only be signed in on one device at a time; signing in elsewhere ends the earlier session.`,
    },
    {
      heading: '3.20 Backup, export and deleting your data',
      body: `Premium lets you save a backup file of your data and restore it later. Restoring replaces what is currently on the device, and looking after the file is your responsibility. You can also export your transactions as a spreadsheet for a date range you choose.\n\nYou can delete your data at any time: from this device, from the cloud, or both. Deletion is permanent, so take a backup first if you may want the records again.`,
    },
    {
      heading: '3.21 Using the App as a guest',
      body: `You can look around most of the App without an account. Saving your own records, importing messages, earning or spending diamonds, and syncing all need you to sign in, which you can do with Google, Apple or an email address and password.`,
    },
    {
      heading: '4. Eligibility and accounts',
      body: `You may browse some features as a guest. Saving your own records normally requires signing in.\n\nYou must provide accurate account details, keep your login credentials confidential, and are responsible for activity under your account. Notify us if you believe your account has been compromised.`,
    },
    {
      heading: '5. Your data and responsibility',
      body: `You own the information you enter (transactions, balances, reminders, notes, images you attach, and similar content).\n\nYou are solely responsible for the accuracy of that information and for any decisions you make using it. We do not verify your incomes, expenses, account balances, bills, or reminders.`,
    },
    {
      heading: '6. Free and Premium features',
      body: `Free use keeps data primarily on your device and may show advertisements. Some features are limited on Free.\n\nPremium may unlock extras shown in the App (for example themes or avatars, file backup/restore, Smart Insights, and cloud sync). Premium features and pricing may change; the App describes what is included when you unlock Premium.\n\nWhile Premium cloud sync is active, cloud storage generally keeps about the last two years of dated records. If Premium ends, cloud data is held for a short grace period without sync; if you do not renew, cloud copies may be deleted. Data left on your device may remain until you delete it.`,
    },
    {
      heading: '7. Cloud sync and backups',
      body: `Cloud sync (when available) requires a signed-in account and a network connection. Sync can be delayed or incomplete. Do not rely on cloud sync alone as your only copy of important records.\n\nFile backup and restore, where offered, are your responsibility to store and protect safely.`,
    },
    {
      heading: '8. Reminders and alarms',
      body: `Reminders and alarms are convenience features only. Delivery depends on your device settings, permissions, power state, and operating system limits. We are not liable if a reminder does not appear or sound.`,
    },
    {
      heading: '9. Acceptable use',
      body: `You agree not to misuse the App or related services, including by attempting to disrupt servers, bypass security, abuse multi-device or session rules, scrape or overload the service, or use the App for unlawful purposes.`,
    },
    {
      heading: '10. Intellectual property and no copying of source code',
      body: `The App’s name, branding, design, user interface, documentation, and software (including source code, object code, scripts, assets, and structure) are owned by the publisher and its licensors.\n\nYou receive a personal, limited, non-exclusive, non-transferable licence to install and use the App for your own personal, non-commercial record-keeping.\n\nYou may not copy, reproduce, modify, adapt, reverse engineer, decompile, disassemble, extract, republish, distribute, sublicense, sell, or create derivative works from the App’s source code or proprietary assets, except where applicable law expressly allows limited reverse engineering despite this restriction.\n\nYou may not use the App’s code, design, or assets to build a competing product, share private repositories or builds without permission, or claim ownership of the App’s intellectual property.`,
    },
    {
      heading: '11. Third-party services and ads',
      body: `The App may use third-party services (for example authentication, hosting, analytics, or advertising). Those services are governed by their own terms and policies. Free users may see advertisements.`,
    },
    {
      heading: '12. Disclaimers',
      body: `The App is provided “as is” and “as available.” To the fullest extent permitted by law, we disclaim warranties of uninterrupted service, error-free sync, merchantability, fitness for a particular purpose, and non-infringement.\n\nNothing in the App is financial, legal, accounting, or tax advice.`,
    },
    {
      heading: '13. Limitation of liability',
      body: `To the fullest extent permitted by law, we are not liable for lost data, missed reminders, sync failures, advertising, third-party outages, or decisions you make based on information in the App.\n\nWhere liability cannot be excluded, our total liability for claims relating to the App is limited to the amount you paid for Premium (if any) in the twelve (12) months before the claim, or zero if you used only the Free tier.`,
    },
    {
      heading: '14. Termination',
      body: `You may stop using the App and delete your data or account at any time using in-app options where available.\n\nWe may suspend or terminate access if you breach these Terms, misuse the service, or create risk to other users or the platform.`,
    },
    {
      heading: '15. Changes',
      body: `We may update these Terms from time to time. The “Last updated” date in the App will change when we do. Continued use after an update means you accept the revised Terms. If you do not agree, stop using the App.`,
    },
    {
      heading: '16. Governing law',
      body: `These Terms are governed by the laws of India, without regard to conflict-of-law rules. Courts in India shall have jurisdiction, subject to any mandatory consumer protections that apply to you.`,
    },
    {
      heading: '17. Contact',
      body: `For questions about these Terms, use the Feedback option in App Settings or contact the publisher through the support channel listed in About / store listing for ${name}.`,
    },
  ];
}
