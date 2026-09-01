import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export type SlidingPillItem = {
  key: string;
  label: string;
  icon?: string;
  accessibilityLabel?: string;
  /** Count shown on the icon, e.g. pending split settlements. */
  badge?: number;
};

type Props = {
  items: SlidingPillItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** Track (background) style */
  trackStyle?: StyleProp<ViewStyle>;
  /** Sliding pill style */
  pillStyle?: StyleProp<ViewStyle>;
  /** Inactive label */
  labelStyle?: StyleProp<TextStyle>;
  /** Active label */
  labelActiveStyle?: StyleProp<TextStyle>;
  /** Inactive icon text */
  iconStyle?: StyleProp<TextStyle>;
  itemStyle?: StyleProp<ViewStyle>;
  /** Applied only to the tabs that are not selected, which the pill never covers. */
  itemIdleStyle?: StyleProp<ViewStyle>;
  /** Equal-width flex items (default true). */
  equalWidth?: boolean;
};

const SLIDE_MS = 350;
const SLIDE_EASE = Easing.bezier(0.4, 0, 0.2, 1);

/**
 * Segmented control with a sliding pill indicator (HTML haptics_3 tab style).
 */
export function SlidingPillTabs({
  items,
  selectedKey,
  onSelect,
  trackStyle,
  pillStyle,
  labelStyle,
  labelActiveStyle,
  iconStyle,
  itemStyle,
  itemIdleStyle,
  equalWidth = true,
}: Props) {
  const index = Math.max(
    0,
    items.findIndex((i) => i.key === selectedKey),
  );
  const [trackW, setTrackW] = useState(0);
  const anim = useRef(new Animated.Value(index)).current;
  const pad = 4;
  const gap = 4;
  const n = Math.max(items.length, 1);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: index,
      duration: SLIDE_MS,
      easing: SLIDE_EASE,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  const pillWidth = useMemo(() => {
    if (trackW <= 0 || n === 0) return 0;
    const inner = trackW - pad * 2 - gap * (n - 1);
    return inner / n;
  }, [trackW, n]);

  const translateX =
    items.length <= 1 || pillWidth <= 0
      ? 0
      : anim.interpolate({
          inputRange: items.map((_, i) => i),
          outputRange: items.map((_, i) => pad + i * (pillWidth + gap)),
          extrapolate: 'clamp',
        });

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.track, trackStyle]} onLayout={onTrackLayout}>
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            pillStyle,
            {
              width: pillWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}
      {items.map((item) => {
        const on = item.key === selectedKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={item.accessibilityLabel || item.label}
            onPress={() => onSelect(item.key)}
            style={[
              styles.item,
              equalWidth && styles.itemFlex,
              itemStyle,
              !on && itemIdleStyle,
            ]}
          >
            {item.icon ? (
              <View>
                <Text style={[styles.icon, iconStyle]}>{item.icon}</Text>
                {item.badge && item.badge > 0 ? (
                  <View style={styles.badge} pointerEvents="none">
                    <Text style={styles.badgeText}>
                      {item.badge > 9 ? '9+' : String(item.badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text
              style={[styles.label, labelStyle, on && styles.labelOn, on && labelActiveStyle]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Fade + slight rise when `activeKey` changes (tab content motion from the HTML demo).
 */
export function FadeSlideIn({
  activeKey,
  style,
  children,
}: {
  activeKey: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.setValue(0);
    translateY.setValue(4);
    scale.setValue(0.97);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_MS,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: SLIDE_MS,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeKey, opacity, scale, translateY]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    position: 'relative',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 11,
    zIndex: 0,
  },
  item: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
    gap: 2,
  },
  itemFlex: { flex: 1 },
  icon: { fontSize: 14 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D64545',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 12,
  },
  label: {
    fontWeight: '700',
    fontSize: 12,
  },
  labelOn: {},
});
