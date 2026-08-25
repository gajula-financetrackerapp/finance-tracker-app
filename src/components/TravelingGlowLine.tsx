import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '../context/AppContext';

/** A thin divider between Home sections. */
export function TravelingGlowLine() {
  const { theme } = useApp();

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.track, { backgroundColor: theme.line }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 1,
    marginVertical: 16,
    justifyContent: 'center',
  },
  track: {
    height: StyleSheet.hairlineWidth,
  },
});
