import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { UiFeedbackPreference, UiFeedbackStyle } from '../types';

export type { UiFeedbackPreference, UiFeedbackStyle };

export const UI_FEEDBACK_STYLES: UiFeedbackStyle[] = ['pop', 'chime', 'beep', 'buzz'];

const STYLE_SOURCES: Record<UiFeedbackStyle, number> = {
  pop: require('../../assets/sounds/feedback-pop.wav'),
  chime: require('../../assets/sounds/feedback-chime.wav'),
  beep: require('../../assets/sounds/feedback-beep.wav'),
  buzz: require('../../assets/sounds/feedback-buzz.wav'),
};

let modeReady = false;
let player: AudioPlayer | null = null;

async function ensureAudioMode() {
  if (modeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    allowsRecording: false,
    interruptionMode: 'duckOthers',
    interruptionModeAndroid: 'duckOthers',
    shouldRouteThroughEarpiece: false,
  });
  modeReady = true;
}

function disposePlayer() {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // ignore
  }
  player = null;
}

/** Play one of the four button feedback tones (sound only — no vibration). */
export async function playUiFeedback(style: UiFeedbackStyle) {
  const source = STYLE_SOURCES[style];
  if (source == null) {
    console.warn('[uiFeedback] missing source', style);
    return;
  }
  try {
    await ensureAudioMode();
    disposePlayer();
    const next = createAudioPlayer(source);
    next.volume = 1;
    next.play();
    player = next;
    setTimeout(() => {
      if (player === next) disposePlayer();
    }, 700);
  } catch (err) {
    console.warn('[uiFeedback] sound failed', err);
  }
}

export function isUiFeedbackStyle(v: unknown): v is UiFeedbackStyle {
  return v === 'pop' || v === 'chime' || v === 'beep' || v === 'buzz';
}

export function mergeUiFeedbackStyle(saved?: string | null): UiFeedbackPreference {
  if (saved === 'off') return 'off';
  if (isUiFeedbackStyle(saved)) return saved;
  return 'off';
}
