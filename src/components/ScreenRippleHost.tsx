import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

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

/** Full-screen wave from tap point (HTML ripple-layer style). */
export function spawnScreenRipple(x: number, y: number, color = 'rgba(255,255,255,0.4)') {
  if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
    const { width, height } = Dimensions.get('window');
    x = width / 2;
    y = height / 2;
  }
  if (!spawnImpl) {
    console.warn('[screenRipple] host not mounted');
    return;
  }
  spawnImpl({ x, y, color });
}

/**
 * Full-window overlay (no Modal — Modals were eating taps / fighting BottomSheets).
 * Mount as the last child of the root flex:1 shell.
 */
export function ScreenRippleHost() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    spawnImpl = ({ x, y, color }) => {
      if (!mounted.current) return;
      const { width, height } = Dimensions.get('window');
      const size = Math.max(width, height) * 2.4;
      const id = ++nextId;
      const anim = new Animated.Value(0);
      setRipples((prev) => [
        ...prev,
        { id, x, y, size, color: color || 'rgba(255,255,255,0.4)', anim },
      ]);
      Animated.timing(anim, {
        toValue: 1,
        duration: 700,
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
  }, []);

  return (
    <View pointerEvents="none" style={styles.layer} collapsable={false}>
      {ripples.map((r) => {
        const scale = r.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.06, 1],
        });
        const opacity = r.anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0.55, 0.28, 0],
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
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  ripple: {
    position: 'absolute',
  },
});
