import type { LegalSection } from './termsOfUse';

/** English Privacy Policy for in-app display. */
export function privacyPolicySections(appName: string): LegalSection[] {
  const name = appName.trim() || 'MoneyLit';
  return [
    {
      heading: '1. Overview',
      body: `This Privacy Policy explains how ${name} (“the App”) handles information when you use the App. It should be read with the Terms of Use.`,
    },
    {
      heading: '2. Information you provide',
      body: `Depending on how you use the App, this may include:\n• Account details such as email and display name when you sign in\n• Finance records you enter (transactions, categories, accounts, budgets, cash books)\n• Reminders, shopping lists, notes, and optional bill or receipt images\n• App preferences (theme, language, avatar, home layout, alarm settings)\n\nGuest users typically cannot save personal records until they sign in.`,
    },
    {
      heading: '3. Device permissions',
      body: `On Android, if you allow SMS access, the App reads bank and card messages already on the phone to suggest transactions and credit-card bills. The App does not listen for new SMS in the background. Raw message text is processed on the device and is not uploaded as an SMS archive. If you save an import or a card bill and Premium cloud sync is on, those saved records can be stored in the cloud.\n\nIf you attach a bill or receipt photo, the App uses the camera or photo library for that image. Those images are stored with your records on the device and, if you use Premium cloud sync, may be synced.\n\nGoogle sign-in uses your Google account email and basic profile. The App does not request access to Gmail and does not read your inbox.`,
    },
    {
      heading: '4. Information collected automatically',
      body: `The device and App may process technical information needed to run the service (for example app version, device type, crash or diagnostic signals if enabled, and session identifiers used for signed-in security).\n\nIf ads are shown on Free, advertising partners may collect device or usage signals under their own policies.`,
    },
    {
      heading: '5. Where your data is stored',
      body: `Free use stores your finance data primarily on your device.\n\nIf you enable Premium cloud sync or related cloud features, copies of your synced data are stored on our cloud infrastructure (for example via our backend provider) so you can use multiple devices.\n\nFile backups you export are stored wherever you choose to save or share them (email, Files, Drive, etc.). We do not control those locations.`,
    },
    {
      heading: '6. How we use information',
      body: `We use information to:\n• Provide and improve the App\n• Authenticate you and protect your account (including session rules)\n• Sync, back up, or restore data when you use those features\n• Show Premium status and feature access\n• Display ads on Free where applicable\n• Respond to feedback or support requests you send\n\nWe do not sell your personal finance records.`,
    },
    {
      heading: '7. Sharing',
      body: `We may share information with service providers who help us operate the App (hosting, authentication, storage, analytics, advertising), only as needed to provide those services.\n\nWe may disclose information if required by law or to protect rights, safety, or security.\n\nWe do not sell your transaction history to data brokers.`,
    },
    {
      heading: '8. Retention and Premium end',
      body: `Local data remains on your device until you delete it, clear app data, or uninstall (subject to your device OS).\n\nWhile Premium cloud sync is active, cloud copies generally keep about the last two years of dated finance data. Reminders and similar items stay for the Premium period. If Premium ends, cloud data is held for a grace period of about three months without further sync; if you do not renew, cloud copies may then be permanently deleted and your account continues as Free.\n\nAdmin accounts may be exempt from these cloud retention limits.\n\nFile backups you export remain wherever you saved them.\n\nYou can delete local and/or cloud data using in-app delete options where available.`,
    },
    {
      heading: '9. Security',
      body: `We use reasonable technical and organisational measures to protect account and cloud data. No method of storage or transmission is 100% secure. Protect your device lock screen and account password.`,
    },
    {
      heading: '10. Children',
      body: `The App is intended for general personal finance use by adults. It is not directed at children under 13 (or the minimum age required in your region). Do not use the App if you are below that age.`,
    },
    {
      heading: '11. Your choices',
      body: `You may:\n• Edit profile name where the App allows\n• Change language, theme, and other preferences\n• Turn off Premium-related cloud features according to product rules\n• Export or delete data using in-app tools where offered\n• Uninstall the App\n\nEmail used for login may not be changeable in-app; contact support if you need account help.`,
    },
    {
      heading: '12. International processing',
      body: `Your information may be processed on servers in India or other countries where our providers operate. By using cloud features, you understand that data may leave your device and be stored remotely.`,
    },
    {
      heading: '13. Changes',
      body: `We may update this Privacy Policy from time to time. The “Last updated” date in the App will change when we do. Continued use after an update means you accept the revised Policy.`,
    },
    {
      heading: '14. Contact',
      body: `For privacy questions or deletion requests, use Feedback in App Settings or the support channel listed for ${name} in About / the store listing.`,
    },
  ];
}
