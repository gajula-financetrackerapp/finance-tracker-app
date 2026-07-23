import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const alarmSource = require('../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;
let modeReady = false;
let testTimer: ReturnType<typeof setTimeout> | null = null;

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
    // ignore dispose errors
  }
  player = null;
}

/** Start looping in-app alarm tone (works while app is open / Expo Go). */
export async function startAlarmSound() {
  try {
    await ensureAudioMode();
    stopAlarmSound();
    const next = createAudioPlayer(alarmSource);
    next.loop = true;
    next.volume = 1;
    next.play();
    player = next;
  } catch (err) {
    console.warn('[alarms] sound failed to start', err);
  }
}

/** Stop alarm tone immediately. */
export function stopAlarmSound() {
  if (testTimer) {
    clearTimeout(testTimer);
    testTimer = null;
  }
  disposePlayer();
}

/** Short test burst used from Alarm settings. */
export async function playTestAlarmSound(durationMs = 2500) {
  await startAlarmSound();
  if (testTimer) clearTimeout(testTimer);
  testTimer = setTimeout(() => {
    testTimer = null;
    stopAlarmSound();
  }, durationMs);
}
