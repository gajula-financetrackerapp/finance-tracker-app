import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DialogInsetView, SystemModal } from './SystemSafeArea';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

/** One addend of a worked sum: an operator, the figure, and what it is. */
export type InfoSumRow = { op?: '+' | '−'; value: string; label: string };

/**
 * A sum written out the way it would be on paper, so the figure on the screen
 * can be arrived at rather than taken on trust.
 */
export type InfoSum = {
  rows: InfoSumRow[];
  totalValue: string;
  totalLabel: string;
  /** Why the sum is drawn this way, printed under the rule. */
  note?: string;
};

type Props = {
  title: string;
  /** Paragraphs, in order. Kept apart so the wording can breathe. */
  body: string[];
  /** Worked sums, shown above the prose: they are what most people came for. */
  sums?: InfoSum[];
  icon?: string;
  /**
   * Where the dot sits. The card row is a dark panel, so its mark has to be
   * light; on a plain card it takes the muted ink like any other quiet detail.
   */
  tone?: 'onDark' | 'onLight';
  /** Read out in place of the bare letter i. */
  label?: string;
};

/**
 * A small "i" beside a figure, and the note it opens.
 *
 * Every figure on the summary is a sum of some rows and not others, and which
 * ones is a decision the screen itself cannot show. Rather than stretch the
 * labels until they are wrong, the reasoning sits one tap away, closed by the
 * cross in its corner or by pressing anywhere outside.
 */
export function InfoDot({ title, body, sums, icon = '💡', tone = 'onLight', label }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const onDark = tone === 'onDark';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={label || t('common.whatIsThis')}
        style={[styles.dot, onDark ? styles.dotOnDark : styles.dotOnLight]}
      >
        <Text style={[styles.dotText, onDark ? styles.dotTextOnDark : styles.dotTextOnLight]}>
          i
        </Text>
      </Pressable>

      <SystemModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* The dismiss layer is a sibling of the panel, not its parent: as an
            ancestor it competes with the note's own scrolling. */}
        <DialogInsetView style={styles.root}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.panel}>
            <View style={styles.head}>
              <Text style={styles.icon}>{icon}</Text>
              <Text style={styles.title}>{title}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                style={styles.close}
              >
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.bodyWrap}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator
            >
              {sums?.map((sum, s) => (
                <View key={`sum-${s}`} style={styles.sum}>
                  {sum.rows.map((row, r) => (
                    <View key={`row-${r}`} style={styles.sumRow}>
                      <Text style={styles.sumOp}>{row.op || ''}</Text>
                      <Text style={styles.sumValue}>{row.value}</Text>
                      <Text style={styles.sumLabel}>{row.label}</Text>
                    </View>
                  ))}
                  <View style={styles.sumRule} />
                  <View style={styles.sumRow}>
                    <Text style={styles.sumOp}>=</Text>
                    <Text style={[styles.sumValue, styles.sumTotalValue]}>{sum.totalValue}</Text>
                    <Text style={[styles.sumLabel, styles.sumTotalLabel]}>{sum.totalLabel}</Text>
                  </View>
                  {sum.note ? <Text style={styles.sumNote}>{sum.note}</Text> : null}
                </View>
              ))}

              {body.map((para, i) => (
                <Text key={i} style={[styles.body, i > 0 && styles.bodyNext]}>
                  {para}
                </Text>
              ))}
            </ScrollView>
          </View>
        </DialogInsetView>
      </SystemModal>
    </>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    // Kept a hair over the 10pt label it stands beside: the summary row must not
    // grow taller for the sake of a hint. hitSlop does the reaching instead.
    dot: {
      width: 13,
      height: 13,
      borderRadius: 7,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotOnDark: {
      borderColor: 'rgba(255,255,255,0.55)',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    dotOnLight: { borderColor: theme.muted, backgroundColor: 'transparent' },
    dotText: { fontSize: 9, lineHeight: 11, fontWeight: '800' },
    dotTextOnDark: { color: 'rgba(255,255,255,0.9)' },
    dotTextOnLight: { color: theme.muted },

    root: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 22,
      backgroundColor: 'rgba(15, 61, 62, 0.55)',
    },
    backdrop: { ...StyleSheet.absoluteFillObject },
    panel: {
      backgroundColor: theme.card,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
      maxHeight: '76%',
      shadowColor: '#0F3D3E',
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    // Room on the right for the cross, which floats in the panel's corner.
    head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 34 },
    icon: { fontSize: 20 },
    title: { flex: 1, fontSize: 17, fontWeight: '800', color: theme.ink },
    close: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSoft,
    },
    closeText: { fontSize: 14, fontWeight: '800', color: theme.ink },
    // Without a shrink the list keeps its full height and spills past the
    // panel's maxHeight, which reads as a note that simply refuses to scroll.
    bodyWrap: { marginTop: 12, flexShrink: 1 },
    bodyContent: { paddingBottom: 2 },
    body: { color: theme.muted, fontSize: 14, lineHeight: 21 },
    bodyNext: { marginTop: 10 },

    sum: {
      backgroundColor: theme.accentSoft,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    sumRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2 },
    sumOp: {
      width: 14,
      color: theme.muted,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '800',
    },
    // Figures line up under one another, so the column can be read as a sum.
    sumValue: {
      minWidth: 84,
      textAlign: 'right',
      color: theme.ink,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    sumLabel: {
      flex: 1,
      marginLeft: 10,
      color: theme.muted,
      fontSize: 12,
      lineHeight: 19,
    },
    sumRule: {
      height: 1,
      backgroundColor: theme.ink + '22',
      marginVertical: 5,
      marginLeft: 14,
    },
    sumTotalValue: { fontWeight: '800' },
    sumTotalLabel: { color: theme.ink, fontWeight: '700' },
    sumNote: {
      marginTop: 8,
      color: theme.muted,
      fontSize: 12,
      lineHeight: 18,
      fontStyle: 'italic',
    },
  });
}
