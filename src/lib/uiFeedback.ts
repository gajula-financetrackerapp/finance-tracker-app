import type { UiFeedbackPreference, UiFeedbackStyle } from '../types';

export type { UiFeedbackPreference, UiFeedbackStyle };

export const UI_FEEDBACK_STYLES: UiFeedbackStyle[] = ['pop', 'chime', 'beep', 'buzz'];

type InjectFn = (js: string) => void;

let injectJs: InjectFn | null = null;
let toneReady = false;
let pending: UiFeedbackStyle | null = null;

/** Called by FeedbackToneHost when the Web Audio bridge is live. */
export function bindFeedbackToneBridge(inject: InjectFn | null, ready: boolean) {
  injectJs = inject;
  toneReady = ready && !!inject;
  if (toneReady && pending) {
    const style = pending;
    pending = null;
    playUiFeedback(style);
  }
}

/** Resume AudioContext after a user gesture (iOS requires this). */
export function unlockFeedbackTone() {
  if (!injectJs) return;
  injectJs(`try{unlockTone()}catch(e){};true;`);
}

/**
 * Play a feedback tone via Web Audio (same approach as haptics_1.html).
 * Synchronous from the RN side — no expo-audio seek/load latency.
 */
export function playUiFeedback(style: UiFeedbackStyle): void {
  if (!UI_FEEDBACK_STYLES.includes(style)) {
    console.warn('[uiFeedback] unknown style', style);
    return;
  }
  if (!injectJs || !toneReady) {
    pending = style;
    return;
  }
  // Keep the string tiny so injectJavaScript runs immediately.
  injectJs(`try{playTone(${JSON.stringify(style)})}catch(e){};true;`);
}

export function warmUiFeedbackAudio(): Promise<void> {
  // WebView warms itself on mount; unlock is opportunistic.
  unlockFeedbackTone();
  return Promise.resolve();
}

export function isUiFeedbackStyle(v: unknown): v is UiFeedbackStyle {
  return v === 'pop' || v === 'chime' || v === 'beep' || v === 'buzz';
}

export function mergeUiFeedbackStyle(saved?: string | null): UiFeedbackPreference {
  if (saved === 'off') return 'off';
  if (isUiFeedbackStyle(saved)) return saved;
  return 'off';
}
