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

/**
 * Start the looping alarm tone. Returns false if it could not play, so a test
 * can say so out loud — this is the only sound file the app plays, and a silent
 * failure here looks exactly like a phone on mute.
 */
export async function startAlarmSound(): Promise<boolean> {
  try {
    await ensureAudioMode();
    stopAlarmSound();
    const next = createAudioPlayer(alarmSource);
    next.loop = true;
    next.volume = 1;
    next.play();
    player = next;
    return true;
  } catch (err) {
    console.warn('[alarms] sound failed to start', err);
    return false;
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
export async function playTestAlarmSound(durationMs = 2500): Promise<boolean> {
  const started = await startAlarmSound();
  if (testTimer) clearTimeout(testTimer);
  testTimer = setTimeout(() => {
    testTimer = null;
    stopAlarmSound();
  }, durationMs);
  return started;
}
