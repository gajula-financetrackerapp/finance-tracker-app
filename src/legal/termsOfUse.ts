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
      body: `${name} is a personal finance organiser. You can track incomes and expenses, accounts (such as Cash and Bank), budgets, reminders, shopping lists, and related reports.\n\nThe App is not a bank, payment service, tax filing service, investment platform, or professional accounting product. It does not move money, issue cards, or provide regulated financial advice. Figures you enter are for your own records only.`,
    },
    {
      heading: '3. Eligibility and accounts',
      body: `You may browse some features as a guest. Saving your own records normally requires signing in.\n\nYou must provide accurate account details, keep your login credentials confidential, and are responsible for activity under your account. Notify us if you believe your account has been compromised.`,
    },
    {
      heading: '4. Your data and responsibility',
      body: `You own the information you enter (transactions, balances, reminders, notes, images you attach, and similar content).\n\nYou are solely responsible for the accuracy of that information and for any decisions you make using it. We do not verify your incomes, expenses, account balances, bills, or reminders.`,
    },
    {
      heading: '5. Free and Premium features',
      body: `Free use keeps data primarily on your device and may show advertisements. Some features are limited on Free.\n\nPremium may unlock extras shown in the App (for example themes or avatars, file backup/restore, and cloud sync across devices). Premium features and pricing may change; the App describes what is included when you unlock Premium.\n\nIf Premium ends, cloud-stored copies may be removed after a retention period described in the App or Privacy Policy. Data left on your device may remain until you delete it.`,
    },
    {
      heading: '6. Cloud sync and backups',
      body: `Cloud sync (when available) requires a signed-in account and a network connection. Sync can be delayed or incomplete. Do not rely on cloud sync alone as your only copy of important records.\n\nFile backup and restore, where offered, are your responsibility to store and protect safely.`,
    },
    {
      heading: '7. Reminders and alarms',
      body: `Reminders and alarms are convenience features only. Delivery depends on your device settings, permissions, power state, and operating system limits. We are not liable if a reminder does not appear or sound.`,
    },
    {
      heading: '8. Acceptable use',
      body: `You agree not to misuse the App or related services, including by attempting to disrupt servers, bypass security, abuse multi-device or session rules, scrape or overload the service, or use the App for unlawful purposes.`,
    },
    {
      heading: '9. Intellectual property and no copying of source code',
      body: `The App’s name, branding, design, user interface, documentation, and software (including source code, object code, scripts, assets, and structure) are owned by the publisher and its licensors.\n\nYou receive a personal, limited, non-exclusive, non-transferable licence to install and use the App for your own personal, non-commercial record-keeping.\n\nYou may not copy, reproduce, modify, adapt, reverse engineer, decompile, disassemble, extract, republish, distribute, sublicense, sell, or create derivative works from the App’s source code or proprietary assets, except where applicable law expressly allows limited reverse engineering despite this restriction.\n\nYou may not use the App’s code, design, or assets to build a competing product, share private repositories or builds without permission, or claim ownership of the App’s intellectual property.`,
    },
    {
      heading: '10. Third-party services and ads',
      body: `The App may use third-party services (for example authentication, hosting, analytics, or advertising). Those services are governed by their own terms and policies. Free users may see advertisements.`,
    },
    {
      heading: '11. Disclaimers',
      body: `The App is provided “as is” and “as available.” To the fullest extent permitted by law, we disclaim warranties of uninterrupted service, error-free sync, merchantability, fitness for a particular purpose, and non-infringement.\n\nNothing in the App is financial, legal, accounting, or tax advice.`,
    },
    {
      heading: '12. Limitation of liability',
      body: `To the fullest extent permitted by law, we are not liable for lost data, missed reminders, sync failures, advertising, third-party outages, or decisions you make based on information in the App.\n\nWhere liability cannot be excluded, our total liability for claims relating to the App is limited to the amount you paid for Premium (if any) in the twelve (12) months before the claim, or zero if you used only the Free tier.`,
    },
    {
      heading: '13. Termination',
      body: `You may stop using the App and delete your data or account at any time using in-app options where available.\n\nWe may suspend or terminate access if you breach these Terms, misuse the service, or create risk to other users or the platform.`,
    },
    {
      heading: '14. Changes',
      body: `We may update these Terms from time to time. The “Last updated” date in the App will change when we do. Continued use after an update means you accept the revised Terms. If you do not agree, stop using the App.`,
    },
    {
      heading: '15. Governing law',
      body: `These Terms are governed by the laws of India, without regard to conflict-of-law rules. Courts in India shall have jurisdiction, subject to any mandatory consumer protections that apply to you.`,
    },
    {
      heading: '16. Contact',
      body: `For questions about these Terms, use the Feedback option in App Settings or contact the publisher through the support channel listed in About / store listing for ${name}.`,
    },
  ];
}
