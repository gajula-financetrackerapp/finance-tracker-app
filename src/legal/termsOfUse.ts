import { tr, type TranslationKey } from '../i18n/translations';

export type LegalSection = { heading: string; body: string };

/**
 * The feature guide, which explains how the App behaves, is translated: it is
 * there to be understood. The legal clauses around it stay in English, and the
 * English wording is the version that applies.
 */
const GUIDE_SECTION_KEYS: [TranslationKey, TranslationKey][] = [
  ['terms.guide3', 'terms.guide3Body'],
  ['terms.guide31', 'terms.guide31Body'],
  ['terms.guide32', 'terms.guide32Body'],
  ['terms.guide33', 'terms.guide33Body'],
  ['terms.guide34', 'terms.guide34Body'],
  ['terms.guide35', 'terms.guide35Body'],
  ['terms.guide36', 'terms.guide36Body'],
  ['terms.guide37', 'terms.guide37Body'],
  ['terms.guide38', 'terms.guide38Body'],
  ['terms.guide39', 'terms.guide39Body'],
  ['terms.guide310', 'terms.guide310Body'],
  ['terms.guide311', 'terms.guide311Body'],
  ['terms.guide312', 'terms.guide312Body'],
  ['terms.guide313', 'terms.guide313Body'],
  ['terms.guide314', 'terms.guide314Body'],
  ['terms.guide315', 'terms.guide315Body'],
  ['terms.guide316', 'terms.guide316Body'],
  ['terms.guide317', 'terms.guide317Body'],
  ['terms.guide318', 'terms.guide318Body'],
  ['terms.guide319', 'terms.guide319Body'],
  ['terms.guide320', 'terms.guide320Body'],
  ['terms.guide321', 'terms.guide321Body'],
];

function guideSections(): LegalSection[] {
  return GUIDE_SECTION_KEYS.map(([heading, body]) => ({
    heading: tr(heading),
    body: tr(body),
  }));
}

/** Terms of Use for in-app display. */
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
    ...guideSections(),
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
