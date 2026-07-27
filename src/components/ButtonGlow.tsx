import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useApp } from '../context/AppContext';
import { canAccessPremiumFeature } from '../lib/premiumFeatures';

/**
 * Glow is on when Button feedback Premium feature is unlocked
 * and a style (not Off) is selected — same gate as sound.
 */
export function useButtonGlow(danger?: boolean) {
  const { theme, config, isPremiumMember } = useApp();
  const featureOn = config.features.buttonFeedback !== false;
  const allowed =
    featureOn &&
    canAccessPremiumFeature('feedback', isPremiumMember, config.premiumFeatures);
  const active = allowed && config.uiFeedbackStyle !== 'off';
  const color = danger ? theme.red : theme.header || theme.accent || '#3b82f6';

  return { glowOn: active, glowColor: color, theme, allowed };
}

type HaloProps = {
  color: string;
  active: boolean;
  radius?: number;
};

/**
 * Visible outer glow ring (haptics_2.html style).
 * Extends past the button so it isn’t clipped / invisible.
 */
export function ButtonGlowHalo({ color, active, radius = 12 }: HaloProps) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    pulse.setValue(0.35);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.haloOuter,
          {
            borderRadius: radius + 6,
            backgroundColor: color,
            opacity: pulse,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.haloRing,
          {
            borderRadius: radius + 2,
            borderColor: color,
          },
        ]}
      />
    </>
  );
}

export function buttonGlowShadow(color: string, on: boolean): ViewStyle {
  if (!on) return {};
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Platform.OS === 'ios' ? 0.85 : 0.6,
    shadowRadius: 14,
    elevation: 10,
  };
}

/** Styles for a selected calendar cell with glow (haptics_2). */
export function selectedGlowCellStyle(color: string, on: boolean): ViewStyle {
  if (!on) return {};
  return {
    backgroundColor: color,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 12,
    elevation: 10,
    transform: [{ scale: 1.06 }],
    zIndex: 2,
  };
}

const styles = StyleSheet.create({
  haloOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  haloRing: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 2,
    zIndex: 0,
    opacity: 0.85,
  },
});

export function GlowWrap({
  active,
  color,
  radius,
  style,
  children,
}: {
  active: boolean;
  color: string;
  radius?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          position: 'relative',
          overflow: 'visible',
          // Halo sits in padding; negative margin keeps the layout box = button size
          paddingVertical: 8,
          paddingHorizontal: 8,
          marginVertical: -8,
          marginHorizontal: -8,
        },
        style,
      ]}
    >
      <ButtonGlowHalo color={color} active={active} radius={radius} />
      <View style={{ zIndex: 1, alignSelf: 'stretch' }}>{children}</View>
    </View>
  );
}
