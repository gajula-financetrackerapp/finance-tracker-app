import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { askToUnlock, lockAvailability } from '../lib/appLock';
import { useT } from '../i18n/useT';

/**
 * How long the app may sit in the background before it asks again. Locking on
 * every flick to the notification shade is what makes people switch a lock off.
 */
const GRACE_MS = 30_000;

/**
 * An opaque cover over the whole app until the phone's own lock says yes.
 *
 * It covers rather than unmounts so that unlocking returns the user to the
 * screen they left, and it fails open: if the lock can no longer be asked for
 * (module missing in this build, screen lock removed in phone settings) the
 * cover lifts. Being unable to reach your own records is the worse bug.
 */
export function AppLockGate() {
  const { theme, config } = useApp();
  const { t } = useT();
  const on = config.appLock;

  // Locked before the first paint when the setting is on, so no frame of the
  // user's money shows while we ask the phone what it can do.
  const [locked, setLocked] = useState(on);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  // The system sheet pushes us out of 'active' on some phones, which would
  // otherwise look exactly like the user leaving the app.
  const prompting = useRef(false);
  const awaySince = useRef<number | null>(null);
  const coldStart = useRef(true);

  const appName = config.appName || 'Pulse Wallet';

  const prompt = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setBusy(true);
    const outcome = await askToUnlock({
      prompt: t('lock.prompt', { app: appName }),
      cancel: t('common.cancel'),
      usePin: t('lock.usePin'),
    });
    prompting.current = false;
    setBusy(false);
    if (outcome === 'failed') {
      setRefused(true);
      return;
    }
    setRefused(false);
    setLocked(false);
    awaySince.current = null;
  }, [appName, t]);

  // Cold start, and whenever the setting is switched on or off.
  useEffect(() => {
    const first = coldStart.current;
    coldStart.current = false;
    // Switching the lock on mid-session must not slam it shut: the settings
    // screen has just made the user prove who they are to enable it.
    if (!on || !first) {
      setLocked(false);
      return;
    }
    setLocked(true);
    let alive = true;
    void (async () => {
      const availability = await lockAvailability();
      if (!alive) return;
      if (availability !== 'ready') {
        setLocked(false);
        return;
      }
      void prompt();
    })();
    return () => {
      alive = false;
    };
    // prompt is intentionally left out: re-running it on every render of the
    // translator would re-open the sheet under the user's fingers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (prompting.current) return;
      if (state !== 'active') {
        if (awaySince.current === null) awaySince.current = Date.now();
        return;
      }
      const away = awaySince.current;
      awaySince.current = null;
      if (locked || away === null || Date.now() - away < GRACE_MS) return;
      setLocked(true);
      void prompt();
    });
    return () => sub.remove();
  }, [on, locked, prompt]);

  if (!on || !locked) return null;

  return (
    <View style={[styles.cover, { backgroundColor: theme.bg }]}>
      <Text style={styles.mark}>🔒</Text>
      <Text style={[styles.heading, { color: theme.ink }]}>
        {t('lock.heading', { app: appName })}
      </Text>
      <Text style={[styles.body, { color: theme.muted }]}>
        {refused ? t('lock.refused') : t('lock.body')}
      </Text>
      <Pressable
        onPress={() => void prompt()}
        disabled={busy}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: theme.primary,
            opacity: busy ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
        accessibilityRole="button"
      >
        <Text style={[styles.ctaText, { color: theme.onPrimary }]}>
          {refused ? t('lock.retry') : t('lock.cta')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  mark: { fontSize: 48 },
  heading: { fontWeight: '900', fontSize: 20, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cta: {
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
    minWidth: 180,
    alignItems: 'center',
  },
  ctaText: { fontWeight: '900', fontSize: 15 },
});
