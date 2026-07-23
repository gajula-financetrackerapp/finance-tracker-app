import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme } from '../theme';
import { persistBillImage } from '../utils/billImage';

type CropBox = { x: number; y: number; w: number; h: number };

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onSave: (persistedUri: string) => void;
};

type AspectMode = 'free' | 'square' | 'receipt';

const MIN_CROP = 64;
const HANDLE_HIT = 52;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fitRect(imgW: number, imgH: number, viewW: number, viewH: number) {
  if (!imgW || !imgH || !viewW || !viewH) {
    return { scale: 1, dispW: 0, dispH: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(viewW / imgW, viewH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  return {
    scale,
    dispW,
    dispH,
    offsetX: (viewW - dispW) / 2,
    offsetY: (viewH - dispH) / 2,
  };
}

function defaultCrop(dispW: number, dispH: number, offsetX: number, offsetY: number): CropBox {
  const w = dispW * 0.86;
  const h = dispH * 0.86;
  return {
    x: offsetX + (dispW - w) / 2,
    y: offsetY + (dispH - h) / 2,
    w,
    h,
  };
}

function applyAspect(box: CropBox, mode: AspectMode, bounds: CropBox): CropBox {
  if (mode === 'free') return box;
  const ratio = mode === 'square' ? 1 : 3 / 4;
  let w = box.w;
  let h = w / ratio;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * ratio;
  }
  if (w > bounds.w) {
    w = bounds.w;
    h = w / ratio;
  }
  const x = clamp(box.x + (box.w - w) / 2, bounds.x, bounds.x + bounds.w - w);
  const y = clamp(box.y + (box.h - h) / 2, bounds.y, bounds.y + bounds.h - h);
  return { x, y, w, h };
}

/**
 * In-app bill cropper with a clear Save button (avoids broken system crop UI).
 */
export function BillImageEditor({ visible, uri, onCancel, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropBox | null>(null);
  const [aspect, setAspect] = useState<AspectMode>('free');
  const [rotation, setRotation] = useState(0);
  const [workingUri, setWorkingUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cropRef = useRef<CropBox | null>(null);
  const fitRef = useRef(fitRect(0, 0, 0, 0));
  const dragMode = useRef<'move' | 'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const dragOrigin = useRef<CropBox | null>(null);

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    if (!visible || !uri) return;
    setRotation(0);
    setAspect('free');
    setWorkingUri(uri);
    setCrop(null);
    setNatural({ w: 0, h: 0 });
    Image.getSize(
      uri,
      (w, h) => setNatural({ w, h }),
      () => Alert.alert('Image', 'Could not load this image.'),
    );
  }, [visible, uri]);

  const fit = useMemo(
    () => fitRect(natural.w, natural.h, viewSize.w, viewSize.h),
    [natural, viewSize],
  );

  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);

  useEffect(() => {
    if (!visible || !fit.dispW || !fit.dispH) return;
    const bounds: CropBox = {
      x: fit.offsetX,
      y: fit.offsetY,
      w: fit.dispW,
      h: fit.dispH,
    };
    setCrop((prev) => {
      if (prev) return applyAspect(prev, aspect, bounds);
      return applyAspect(defaultCrop(fit.dispW, fit.dispH, fit.offsetX, fit.offsetY), aspect, bounds);
    });
  }, [visible, fit.dispW, fit.dispH, fit.offsetX, fit.offsetY, aspect]);

  const imageBounds = useMemo(
    (): CropBox => ({
      x: fit.offsetX,
      y: fit.offsetY,
      w: fit.dispW,
      h: fit.dispH,
    }),
    [fit],
  );

  const constrain = useCallback(
    (raw: CropBox): CropBox => {
      const b = imageBounds;
      let { x, y, w, h } = raw;
      if (w < 0) {
        x += w;
        w = -w;
      }
      if (h < 0) {
        y += h;
        h = -h;
      }
      w = clamp(w, MIN_CROP, b.w);
      h = clamp(h, MIN_CROP, b.h);
      if (aspect === 'square') {
        const s = Math.min(w, h, b.w, b.h);
        w = s;
        h = s;
      } else if (aspect === 'receipt') {
        const ratio = 3 / 4;
        if (w / h > ratio) w = h * ratio;
        else h = w / ratio;
        w = clamp(w, MIN_CROP, b.w);
        h = clamp(h, MIN_CROP, b.h);
      }
      x = clamp(x, b.x, b.x + b.w - w);
      y = clamp(y, b.y, b.y + b.h - h);
      return { x, y, w, h };
    },
    [aspect, imageBounds],
  );

  const hitTest = useCallback((x: number, y: number, box: CropBox) => {
    const corners: { id: 'tl' | 'tr' | 'bl' | 'br'; cx: number; cy: number }[] = [
      { id: 'tl', cx: box.x, cy: box.y },
      { id: 'tr', cx: box.x + box.w, cy: box.y },
      { id: 'bl', cx: box.x, cy: box.y + box.h },
      { id: 'br', cx: box.x + box.w, cy: box.y + box.h },
    ];
    const hit = HANDLE_HIT / 2;
    for (const c of corners) {
      if (Math.abs(x - c.cx) <= hit && Math.abs(y - c.cy) <= hit) return c.id;
    }
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return 'move';
    return null;
  }, []);

  const cropPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const box = cropRef.current;
          if (!box) {
            dragMode.current = null;
            return;
          }
          const { locationX, locationY } = e.nativeEvent;
          dragMode.current = hitTest(locationX, locationY, box);
          dragOrigin.current = { ...box };
        },
        onPanResponderMove: (_e, g) => {
          const mode = dragMode.current;
          const start = dragOrigin.current;
          if (!mode || !start) return;
          const dx = g.dx;
          const dy = g.dy;
          let next: CropBox = start;
          if (mode === 'move') {
            next = { ...start, x: start.x + dx, y: start.y + dy };
          } else if (mode === 'tl') {
            next = { x: start.x + dx, y: start.y + dy, w: start.w - dx, h: start.h - dy };
          } else if (mode === 'tr') {
            next = { x: start.x, y: start.y + dy, w: start.w + dx, h: start.h - dy };
          } else if (mode === 'bl') {
            next = { x: start.x + dx, y: start.y, w: start.w - dx, h: start.h + dy };
          } else if (mode === 'br') {
            next = { x: start.x, y: start.y, w: start.w + dx, h: start.h + dy };
          }
          setCrop(constrain(next));
        },
        onPanResponderRelease: () => {
          dragMode.current = null;
          dragOrigin.current = null;
        },
        onPanResponderTerminate: () => {
          dragMode.current = null;
          dragOrigin.current = null;
        },
      }),
    [constrain, hitTest],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewSize({ w: width, h: height });
  };

  const rotate = async () => {
    if (!workingUri || busy) return;
    setBusy(true);
    try {
      const nextRot = (rotation + 90) % 360;
      const result = await ImageManipulator.manipulateAsync(
        workingUri,
        [{ rotate: 90 }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      setWorkingUri(result.uri);
      setRotation(nextRot);
      setNatural({ w: result.width, h: result.height });
      setCrop(null);
    } catch {
      Alert.alert('Rotate', 'Could not rotate this image.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!workingUri || !crop || busy) return;
    const f = fitRef.current;
    if (!f.scale) return;
    setBusy(true);
    try {
      const originX = Math.round((crop.x - f.offsetX) / f.scale);
      const originY = Math.round((crop.y - f.offsetY) / f.scale);
      const width = Math.round(crop.w / f.scale);
      const height = Math.round(crop.h / f.scale);

      const safeX = clamp(originX, 0, Math.max(0, natural.w - 1));
      const safeY = clamp(originY, 0, Math.max(0, natural.h - 1));
      const safeW = clamp(width, 1, natural.w - safeX);
      const safeH = clamp(height, 1, natural.h - safeY);

      const result = await ImageManipulator.manipulateAsync(
        workingUri,
        [{ crop: { originX: safeX, originY: safeY, width: safeW, height: safeH } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      const persisted = await persistBillImage(result.uri);
      onSave(persisted);
    } catch {
      Alert.alert('Save', 'Could not crop and save this image.');
    } finally {
      setBusy(false);
    }
  };

  const saveFull = async () => {
    if (!workingUri || busy) return;
    setBusy(true);
    try {
      const persisted = await persistBillImage(workingUri);
      onSave(persisted);
    } catch {
      Alert.alert('Save', 'Could not save this image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8} disabled={busy}>
            <Text style={styles.headerBtn}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Crop & adjust</Text>
          <Pressable onPress={() => void save()} hitSlop={8} disabled={busy || !crop}>
            <Text style={[styles.headerBtn, styles.saveBtn]}>{busy ? '…' : 'Save'}</Text>
          </Pressable>
        </View>

        <View style={styles.stage} onLayout={onLayout} {...cropPan.panHandlers}>
          {workingUri ? (
            <View style={styles.image} pointerEvents="none">
              <Image
                source={{ uri: workingUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            </View>
          ) : null}

          {crop && fit.dispW > 0 ? (
            <>
              <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: crop.y }]} />
              <View
                pointerEvents="none"
                style={[styles.dim, { top: crop.y + crop.h, left: 0, right: 0, bottom: 0 }]}
              />
              <View
                pointerEvents="none"
                style={[styles.dim, { top: crop.y, left: 0, width: crop.x, height: crop.h }]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.dim,
                  { top: crop.y, left: crop.x + crop.w, right: 0, height: crop.h },
                ]}
              />

              <View
                pointerEvents="none"
                style={[
                  styles.cropBox,
                  { left: crop.x, top: crop.y, width: crop.w, height: crop.h },
                ]}
              >
                <View style={styles.gridH} />
                <View style={[styles.gridH, { top: '66.66%' }]} />
                <View style={styles.gridV} />
                <View style={[styles.gridV, { left: '66.66%' }]} />
              </View>

              {/* Handles drawn on top — gestures use hit-testing on the stage */}
              <View
                pointerEvents="none"
                style={[styles.handle, { left: crop.x - 14, top: crop.y - 14 }]}
              />
              <View
                pointerEvents="none"
                style={[styles.handle, { left: crop.x + crop.w - 14, top: crop.y - 14 }]}
              />
              <View
                pointerEvents="none"
                style={[styles.handle, { left: crop.x - 14, top: crop.y + crop.h - 14 }]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.handle,
                  { left: crop.x + crop.w - 14, top: crop.y + crop.h - 14 },
                ]}
              />
            </>
          ) : null}

          {busy ? (
            <View style={styles.busy} pointerEvents="none">
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </View>

        <Text style={styles.hint}>Drag the box to move · pull corners to resize</Text>

        <View style={styles.aspectRow}>
          {(
            [
              ['free', 'Free'],
              ['square', 'Square'],
              ['receipt', 'Receipt'],
            ] as const
          ).map(([id, label]) => {
            const on = aspect === id;
            return (
              <Pressable
                key={id}
                onPress={() => setAspect(id)}
                style={[styles.aspectChip, on && styles.aspectChipOn]}
              >
                <Text style={[styles.aspectText, on && styles.aspectTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.secondaryBtn} onPress={() => void rotate()} disabled={busy}>
            <Text style={styles.secondaryText}>↻ Rotate</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void saveFull()} disabled={busy}>
            <Text style={styles.secondaryText}>Save full</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={() => void save()} disabled={busy || !crop}>
            <Text style={styles.primaryText}>Save crop</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1211' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headerBtn: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 15, minWidth: 56 },
  saveBtn: { color: theme.accent, fontWeight: '800', textAlign: 'right' },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: 'visible',
    backgroundColor: '#000',
  },
  image: { ...StyleSheet.absoluteFillObject },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: theme.accent,
    backgroundColor: 'transparent',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  handle: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.accent,
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 5,
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 10,
    fontWeight: '600',
  },
  aspectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  aspectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  aspectChipOn: { backgroundColor: theme.accentSoft },
  aspectText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13 },
  aspectTextOn: { color: theme.header },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  secondaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  primaryBtn: {
    flex: 1.2,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.accent,
  },
  primaryText: { color: theme.header, fontWeight: '900', fontSize: 14 },
});
