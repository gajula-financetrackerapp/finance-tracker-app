import { Linking } from 'react-native';
import Constants from 'expo-constants';
import type { FeedbackConfig } from '../types';

/**
 * One way out of the app for everything a user tells us — the Feedback screen
 * and the Report / Request sheets on Home all hand their text to this, so the
 * admin's inbox keeps a single format no matter where the message came from.
 */
export type FeedbackSendResult = 'sent' | 'notConfigured' | 'failed';

function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function feedbackDestination(config?: FeedbackConfig): {
  channel: 'email' | 'whatsapp';
  email: string;
  whatsapp: string;
  ready: boolean;
} {
  const channel = config?.channel === 'whatsapp' ? 'whatsapp' : 'email';
  const email = (config?.email || '').trim();
  const whatsapp = digitsOnly(config?.whatsapp || '');
  const ready = channel === 'whatsapp' ? whatsapp.length >= 8 : email.includes('@');
  return { channel, email, whatsapp, ready };
}

export async function sendFeedbackMessage(input: {
  config?: FeedbackConfig;
  appName: string;
  /** Already translated, e.g. "Issue" or "Feature request". */
  topicLabel: string;
  /** Signed-in email, or 'guest'. */
  account: string;
  message: string;
}): Promise<FeedbackSendResult> {
  const { channel, email, whatsapp, ready } = feedbackDestination(input.config);
  if (!ready) return 'notConfigured';

  const version = Constants.expoConfig?.version || Constants.nativeAppVersion || '1.0.0';
  const subject = `${input.appName} feedback — ${input.topicLabel}`;
  const body = [
    `Topic: ${input.topicLabel}`,
    `Version: ${version}`,
    `Account: ${input.account}`,
    '',
    input.message,
  ].join('\n');

  const url =
    channel === 'whatsapp'
      ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(body)}`
      : `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    if (!(await Linking.canOpenURL(url))) return 'failed';
    await Linking.openURL(url);
    return 'sent';
  } catch {
    return 'failed';
  }
}
