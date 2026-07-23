import { Alert } from 'react-native';

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
};

type Presenter = (opts: AppDialogOptions) => void;

let presenter: Presenter | null = null;

export function setAppDialogPresenter(fn: Presenter | null) {
  presenter = fn;
}

/**
 * Styled in-app dialog (replaces plain system Alert for info / choices).
 * Falls back to Alert.alert if the host is not mounted yet.
 */
export function showAppDialog(opts: AppDialogOptions) {
  if (presenter) {
    presenter(opts);
    return;
  }
  Alert.alert(
    opts.title,
    opts.message,
    (opts.buttons || [{ text: 'OK' }]).map((b) => ({
      text: b.text,
      style: b.style === 'destructive' ? 'destructive' : b.style === 'cancel' ? 'cancel' : 'default',
      onPress: b.onPress,
    })),
  );
}

/** Convenience: single OK info dialog */
export function showAppInfo(title: string, message: string, icon = '💡') {
  showAppDialog({
    title,
    message,
    icon,
    buttons: [{ text: 'Got it', style: 'primary' }],
  });
}
