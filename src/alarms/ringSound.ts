import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { playPhoneTone, stopPhoneTone } from '../../modules/ringtone-info';

const alarmSource = require('../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;
let modeReady = false;
let testTimer: ReturnType<typeof setTimeout> | null = null;
let toneUri: string | null = null;
/** True while the tone ringing is the phone's, played by the native module. */
let nativeRinging = false;

/**
 * The tone chosen from the phone, if any. Held here rather than passed in at
 * every call: ringing happens from a timer deep in the alarm provider, where the
 * settings are not to hand.
 */
export function setAlarmToneUri(uri: string | null) {
  toneUri = uri && uri.trim() ? uri.trim() : null;
}

/** How long a tone is given to prove it is really running. */
const PROBE_MS = 1500;

/**
 * Which ring this is. Bumped by every start and every stop, so a probe that is
 * still waiting can tell that the alarm it belongs to has been dealt with and
 * drop out instead of starting a fallback nobody asked for.
 */
let generation = 0;

function startPlayer(source: Parameters<typeof createAudioPlayer>[0]): AudioPlayer {
  const next = createAudioPlayer(source);
  next.loop = true;
  next.volume = 1;
  next.play();
  return next;
}

/**
 * Wait until the tone is genuinely running, or give up.
 *
 * `playing` is no use as the signal: it turns true the moment play() is called,
 * whether or not the source can be read, which is how a tone the app has no
 * permission for used to swallow the whole ring in silence. A position that
 * moves cannot be faked, so that is what this waits for.
 *
 * It does mean a phone with its media volume at zero still counts as running.
 * Nothing in expo-audio can tell playing-and-inaudible from playing-and-heard,
 * which is why the test says to check the volume rather than claiming to know.
 */
function confirmRunning(target: AudioPlayer): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove: () => void } | null = null;

    const finish = (running: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        subscription?.remove();
      } catch {
        // ignore
      }
      resolve(running);
    };

    const running = (status: { isLoaded: boolean; currentTime: number }) =>
      status.isLoaded && status.currentTime > 0;

    subscription = target.addListener('playbackStatusUpdate', (status) => {
      if (running(status)) finish(true);
    });

    timer = setTimeout(() => finish(target.isLoaded && target.currentTime > 0), PROBE_MS);
  });
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
  if (nativeRinging) {
    nativeRinging = false;
    void stopPhoneTone();
  }
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // ignore dispose errors
  }
  player = null;
}

export type RingOutcome = {
  /** A tone is running. Whether it can be heard is the volume's business. */
  playing: boolean;
  /** True only while the tone borrowed from the phone is the one running. */
  usedChosenTone: boolean;
  /**
   * Which of the phone's volume sliders governs what is ringing. A tone played
   * natively is an alarm and answers to the alarm slider; anything through
   * expo-audio is ordinary media. The difference decides which slider to point
   * the user at when they say they heard nothing.
   */
  stream: 'alarm' | 'media';
};

/**
 * Try the phone's own tone through the native module.
 *
 * This goes first because it is the only route that works: Android reads a
 * content:// tone through its provider, which needs the app's own identity, and
 * expo-audio has no way to ask. It is also the only route onto the alarm stream.
 */
async function attemptPhoneTone(uri: string, mine: number): Promise<boolean> {
  const started = await playPhoneTone(uri);
  if (!started) return false;
  if (generation !== mine) {
    void stopPhoneTone();
    return false;
  }
  nativeRinging = true;
  return true;
}

/** Start `source` and wait to see whether it really runs. */
async function attempt(
  source: Parameters<typeof createAudioPlayer>[0],
  mine: number,
): Promise<boolean> {
  let candidate: AudioPlayer;
  try {
    candidate = startPlayer(source);
  } catch (err) {
    console.warn('[alarms] tone would not start', err);
    return false;
  }

  // Dismissed while this was starting: drop it and leave the field clear.
  if (generation !== mine) {
    try {
      candidate.pause();
      candidate.remove();
    } catch {
      // ignore
    }
    return false;
  }

  player = candidate;
  const running = await confirmRunning(candidate);
  return generation === mine && running;
}

/**
 * Start the looping alarm tone.
 *
 * Three routes, tried in order of how well they work: the phone's own tone
 * through the native module, the same tone through expo-audio for a build made
 * before that module existed, then the tone that ships with the app. The chosen
 * tone may have been deleted since it was picked, so the app's own is always
 * held in reserve — a reminder has to ring with something. Waiting for that
 * reserve to take over is why this is worth an await.
 */
export async function startAlarmSound(): Promise<RingOutcome> {
  const mine = ++generation;
  // A test burst may still have a stop pending; it must not cut this ring off.
  if (testTimer) {
    clearTimeout(testTimer);
    testTimer = null;
  }
  const silent: RingOutcome = { playing: false, usedChosenTone: false, stream: 'media' };

  // Whatever was ringing goes quiet first, or a second ring would sound over
  // the top of it.
  disposePlayer();

  if (toneUri && (await attemptPhoneTone(toneUri, mine))) {
    return { playing: true, usedChosenTone: true, stream: 'alarm' };
  }
  if (generation !== mine) return silent;

  await ensureAudioMode().catch(() => undefined);
  if (generation !== mine) return silent;

  if (toneUri) {
    // No native module in this build, or it would not have the tone. Worth one
    // try through expo-audio, which manages some of the plainer URIs.
    if (await attempt({ uri: toneUri }, mine)) {
      return { playing: true, usedChosenTone: true, stream: 'media' };
    }
    if (generation !== mine) return silent;
    console.warn('[alarms] chosen tone did not run, falling back to the built-in one');
    disposePlayer();
  }

  const running = await attempt(alarmSource, mine);
  return { playing: running, usedChosenTone: false, stream: 'media' };
}

/** Stop alarm tone immediately. */
export function stopAlarmSound() {
  generation += 1;
  if (testTimer) {
    clearTimeout(testTimer);
    testTimer = null;
  }
  disposePlayer();
}

export type TestRing = {
  /** A tone ran, so the phone is capable of ringing. */
  heard: boolean;
  /** False when the phone's tone was asked for and would not run. */
  usedChosenTone: boolean;
  /** The volume slider that governs what just rang. */
  stream: 'alarm' | 'media';
};

/**
 * Short test burst used from Alarm settings. The tone is already sounding while
 * the outcome is being worked out, so the wait costs nothing and the screen gets
 * to say which tone actually ran.
 */
export async function playTestAlarmSound(durationMs = 2000): Promise<TestRing> {
  const outcome = await startAlarmSound();
  if (!outcome.playing) {
    // A player that never got going may still be looping something inaudible.
    stopAlarmSound();
    return { heard: false, usedChosenTone: false, stream: outcome.stream };
  }

  if (testTimer) clearTimeout(testTimer);
  testTimer = setTimeout(() => {
    testTimer = null;
    stopAlarmSound();
  }, durationMs);
  return { heard: true, usedChosenTone: outcome.usedChosenTone, stream: outcome.stream };
}
