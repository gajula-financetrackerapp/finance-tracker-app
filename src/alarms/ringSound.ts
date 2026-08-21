import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const alarmSource = require('../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;
let modeReady = false;
let testTimer: ReturnType<typeof setTimeout> | null = null;
let toneUri: string | null = null;

/**
 * The tone chosen from the phone, if any. Held here rather than passed in at
 * every call: ringing happens from a timer deep in the alarm provider, where the
 * settings are not to hand.
 */
export function setAlarmToneUri(uri: string | null) {
  toneUri = uri && uri.trim() ? uri.trim() : null;
}

export function alarmToneUri(): string | null {
  return toneUri;
}

/** How long a chosen tone is given to prove it can play. */
const TONE_PROBE_MS = 1200;

/** Set when a chosen tone had to give way to the built-in one. */
let toneFellBack = false;

function startPlayer(source: Parameters<typeof createAudioPlayer>[0]): AudioPlayer {
  const next = createAudioPlayer(source);
  next.loop = true;
  next.volume = 1;
  next.play();
  return next;
}

/**
 * A source that cannot be read fails while loading rather than on the call that
 * started it, so watch the status for a moment and let the caller know. Silence
 * where an alarm should be is the one outcome worth this much trouble.
 */
function watchForLoadFailure(target: AudioPlayer, onFailed: () => void) {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let subscription: { remove: () => void } | null = null;

  const finish = (failed: boolean) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    try {
      subscription?.remove();
    } catch {
      // ignore
    }
    if (failed) onFailed();
  };

  // This version of expo-audio reports no load error of its own, so playback
  // starting is the only signal worth waiting for.
  subscription = target.addListener('playbackStatusUpdate', (status) => {
    if (status.playing) finish(false);
  });

  timer = setTimeout(() => finish(!target.playing), TONE_PROBE_MS);
}

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
 * can say so out loud — a silent failure here looks exactly like a phone on
 * mute.
 *
 * A tone borrowed from the phone is tried first and the app's own is kept in
 * reserve: the chosen one may have been deleted since, or may sit in storage
 * this app is not allowed to read, and either way a reminder still has to ring.
 */
export async function startAlarmSound(): Promise<boolean> {
  await ensureAudioMode().catch(() => undefined);
  stopAlarmSound();
  toneFellBack = false;

  if (toneUri) {
    try {
      const chosen = startPlayer({ uri: toneUri });
      player = chosen;
      watchForLoadFailure(chosen, () => {
        toneFellBack = true;
        // Only step in if this is still the ring in progress; by now the alarm
        // may have been dismissed, or a later one may have taken over.
        if (player !== chosen) return;
        console.warn('[alarms] chosen tone would not play, using the built-in one');
        disposePlayer();
        try {
          player = startPlayer(alarmSource);
        } catch {
          player = null;
        }
      });
      return true;
    } catch (err) {
      console.warn('[alarms] chosen tone would not start, using the built-in one', err);
    }
  }

  try {
    player = startPlayer(alarmSource);
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

export type TestRing = {
  /** Something was heard, whichever tone it turned out to be. */
  heard: boolean;
  /** False when the phone's tone was asked for and would not play. */
  usedChosenTone: boolean;
};

/**
 * Short test burst used from Alarm settings.
 *
 * With a tone borrowed from the phone this waits for the probe before
 * answering, so the settings screen can tell the user which tone they are
 * actually about to hear rather than guessing.
 */
export async function playTestAlarmSound(durationMs = 2500): Promise<TestRing> {
  const started = await startAlarmSound();
  if (testTimer) clearTimeout(testTimer);
  testTimer = setTimeout(() => {
    testTimer = null;
    stopAlarmSound();
  }, durationMs);

  if (!started || !toneUri) return { heard: started, usedChosenTone: started && !!toneUri };

  await new Promise<void>((resolve) => setTimeout(resolve, TONE_PROBE_MS + 200));
  return { heard: !!player, usedChosenTone: !toneFellBack };
}
