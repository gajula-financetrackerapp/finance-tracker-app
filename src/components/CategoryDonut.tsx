import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { theme } from '../theme';

export type DonutSlice = {
  name: string;
  value: number;
  color: string;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

/** Multi-category donut built with SVG arcs (replaces the old fake border ring). */
export function CategoryDonut({
  slices,
  size = 128,
  strokeWidth = 18,
  centerLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    // Single full category → draw a full circle (arc can't self-close at 360°)
    if (slices.length === 1 || slices.filter((s) => s.value > 0).length === 1) {
      const only = slices.find((s) => s.value > 0)!;
      return [{ type: 'full' as const, color: only.color }];
    }
    let angle = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * 360;
        const start = angle;
        const end = angle + Math.max(sweep, 0.5);
        angle = end;
        return {
          type: 'arc' as const,
          color: s.color,
          d: arcPath(cx, cy, r, start, Math.min(end, 359.99)),
        };
      });
  }, [slices, total, cx, cy, r]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={theme.track} strokeWidth={strokeWidth} fill="none" />
        <G>
          {arcs.map((a, i) =>
            a.type === 'full' ? (
              <Circle
                key={`full-${i}`}
                cx={cx}
                cy={cy}
                r={r}
                stroke={a.color}
                strokeWidth={strokeWidth}
                fill="none"
              />
            ) : (
              <Path
                key={`arc-${i}`}
                d={a.d}
                stroke={a.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="butt"
              />
            ),
          )}
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.centerText} numberOfLines={1}>
          {centerLabel ?? Math.round(total).toLocaleString('en-IN')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  centerText: {
    fontWeight: '800',
    fontSize: 16,
    color: theme.ink,
    textAlign: 'center',
  },
});
