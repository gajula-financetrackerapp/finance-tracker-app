import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  setAppDialogPresenter,
  type AppDialogButton,
  type AppDialogOptions,
} from '../appDialog';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';

function buttonVisual(
  styles: ReturnType<typeof makeStyles>,
  btn: AppDialogButton,
  isMain: boolean,
) {
  if (btn.style === 'destructive') {
    return isMain
      ? { box: styles.btnDanger, text: styles.btnTextDanger }
      : { box: styles.btnDangerOutline, text: styles.btnTextDangerOutline };
  }
  if (btn.style === 'cancel') {
    return { box: styles.btnGhost, text: styles.btnTextGhost };
  }
  if (btn.style === 'primary' || isMain) {
    return { box: styles.btnPrimary, text: styles.btnTextPrimary };
  }
  return { box: styles.btnSecondary, text: styles.btnTextSecondary };
}

/**
 * Global host for styled info / confirm dialogs. Mount once near the root.
 */
export function AppDialogHost() {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<AppDialogOptions | null>(null);

  useEffect(() => {
    setAppDialogPresenter((next) => {
      setOpts(next);
      setVisible(true);
    });
    return () => setAppDialogPresenter(null);
  }, []);

  const close = () => setVisible(false);

  const runButton = (btn: AppDialogButton) => {
    close();
    requestAnimationFrame(() => {
      btn.onPress?.();
    });
  };

  const buttons =
    opts?.buttons && opts.buttons.length > 0
      ? opts.buttons
      : ([{ text: 'OK', style: 'primary' }] as AppDialogButton[]);

  const ordered = [
    ...buttons.filter((b) => b.style !== 'cancel'),
    ...buttons.filter((b) => b.style === 'cancel'),
  ];
  const mainIndex = ordered.findIndex(
    (b) => b.style === 'primary' || b.style === 'destructive' || b.style === 'default' || !b.style,
  );

  return (
    <Modal
      visible={visible && !!opts}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{opts?.icon || '💡'}</Text>
          </View>
          <Text style={styles.title}>{opts?.title}</Text>
          {opts?.message ? (
            <Text style={[styles.body, ordered.length <= 1 && styles.bodySingle]}>
              {opts.message}
            </Text>
          ) : (
            <View style={{ height: 12 }} />
          )}

          {ordered.map((btn, i) => {
            const isMain = i === (mainIndex >= 0 ? mainIndex : 0) && btn.style !== 'cancel';
            const visual = buttonVisual(styles, btn, isMain);
            return (
              <Pressable
                key={`${btn.text}-${i}`}
                style={[styles.btn, visual.box]}
                onPress={() => runButton(btn)}
              >
                <Text style={[styles.btnText, visual.text]}>{btn.text}</Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 61, 62, 0.55)',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 22,
      paddingHorizontal: 22,
      paddingTop: 26,
      paddingBottom: 18,
      shadowColor: '#0F3D3E',
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: theme.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 14,
    },
    icon: { fontSize: 26 },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.ink,
      textAlign: 'center',
    },
    body: {
      marginTop: 8,
      marginBottom: 12,
      color: theme.muted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    bodySingle: { marginBottom: 20 },
    btn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 8,
    },
    btnPrimary: { backgroundColor: theme.header },
    btnSecondary: {
      backgroundColor: theme.accentSoft,
      borderWidth: 1.5,
      borderColor: theme.accent + '55',
    },
    btnDanger: { backgroundColor: theme.red },
    btnDangerOutline: {
      backgroundColor: '#FDECEC',
      borderWidth: 1.5,
      borderColor: theme.red + '44',
    },
    btnGhost: { backgroundColor: 'transparent', marginBottom: 2 },
    btnText: { fontWeight: '800', fontSize: 16 },
    btnTextPrimary: { color: '#fff' },
    btnTextSecondary: { color: theme.header },
    btnTextDanger: { color: '#fff' },
    btnTextDangerOutline: { color: theme.red },
    btnTextGhost: { color: theme.muted, fontSize: 14, fontWeight: '700' },
  });
}
