import { useCallback, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { useApp } from '../context/AppContext';
import { canAccessPremiumFeature } from './premiumFeatures';
import { playUiFeedback, type UiFeedbackStyle } from './uiFeedback';
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
 * Full-screen ripple on tap + sound when a style is selected and unlocked.
 */
export function useUiFeedbackTrigger() {
  const { config, isPremiumMember } = useApp();
  const featureOn = config.features.buttonFeedback !== false;
  const allowed =
    featureOn &&
    canAccessPremiumFeature('feedback', isPremiumMember, config.premiumFeatures);
  const style = config.uiFeedbackStyle;
  const lastAt = useRef(0);

  return useCallback(
    (e?: Point, override?: UiFeedbackStyle) => {
      if (!featureOn) return;
      const now = Date.now();
      if (now - lastAt.current < 180) return;
      lastAt.current = now;

      const next =
        override ||
        (allowed && style !== 'off' ? style : null);

      // Sound first (more reliable), then wave
      if (next) void playUiFeedback(next);

      const pt = pointFrom(e);
      spawnScreenRipple(pt?.x ?? NaN, pt?.y ?? NaN);
    },
    [allowed, featureOn, style],
  );
}
