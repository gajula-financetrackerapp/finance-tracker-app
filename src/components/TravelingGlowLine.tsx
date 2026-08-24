import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { withAlpha } from '../utils/buildTheme';

const BLOB = 88;

/** A thin glowing rail with a highlight that travels left → right on a loop. */
export function TravelingGlowLine() {
  const { theme } = useApp();
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (width <= 0) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.stopAnimation();
    };
  }, [progress, width]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={styles.wrap}
      pointerEvents="none"
    >
      <View style={[styles.track, { backgroundColor: withAlpha(theme.primary, '66') }]} />
      <View style={[styles.halo, { backgroundColor: withAlpha(theme.primary, '28') }]} />
      {width > 0 ? (
        <Animated.View
          style={[
            styles.blob,
            {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-BLOB, width],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', theme.primary, '#FFFFFF', theme.primary, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 14,
    marginVertical: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  track: {
    height: 2,
    borderRadius: 2,
  },
  halo: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 3,
    height: 8,
    borderRadius: 8,
  },
  blob: {
    position: 'absolute',
    top: 2,
    width: BLOB,
    height: 10,
  },
});
