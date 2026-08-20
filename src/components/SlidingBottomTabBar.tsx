import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { GoogleAdBanner } from './GoogleAdBanner';
import type { ThemeTokens } from '../types';

type TabLayout = { x: number; width: number };

const SLIDE_MS = 350;
const SLIDE_EASE = Easing.bezier(0.4, 0, 0.2, 1);

function isHiddenTab(itemStyle: unknown): boolean {
  if (!itemStyle || typeof itemStyle !== 'object' || Array.isArray(itemStyle)) return false;
  return (itemStyle as { display?: string }).display === 'none';
}

/**
 * Bottom tab bar with a sliding pill under the active tab (haptics_3.html motion).
 */
export function SlidingBottomTabBar({
  state,
  descriptors,
  navigation,
  showAds,
}: BottomTabBarProps & { showAds?: boolean }) {
  const { theme } = useApp();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const layouts = useRef<Record<string, TabLayout>>({});
  const [ready, setReady] = useState(false);
  const pillLeft = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const focusedRoute = state.routes[state.index];

  const routes = state.routes.filter(
    (route) => !isHiddenTab(descriptors[route.key].options.tabBarItemStyle),
  );

  useEffect(() => {
    const L = layouts.current[focusedRoute.key];
    if (!L || L.width <= 0) return;
    setReady(true);
    Animated.parallel([
      Animated.timing(pillLeft, {
        toValue: L.x,
        duration: SLIDE_MS,
        easing: SLIDE_EASE,
        useNativeDriver: false,
      }),
      Animated.timing(pillW, {
        toValue: L.width,
        duration: SLIDE_MS,
        easing: SLIDE_EASE,
        useNativeDriver: false,
      }),
    ]).start();
  }, [focusedRoute.key, pillLeft, pillW, state.index]);

  const onItemLayout = (key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts.current[key] = { x, width };
    if (key === focusedRoute.key) {
      pillLeft.setValue(x);
      pillW.setValue(width);
      setReady(true);
    }
  };

  return (
    <View>
      {showAds ? <GoogleAdBanner /> : null}
      <View style={[styles.bar, { paddingBottom: bottomPad, height: 56 + bottomPad }]}>
        {ready ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { left: pillLeft, width: pillW }]}
          />
        ) : null}
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = focusedRoute.key === route.key;
          const active = options.tabBarActiveTintColor || theme.header;
          // muted rather than faded ink: it is held to a readable contrast on
          // every theme, where a fixed alpha is only as good as the theme's ink.
          const inactive = options.tabBarInactiveTintColor || theme.muted;
          const color = focused ? active : inactive;

          let label = route.name;
          if (typeof options.tabBarLabel === 'string') label = options.tabBarLabel;
          else if (typeof options.title === 'string') label = options.title;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          const icon = options.tabBarIcon?.({ focused, color, size: 22 });
          const showLabel = typeof options.tabBarLabel !== 'function';

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || label}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              onLayout={(e) => onItemLayout(route.key, e)}
              style={styles.item}
            >
              <View style={styles.inner}>
                {icon}
                {showLabel ? (
                  <Text style={[styles.label, { color }]} numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
      backgroundColor: theme.card,
      overflow: 'visible',
      position: 'relative',
      zIndex: 2,
      elevation: 4,
    },
    pill: {
      position: 'absolute',
      top: 4,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.header + '1F',
      zIndex: 0,
    },
    item: {
      flex: 1,
      zIndex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'visible',
      minHeight: 48,
    },
    inner: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingTop: 2,
      minHeight: 44,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
    },
  });
}
