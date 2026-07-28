import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { unlockFeedbackTone } from '../lib/uiFeedback';
import { useUiFeedbackTrigger } from '../lib/useUiFeedbackTrigger';

const MOVE_CANCEL_PX = 14;
const MAX_TAP_MS = 450;

/**
 * App-wide quick-tap listener. When a feedback style is on, any short tap
 * (settings rows, chips, plain Pressables, etc.) gets the screen wave + sound.
 * Scrolls / long-presses are ignored. Buttons that already call
 * useUiFeedbackTrigger are deduped via its debounce.
 *
 * Note: React Native Modals are separate windows — use RipplePressable /
 * triggerFeedback inside sheets for those.
 */
export function UiFeedbackRoot({ children }: { children: React.ReactNode }) {
  const trigger = useUiFeedbackTrigger();
  const pending = useRef<{ x: number; y: number; t: number } | null>(null);
  const moved = useRef(false);

  return (
    <View
      style={styles.root}
      onTouchStart={(e) => {
        // Unlock Web Audio on the gesture — required on iOS before the first tone.
        unlockFeedbackTone();
        const t = e.nativeEvent.touches[0];
        if (!t) return;
        moved.current = false;
        pending.current = { x: t.pageX, y: t.pageY, t: Date.now() };
      }}
      onTouchMove={(e) => {
        const t = e.nativeEvent.touches[0];
        const p = pending.current;
        if (!t || !p) return;
        if (Math.hypot(t.pageX - p.x, t.pageY - p.y) > MOVE_CANCEL_PX) {
          moved.current = true;
        }
      }}
      onTouchEnd={(e) => {
        const p = pending.current;
        pending.current = null;
        if (!p || moved.current) return;
        if (Date.now() - p.t > MAX_TAP_MS) return;
        const t = e.nativeEvent.changedTouches[0];
        trigger({ pageX: t?.pageX ?? p.x, pageY: t?.pageY ?? p.y });
      }}
      onTouchCancel={() => {
        pending.current = null;
        moved.current = false;
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
