import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { findAvatarStyle, type AvatarStyleId } from '../data/avatars';

type Props = {
  /** User's starting initial (Classic). */
  initial?: string | null;
  /** Override; defaults to config.avatarStyle. */
  styleId?: AvatarStyleId | string | null;
  /** Show Premium character even when locked (picker preview). */
  preview?: boolean;
  /** Idle bob animation for illustrated characters. */
  animate?: boolean;
  size?: number;
  style?: ViewStyle;
};

/**
 * Profile avatar.
 * Classic = theme gradient + user initial.
 * Premium = illustrated characters (optional gentle idle motion).
 */
export function ProfileAvatar({
  initial,
  styleId,
  preview,
  animate = true,
  size = 44,
  style,
}: Props) {
  const { theme, config, isPremiumMember } = useApp();
  const def = findAvatarStyle(styleId ?? config.avatarStyle);
  const allowPremium = preview || isPremiumMember;
  const useCharacter = !!def.image && (def.access === 'free' || allowPremium);

  const letter = (initial || '?').trim().charAt(0).toUpperCase() || '?';
  const radius = size / 2;
  const header = theme.header;
  const accent = theme.dualTone ? theme.secondary || theme.accent : theme.accent;
  const end = theme.dualTone ? theme.headerEnd || accent : accent;

  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    bob.setValue(0);
    if (!useCharacter || !animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, useCharacter, animate, def.id]);

  const translateY = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2.5],
  });
  const scale = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });

  if (useCharacter && def.image) {
    return (
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: '#fff',
            transform: animate
              ? [{ translateY }, { scale }]
              : undefined,
          },
          style,
        ]}
      >
        <Image
          source={def.image}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      </Animated.View>
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius * 0.56,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[header, end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject]}
      />
      <View
        style={[
          styles.inner,
          {
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: size * 0.31,
          },
        ]}
      >
        <Text
          style={{
            color: header,
            fontSize: size * 0.34,
            lineHeight: size * 0.4,
            fontWeight: '900',
          }}
        >
          {letter}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
