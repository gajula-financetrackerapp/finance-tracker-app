import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';

type FillProps = {
  style?: StyleProp<ViewStyle>;
};

/** Dual-tone gradient header — soft glow pulse on Premium (no sweep bar). */
export function PremiumHeaderFill({ style }: FillProps) {
  const { theme } = useApp();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    glow.setValue(0);
    if (!theme.premiumMotion || !theme.dualTone) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, theme.premiumMotion, theme.dualTone, theme.label]);

  const baseColors = theme.dualTone
    ? ([theme.header, theme.headerEnd] as const)
    : ([theme.header, theme.header] as const);

  return (
    <View style={[StyleSheet.absoluteFillObject, style]} pointerEvents="none">
      <LinearGradient
        colors={[...baseColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {theme.premiumMotion && theme.dualTone ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.12, 0.38],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', theme.secondary]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

type BreathProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Softly pulses FAB / accent between primary and secondary on Premium packs. */
export function BreathingAccent({ children, style }: BreathProps) {
  const { theme } = useApp();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse.setValue(0);
    if (!theme.premiumMotion || !theme.dualTone) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, theme.premiumMotion, theme.dualTone, theme.accent, theme.secondary]);

  const backgroundColor =
    theme.premiumMotion && theme.dualTone
      ? pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [theme.accent, theme.secondary],
        })
      : theme.accent;

  return (
    <Animated.View style={[style, { backgroundColor }]}>{children}</Animated.View>
  );
}

/** Brief shine when selecting a premium swatch. */
export function SparkleBurst({ active }: { active: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) return;
    opacity.setValue(0.9);
    scale.setValue(0.55);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.35,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, opacity, scale]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sparkle,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  sparkle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
