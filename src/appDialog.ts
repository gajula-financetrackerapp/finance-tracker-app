import { Alert, InteractionManager } from 'react-native';
import { tr } from './i18n/translations';
import {
  isAppContentLocked,
  subscribeToAppContentLock,
} from './lib/appLockVisibility';

export type AppDialogButton = {
  text: string;
  /** default | cancel | destructive | primary */
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  onPress?: () => void;
};

export type AppDialogOptions = {
  title: string;
  message?: string;
  /** Emoji / short icon shown above the title */
  icon?: string;
  buttons?: AppDialogButton[];
  /** Backdrop / back — not a button. */
  onDismiss?: () => void;
};

type Presenter = (opts: AppDialogOptions) => void;

let presenter: Presenter | null = null;
let pendingDialog: AppDialogOptions | null = null;

export function setAppDialogPresenter(fn: Presenter | null) {
  presenter = fn;
  flushPendingDialog();
}

function presentDialog(opts: AppDialogOptions): void {
  if (presenter) {
    presenter(opts);
    return;
  }
  Alert.alert(
    opts.title,
    opts.message,
    (opts.buttons || [{ text: tr('common.ok') }]).map((b) => ({
      text: b.text,
      style: b.style === 'destructive' ? 'destructive' : b.style === 'cancel' ? 'cancel' : 'default',
      onPress: b.onPress,
    })),
  );
}

function flushPendingDialog(): void {
  if (isAppContentLocked() || !pendingDialog) return;
  const opts = pendingDialog;
  pendingDialog = null;
  presentDialog(opts);
}

subscribeToAppContentLock(flushPendingDialog);

/**
 * Styled in-app dialog (replaces plain system Alert for info / choices).
 * Falls back to Alert.alert if the host is not mounted yet.
 */
export function showAppDialog(opts: AppDialogOptions) {
  if (isAppContentLocked()) {
    pendingDialog = opts;
    return;
  }
  presentDialog(opts);
}

/** Convenience: single OK info dialog */
export function showAppInfo(title: string, message: string, icon = '💡') {
  showAppDialog({
    title,
    message,
    icon,
    buttons: [{ text: tr('common.gotIt'), style: 'primary' }],
  });
}

/**
 * Show an info dialog after a native screen (rewarded ad, share sheet) has
 * fully closed. Calling Modal/Alert in the same tick as that close is dropped
 * on Android.
 */
export function showAppInfoWhenReady(title: string, message: string, icon = '💡') {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => showAppInfo(title, message, icon), 450);
  });
}
