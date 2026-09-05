import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../i18n/useT';

type Props = {
  uri: string | null;
  onClose: () => void;
};

/** Full-screen bill / receipt. Tap ✕ (or the system back) to close. */
export function BillImageLightbox({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const visible = !!uri;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={[
            styles.closeBtn,
            {
              top: Math.max(insets.top, 12) + 4,
              right: Math.max(insets.right, 12),
            },
          ]}
        >
          <Text style={styles.closeMark}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,20,0.72)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
});
