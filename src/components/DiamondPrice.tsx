import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';

type Props = {
  cost: number;
  /** Struck-through "was" price. Ignored unless it is above `cost`. */
  listCost?: number;
  compact?: boolean;
  /** Overrides the ink color, for use on a filled pill or dark overlay. */
  color?: string;
};

/**
 * A diamond price tag: what it costs now, with the old price struck out beside
 * it. Admins set both numbers, and a list price at or below the real one is
 * treated as "no discount" and hidden.
 */
export function DiamondPrice({ cost, listCost = 0, compact = false, color }: Props) {
  const { theme } = useApp();
  const ink = color || theme.ink;
  const showList = listCost > cost;
  const size = compact ? 11 : 14;

  return (
    <View style={styles.row}>
      {showList ? (
        <Text
          style={[
            styles.list,
            { color: ink, fontSize: size - 1, opacity: color ? 0.7 : 0.55 },
          ]}
        >
          {listCost}
        </Text>
      ) : null}
      <Text style={[styles.cost, { color: ink, fontSize: size }]}>💎 {cost}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  list: { fontWeight: '700', textDecorationLine: 'line-through' },
  cost: { fontWeight: '900' },
});
