import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { formatAmountDigits } from '../utils';

export type DonutSlice = {
  name: string;
  value: number;
  color: string;
  /** Optional emoji/icon for callout bubbles around the ring. */
  icon?: string;
};

type ArcSeg = {
  color: string;
  start: number;
  end: number;
  mid: number;
  icon?: string;
  pct: number;
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

const MAX_CALLOUTS = 8;

/** Multi-category donut; optional callout bubbles (icon + %) around the ring. */
export function CategoryDonut({
  slices,
  size = 168,
  strokeWidth = 22,
  centerLabel,
  currencyCode = 'INR',
  showCallouts = false,
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  currencyCode?: string;
  /** When true, draw icon/% markers around slice midpoints (reference-style chart window). */
  showCallouts?: boolean;
}) {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const pad = showCallouts ? 52 : 0;
  const canvas = size + pad * 2;
  const cx = canvas / 2;
  const cy = canvas / 2;
  const r = (size - strokeWidth) / 2;

  const segs = useMemo((): ArcSeg[] => {
    if (total <= 0) return [];
    const positive = slices.filter((s) => s.value > 0);
    if (positive.length === 1) {
      const only = positive[0];
      return [
        {
          color: only.color,
          start: 0,
          end: 359.99,
          mid: 0,
          icon: only.icon,
          pct: 100,
        },
      ];
    }
    let angle = 0;
    return positive.map((s) => {
      const sweep = (s.value / total) * 360;
      const start = angle;
      const end = angle + Math.max(sweep, 0.5);
      const mid = start + (end - start) / 2;
      angle = end;
      return {
        color: s.color,
        start,
        end: Math.min(end, 359.99),
        mid,
        icon: s.icon,
        pct: Math.round((s.value / total) * 100),
      };
    });
  }, [slices, total]);

  const callouts = useMemo(() => {
    if (!showCallouts || segs.length === 0) return [];
    // Prefer largest slices when there are many categories.
    const ranked = [...segs].sort((a, b) => b.pct - a.pct).slice(0, MAX_CALLOUTS);
    const keep = new Set(ranked);
    return segs.filter((s) => keep.has(s));
  }, [segs, showCallouts]);

  const ringOuter = r + strokeWidth / 2;
  const calloutR = r + strokeWidth / 2 + 34;

  return (
    <View style={{ width: canvas, height: canvas, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={canvas} height={canvas}>
        <Circle cx={cx} cy={cy} r={r} stroke={theme.track} strokeWidth={strokeWidth} fill="none" />
        <G>
          {segs.length === 1 ? (
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={segs[0].color}
              strokeWidth={strokeWidth}
              fill="none"
            />
          ) : (
            segs.map((a, i) => (
              <Path
                key={`arc-${i}`}
                d={arcPath(cx, cy, r, a.start, a.end)}
                stroke={a.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="butt"
              />
            ))
          )}
        </G>
        {callouts.map((a, i) => {
          const from = polar(cx, cy, ringOuter + 2, a.mid);
          const to = polar(cx, cy, calloutR - 18, a.mid);
          return (
            <Line
              key={`line-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={a.color}
              strokeWidth={1.5}
              strokeOpacity={0.55}
            />
          );
        })}
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.centerText} numberOfLines={1}>
          {centerLabel ??
            formatAmountDigits(Math.round(total), currencyCode, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
        </Text>
      </View>

      {callouts.map((a, i) => {
        const p = polar(cx, cy, calloutR, a.mid);
        return (
          <View
            key={`callout-${i}`}
            pointerEvents="none"
            style={[
              styles.callout,
              {
                left: p.x - 22,
                top: p.y - 26,
              },
            ]}
          >
            <View style={[styles.calloutBubble, { backgroundColor: a.color + '22', borderColor: a.color }]}>
              <Text style={styles.calloutIcon}>{a.icon || '•'}</Text>
            </View>
            <Text style={[styles.calloutPct, { color: a.color }]}>{a.pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    center: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    centerText: {
      fontWeight: '800',
      fontSize: 17,
      color: theme.ink,
      textAlign: 'center',
    },
    callout: {
      position: 'absolute',
      width: 44,
      alignItems: 'center',
    },
    calloutBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      backgroundColor: theme.card,
    },
    calloutIcon: { fontSize: 15 },
    calloutPct: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '800',
    },
  });
}
