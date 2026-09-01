import { showAppDialog, showAppInfo } from '../appDialog';
import type { TranslationKey } from '../i18n/translations';
import type { DiamondEarnReason, DiamondState } from './diamonds';

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function splitCreatesAreUnlimited(
  state: DiamondState,
  isPremiumMember: boolean,
): boolean {
  return state.splitUnlimited || isPremiumMember;
}

export function freeSplitsLeftToday(state: DiamondState, unlimited: boolean): number | null {
  if (unlimited) return null;
  return Math.max(0, Math.trunc(state.splitFreePerDay) - Math.trunc(state.splitCreatesToday));
}

export function extraSplitDiamondCost(state: DiamondState): number {
  return Math.max(0, Math.trunc(state.splitExtraCost));
}

function earnFailureMessage(t: TFn, reason?: DiamondEarnReason): string {
  switch (reason) {
    case 'cap':
      return t('diamonds.errCap');
    case 'adSkipped':
      return t('diamonds.errSkipped');
    case 'adUnavailable':
      return t('diamonds.errNoAd');
    case 'disabled':
      return t('diamonds.errDisabled');
    case 'signedOut':
      return t('diamonds.signInFirst');
    default:
      return t('diamonds.errGeneric');
  }
}

function confirm(opts: {
  title: string;
  message: string;
  action: string;
  t: TFn;
}): Promise<boolean> {
  return new Promise((resolve) => {
    showAppDialog({
      title: opts.title,
      message: opts.message,
      icon: '💎',
      buttons: [
        {
          text: opts.t('common.cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: opts.action,
          style: 'primary',
          onPress: () => resolve(true),
        },
      ],
    });
  });
}

/**
 * Client-side gate before creating a split. The create RPC still enforces the
 * same rules. Does not auto-play an ad — the user must confirm Watch / Spend.
 */
export async function ensureSplitCreateAllowed(opts: {
  unlimited: boolean;
  fetchState: () => Promise<DiamondState>;
  watchAd: () => Promise<{
    ok: boolean;
    reason?: DiamondEarnReason;
    state: DiamondState | null;
  }>;
  t: TFn;
}): Promise<boolean> {
  let state = await opts.fetchState();
  if (opts.unlimited || state.splitUnlimited) return true;

  const freeLeft = freeSplitsLeftToday(state, false) ?? 0;
  const cost = extraSplitDiamondCost(state);
  if (freeLeft > 0 || cost <= 0) return true;

  if (state.balance >= cost) {
    return confirm({
      title: opts.t('split.quotaSpendTitle'),
      message: opts.t('split.quotaSpendBody', { n: cost, balance: state.balance }),
      action: opts.t('split.quotaSpendAction', { n: cost }),
      t: opts.t,
    });
  }

  if (!state.enabled) {
    showAppInfo(opts.t('split.title'), opts.t('split.quotaAdsOff'), '💎');
    return false;
  }

  while (state.balance < cost) {
    const go = await confirm({
      title: opts.t('split.quotaWatchTitle'),
      message:
        state.balance > 0
          ? opts.t('split.quotaNeedMoreBody', { n: cost, balance: state.balance })
          : opts.t('split.quotaWatchBody', { n: cost, balance: state.balance }),
      action: opts.t('split.quotaWatchAction'),
      t: opts.t,
    });
    if (!go) return false;
    const result = await opts.watchAd();
    if (result.state) state = result.state;
    if (!result.ok) {
      showAppInfo(opts.t('diamonds.title'), earnFailureMessage(opts.t, result.reason), '💎');
      return false;
    }
  }
  return true;
}
