import { showAppDialog } from './appDialog';

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
export function requireAdminToChangeSettings(actionLabel = 'change settings') {
  if (isCurrentUserAdmin()) return true;
  showAppDialog({
    title: 'Admin only',
    message: `Only admin accounts can ${actionLabel}. Sign in with an admin email, or ask an admin to promote your account.`,
    icon: '🛡',
    buttons: [
      { text: 'Not now', style: 'cancel' },
      { text: 'Login', style: 'primary', onPress: () => openAuthModal('login') },
    ],
  });
  return false;
}
