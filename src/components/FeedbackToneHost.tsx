import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { bindFeedbackToneBridge } from '../lib/uiFeedback';

/**
 * Hidden Web Audio bridge — synthesizes Pulse Pop / Sunset Chime / Neon Beep /
 * Deep Buzz instantly (same oscillator approach as haptics_1.html).
 * expo-audio file playback was consistently ~1s late vs the ripple.
 */
const TONE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body>
<script>
(function () {
  var STYLES = {
    pop:   { freq: 440,    type: 'sine',     dur: 0.12 },
    chime: { freq: 587.33, type: 'triangle', dur: 0.14 },
    beep:  { freq: 330,    type: 'square',   dur: 0.12 },
    buzz:  { freq: 220,    type: 'sawtooth', dur: 0.16 }
  };
  var ctx = null;

  function ensure() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  window.unlockTone = function () {
    ensure();
  };

  window.playTone = function (style) {
    var spec = STYLES[style] || STYLES.pop;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, t0);
    gain.gain.setValueAtTime(0.14, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + spec.dur + 0.02);
  };

  function pingReady() {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage('ready');
      }
    } catch (e) {}
  }

  ensure();
  pingReady();
  setTimeout(pingReady, 50);
})();
</script>
</body>
</html>`;

export function FeedbackToneHost() {
  const ref = useRef<WebViewType>(null);

  const onReady = useCallback(() => {
    const view = ref.current;
    if (!view) return;
    bindFeedbackToneBridge((js) => {
      view.injectJavaScript(js);
    }, true);
    view.injectJavaScript(`try{unlockTone()}catch(e){};true;`);
  }, []);

  useEffect(() => {
    return () => bindFeedbackToneBridge(null, false);
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none" collapsable={false}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: TONE_HTML }}
        onLoadEnd={onReady}
        onMessage={() => onReady()}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        {...(Platform.OS === 'android'
          ? { mixedContentMode: 'always' as const }
          : {})}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
});
