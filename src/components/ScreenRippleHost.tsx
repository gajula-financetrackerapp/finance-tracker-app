import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, StyleSheet, View } from 'react-native';
import { useApp } from '../context/AppContext';

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  anim: Animated.Value;
};

type SpawnArgs = { x: number; y: number; color?: string };

let spawnImpl: ((args: SpawnArgs) => void) | null = null;
let nextId = 0;

/** Full-screen wave from the press point (no center fallback). */
export function spawnScreenRipple(x: number, y: number, color?: string) {
  if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
    return;
  }
  if (!spawnImpl) {
    console.warn('[screenRipple] host not mounted');
    return;
  }
  spawnImpl({ x, y, color });
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (full.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Renders in a transparent Modal so the wave sits above native-stack screens
 * and BottomSheet Modals (a plain absolute View is drawn underneath them).
 */
export function ScreenRippleHost() {
  const { theme } = useApp();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const mounted = useRef(true);
  const defaultColor = hexToRgba(theme.ink, 0.28);

  useEffect(() => {
    mounted.current = true;
    spawnImpl = ({ x, y, color }) => {
      if (!mounted.current) return;
      const { width, height } = Dimensions.get('window');
      // Grow enough to wash the screen from the finger (HTML scale≈4 feel).
      const size = Math.max(width, height) * 1.35;
      const id = ++nextId;
      const anim = new Animated.Value(0);
      setRipples((prev) => [
        ...prev,
        { id, x, y, size, color: color || defaultColor, anim },
      ]);
      Animated.timing(anim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !mounted.current) return;
        setRipples((prev) => prev.filter((r) => r.id !== id));
      });
    };
    return () => {
      mounted.current = false;
      spawnImpl = null;
    };
  }, [defaultColor]);

  return (
    <Modal
      visible={ripples.length > 0}
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
      onRequestClose={() => undefined}
    >
      <View pointerEvents="none" style={styles.layer} collapsable={false}>
        {ripples.map((r) => {
          const scale = r.anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.05, 1],
          });
          const opacity = r.anim.interpolate({
            inputRange: [0, 0.2, 1],
            outputRange: [0.7, 0.35, 0],
          });
          return (
            <Animated.View
              key={r.id}
              style={[
                styles.ripple,
                {
                  width: r.size,
                  height: r.size,
                  borderRadius: r.size / 2,
                  left: r.x - r.size / 2,
                  top: r.y - r.size / 2,
                  backgroundColor: r.color,
                  opacity,
                  transform: [{ scale }],
                },
              ]}
            />
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
  },
  ripple: {
    position: 'absolute',
  },
});
