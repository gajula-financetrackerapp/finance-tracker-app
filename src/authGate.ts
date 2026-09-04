import { showAppDialog } from './appDialog';
import { tr } from './i18n/translations';

/** Shared auth gate so AppContext mutations can require signup without circular imports. */
type GateFn = (actionLabel?: string) => boolean;

let gate: GateFn | null = null;
let openAuth: ((mode: 'login' | 'signup') => void) | null = null;
let adminChecker: (() => boolean) | null = null;

export function setAuthGate(fn: GateFn | null) {
  gate = fn;
}

export function setOpenAuth(fn: ((mode: 'login' | 'signup') => void) | null) {
  openAuth = fn;
}

export function setAdminChecker(fn: (() => boolean) | null) {
  adminChecker = fn;
}

export function isCurrentUserAdmin() {
  return !!adminChecker?.();
}

export function requireAuthToSave(actionLabel = 'save data') {
  if (!gate) return true;
  return gate(actionLabel);
}

export function openAuthModal(mode: 'login' | 'signup' = 'signup') {
  openAuth?.(mode);
}

/** Settings / Admin panel changes — signed-in admin accounts only. */
export function requireAdminToChangeSettings() {
  if (isCurrentUserAdmin()) return true;
  showAppDialog({
    title: tr('admin.onlyTitle'),
    message: tr('admin.onlyBody'),
    icon: '🛡',
    buttons: [
      { text: tr('auth.notNow'), style: 'cancel' },
      { text: tr('common.signIn'), style: 'primary', onPress: () => openAuthModal('login') },
    ],
  });
  return false;
}
