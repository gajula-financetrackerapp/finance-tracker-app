import { useCallback, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { useApp } from '../context/AppContext';
import { playUiFeedback, unlockFeedbackTone, type UiFeedbackStyle } from './uiFeedback';
import { spawnScreenRipple } from '../components/ScreenRippleHost';

type Point = GestureResponderEvent | { pageX: number; pageY: number };

function pointFrom(e?: Point): { x: number; y: number } | null {
  if (!e) return null;
  const ne = 'nativeEvent' in e ? e.nativeEvent : e;
  const x = (ne as { pageX?: number }).pageX;
  const y = (ne as { pageY?: number }).pageY;
  if (typeof x === 'number' && typeof y === 'number' && !Number.isNaN(x) && !Number.isNaN(y)) {
    return { x, y };
  }
  return null;
}

/**
 * Dormant: button sound & ripples was withdrawn, so nothing calls this and
 * `uiFeedbackStyle` has no screen that can leave 'off'. Kept, along with the
 * components it drives, in case the feature is brought back.
 *
 * Full-screen ripple on tap + optional sound when a style is selected.
 * Pass the press event (or `{ pageX, pageY }`) so the wave starts at the finger.
 */
export function useUiFeedbackTrigger() {
  const { config } = useApp();
  const style = config.uiFeedbackStyle;
  const soundOn = config.uiFeedbackSound !== false;
  const lastAt = useRef(0);

  return useCallback(
    (e?: Point, override?: UiFeedbackStyle) => {
      const now = Date.now();
      if (now - lastAt.current < 180) return;
      lastAt.current = now;

      const next = override || (style !== 'off' ? style : null);

      // Off → no sound and no screen wave.
      if (!next) return;

      // Sound first (Web Audio inject — immediate), then wave.
      if (soundOn) {
        unlockFeedbackTone();
        playUiFeedback(next);
      }
      const pt = pointFrom(e);
      if (pt) spawnScreenRipple(pt.x, pt.y);
    },
    [soundOn, style],
  );
}
