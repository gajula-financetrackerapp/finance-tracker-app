import { Linking, Platform } from 'react-native';

export type UpiAppOption = {
  id: string;
  name: string;
  /** Android package — used to launch the app (we do not start a payment). */
  androidPackage: string;
  /** Deep-link prefixes to probe with Linking.canOpenURL / open the app. */
  schemes: string[];
};

/**
 * Popular Indian UPI apps.
 * We only open the app; the user completes payment themselves.
 */
export const UPI_APP_CATALOG: UpiAppOption[] = [
  {
    id: 'gpay',
    name: 'Google Pay',
    androidPackage: 'com.google.android.apps.nbu.paisa.user',
    schemes: ['tez://upi/', 'tez://', 'gpay://'],
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    androidPackage: 'com.phonepe.app',
    schemes: ['phonepe://'],
  },
  {
    id: 'paytm',
    name: 'Paytm',
    androidPackage: 'net.one97.paytm',
    schemes: ['paytmmp://', 'paytm://'],
  },
  {
    id: 'bhim',
    name: 'BHIM',
    androidPackage: 'in.org.npci.upiapp',
    schemes: ['bhim://'],
  },
  {
    id: 'amazonpay',
    name: 'Amazon Pay',
    androidPackage: 'in.amazon.mShop.android.shopping',
    schemes: ['amazonpay://'],
  },
  {
    id: 'cred',
    name: 'CRED',
    androidPackage: 'com.dreamplug.androidapp',
    schemes: ['cred://', 'credpay://'],
  },
];

function packageLaunchUrl(androidPackage: string): string {
  // Opens the app’s launcher activity — no payment intent / no `pa` required.
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${androidPackage};end`;
}

export async function detectInstalledUpiApps(): Promise<UpiAppOption[]> {
  if (Platform.OS !== 'android') return [];
  const found: UpiAppOption[] = [];
  for (const app of UPI_APP_CATALOG) {
    let ok = false;
    for (const scheme of app.schemes) {
      try {
        if (await Linking.canOpenURL(scheme)) {
          ok = true;
          break;
        }
      } catch {
        // ignore
      }
    }
    if (ok) found.push(app);
  }
  return found;
}

/**
 * Returns detected apps, or the full catalog when detection is empty
 * (common in Expo Go / without package visibility).
 */
export async function listUpiAppsForPicker(): Promise<UpiAppOption[]> {
  if (Platform.OS !== 'android') return [];
  const detected = await detectInstalledUpiApps();
  return detected.length > 0 ? detected : UPI_APP_CATALOG;
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the chosen UPI app only. Does not start or verify a payment.
 */
export async function openUpiApp(
  app: UpiAppOption | 'any',
): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'android') {
    return { ok: false, error: 'UPI apps are available on Android only.' };
  }

  if (app === 'any') {
    // System chooser for any app that handles the upi scheme (no pay params).
    const opened =
      (await tryOpen('upi://')) ||
      (await tryOpen(
        'intent:#Intent;action=android.intent.action.VIEW;scheme=upi;end',
      ));
    if (opened) return { ok: true };
    return { ok: false, error: 'Could not open a UPI app' };
  }

  for (const scheme of app.schemes) {
    if (await tryOpen(scheme)) return { ok: true };
  }

  if (await tryOpen(packageLaunchUrl(app.androidPackage))) return { ok: true };

  return {
    ok: false,
    error: `Could not open ${app.name}. Is it installed?`,
  };
}
