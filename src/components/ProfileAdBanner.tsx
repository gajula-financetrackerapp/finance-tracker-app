import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { AdBannerConfig, AdCreative } from '../types';
import { useApp } from '../context/AppContext';

type Props = {
  config: AdBannerConfig;
  /** When set (Admin preview), only show this playlist index and skip auto-advance. */
  previewIndex?: number;
  onDismiss?: () => void;
  onInfo?: () => void;
  /** Compact preview in Admin (no dismiss / no rotation timer). */
  preview?: boolean;
  style?: StyleProp<ViewStyle>;
};

type Phase = 'video' | 'endcard';

function AdIntroVideo({
  uri,
  muted,
  onEnded,
}: {
  uri: string;
  muted: boolean;
  onEnded: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    try {
      player.play();
    } catch {
      // ignore
    }
  }, [player, uri]);

  useEventListener(player, 'playToEnd', onEnded);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function SingleAdCreative({
  ad,
  onEndCardShown,
  onDismiss,
  onInfo,
  preview,
}: {
  ad: AdCreative;
  /** Fires once when this creative reaches the end-card phase. */
  onEndCardShown?: () => void;
  onDismiss?: () => void;
  onInfo?: () => void;
  preview?: boolean;
}) {
  const { theme } = useApp();
  const hasVideo = ad.mediaType === 'video' && !!ad.mediaUri;
  const endImage =
    ad.endImageUri || (ad.mediaType === 'image' ? ad.mediaUri : null);

  const [phase, setPhase] = useState<Phase>(hasVideo ? 'video' : 'endcard');
  const [muted, setMuted] = useState(true);
  const [installed, setInstalled] = useState(false);
  const endCardNotified = useRef(false);

  useEffect(() => {
    setPhase(hasVideo ? 'video' : 'endcard');
    setMuted(true);
    endCardNotified.current = false;
  }, [hasVideo, ad.id, ad.mediaUri, ad.endImageUri]);

  useEffect(() => {
    if (phase !== 'endcard' || endCardNotified.current) return;
    endCardNotified.current = true;
    onEndCardShown?.();
  }, [phase, onEndCardShown]);

  useEffect(() => {
    const scheme = (ad.appScheme || '').trim();
    if (!scheme) {
      setInstalled(false);
      return;
    }
    let alive = true;
    void Linking.canOpenURL(scheme)
      .then((ok) => {
        if (alive) setInstalled(ok);
      })
      .catch(() => {
        if (alive) setInstalled(false);
      });
    return () => {
      alive = false;
    };
  }, [ad.appScheme]);

  const showingVideo = phase === 'video' && hasVideo;
  const ctaLabel = useMemo(() => {
    if ((ad.appScheme || '').trim()) return installed ? 'Open' : 'Install';
    return ad.buttonLabel || 'Open';
  }, [ad.appScheme, ad.buttonLabel, installed]);

  const openLink = () => {
    const scheme = (ad.appScheme || '').trim();
    const storeUrl = (ad.buttonUrl || '').trim();
    const target = installed && scheme ? scheme : storeUrl || scheme;
    if (!target) return;
    void Linking.openURL(target).catch(() => {
      if (storeUrl && target !== storeUrl) void Linking.openURL(storeUrl);
    });
  };

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: '#111',
          borderColor: theme.line,
          minHeight: 200,
        },
      ]}
    >
      {showingVideo && ad.mediaUri ? (
        <AdIntroVideo uri={ad.mediaUri} muted={muted} onEnded={() => setPhase('endcard')} />
      ) : null}

      {!showingVideo && endImage ? (
        <Image source={{ uri: endImage }} style={styles.media} resizeMode="cover" />
      ) : null}

      {!showingVideo && !endImage ? (
        <View style={[styles.media, { backgroundColor: theme.card }]} />
      ) : null}

      <View style={[styles.scrim, { opacity: showingVideo ? 0.15 : 0.35 }]} />

      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.top}>
          {showingVideo ? (
            <Pressable
              style={styles.muteChip}
              onPress={() => setMuted((m) => !m)}
              accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
            >
              <Text style={styles.muteText}>{muted ? '🔇' : '🔊'}</Text>
            </Pressable>
          ) : (
            <Text style={styles.badge}>Ad</Text>
          )}
          <View style={styles.actions}>
            {onInfo ? (
              <Pressable hitSlop={10} onPress={onInfo} accessibilityLabel="Ad info">
                <Text style={styles.actionIcon}>ⓘ</Text>
              </Pressable>
            ) : null}
            {onDismiss && !preview ? (
              <Pressable hitSlop={10} onPress={onDismiss} accessibilityLabel="Dismiss ad">
                <Text style={styles.actionIcon}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {!showingVideo ? (
          <>
            <View style={styles.endRow}>
              <View style={[styles.logo, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
                {endImage ? (
                  <Image source={{ uri: endImage }} style={styles.logoImg} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 22 }}>{ad.icon || '📣'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {ad.title}
                </Text>
                {(ad.appScheme || '').trim() ? (
                  <Text style={styles.status}>
                    {installed ? '✓ Installed' : ad.subtitle || 'Get the app'}
                  </Text>
                ) : ad.subtitle ? (
                  <Text style={styles.status} numberOfLines={2}>
                    {ad.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable style={[styles.cta, { backgroundColor: '#2F6FED' }]} onPress={openLink}>
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.skip} onPress={() => setPhase('endcard')}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Playlist of ads: video → end card → hold → next ad (loops).
 * Hold duration comes from `config.endCardHoldSec` (default 120s).
 */
export function ProfileAdBanner({
  config,
  previewIndex,
  onDismiss,
  onInfo,
  preview,
  style,
}: Props) {
  const items = config.items || [];
  const [index, setIndex] = useState(0);
  const holdMs = Math.max(5, config.endCardHoldSec || 120) * 1000;
  const rotate = !preview && previewIndex == null && items.length > 1;

  useEffect(() => {
    setIndex(0);
  }, [items.map((i) => i.id).join('|')]);

  const activeIndex =
    previewIndex != null
      ? Math.min(Math.max(0, previewIndex), Math.max(0, items.length - 1))
      : items.length
        ? index % items.length
        : 0;
  const creative = items[activeIndex];

  // After end-card appears, wait holdSec then advance to the next ad.
  const [endCardTick, setEndCardTick] = useState(0);
  useEffect(() => {
    if (!rotate || endCardTick === 0) return;
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % items.length);
    }, holdMs);
    return () => clearTimeout(timer);
  }, [endCardTick, rotate, holdMs, items.length]);

  if (!creative) return null;

  return (
    <View style={style}>
      <SingleAdCreative
        key={creative.id}
        ad={creative}
        preview={preview}
        onDismiss={onDismiss}
        onInfo={onInfo}
        onEndCardShown={() => {
          if (rotate) setEndCardTick((t) => t + 1);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  content: {
    padding: 14,
    minHeight: 200,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muteChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteText: { fontSize: 16 },
  badge: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionIcon: { color: 'rgba(255,255,255,0.95)', fontSize: 16, fontWeight: '700' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: { width: '100%', height: '100%' },
  title: { color: '#fff', fontWeight: '800', fontSize: 17 },
  status: { color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 3, fontWeight: '600' },
  cta: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  skip: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  skipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
