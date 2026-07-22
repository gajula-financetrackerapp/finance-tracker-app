import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { DASHBOARD_HTML } from './src/dashboardHtml';
import { isSupabaseConfigured } from './src/lib/supabase';

function Dashboard() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const webRef = useRef<WebView>(null);

  const source = useMemo(
    () => ({
      html: DASHBOARD_HTML,
      baseUrl: Platform.OS === 'android' ? 'https://appassets.androidplatform.net/' : 'https://localhost/',
    }),
    [],
  );

  const injected = useMemo(() => {
    const payload = {
      email: user?.email || profile?.email || '',
      name: profile?.full_name || '',
      role: isAdmin ? 'admin' : 'user',
      isAdmin: !!isAdmin,
    };
    return `
      (function(){
        window.__FT_USER__ = ${JSON.stringify(payload)};
        function applyAuthUi(){
          var u = window.__FT_USER__ || {};
          var adminBtns = document.querySelectorAll('.admin-btn, [onclick="enterAdmin()"]');
          adminBtns.forEach(function(btn){
            if(!u.isAdmin){ btn.style.display = 'none'; }
            else { btn.style.display = ''; }
          });
          var topRight = document.querySelector('.tb-right');
          if(topRight && !document.getElementById('ftLogoutBtn')){
            var b = document.createElement('button');
            b.id = 'ftLogoutBtn';
            b.className = 'tb-btn';
            b.textContent = 'Logout';
            b.onclick = function(){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'logout'})); };
            topRight.appendChild(b);
          }
          var label = document.getElementById('appNameLabel');
          if(label && u.email){
            label.setAttribute('title', u.email + (u.isAdmin ? ' (admin)' : ''));
          }
        }
        applyAuthUi();
        var origEnterAdmin = window.enterAdmin;
        window.enterAdmin = function(){
          if(!(window.__FT_USER__ && window.__FT_USER__.isAdmin)){
            alert('Admin access only.');
            return;
          }
          if(typeof origEnterAdmin === 'function') return origEnterAdmin.apply(this, arguments);
        };
        var obs = new MutationObserver(applyAuthUi);
        obs.observe(document.body, { childList:true, subtree:true });
        true;
      })();
    `;
  }, [user?.email, profile?.full_name, profile?.email, isAdmin]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.authBar}>
        <Text style={styles.authBarText} numberOfLines={1}>
          {profile?.full_name || user?.email || 'Signed in'}
          {isAdmin ? ' · Admin' : ''}
        </Text>
        <Pressable onPress={() => signOut()} style={styles.logoutChip}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
      <View style={styles.webWrap}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={source}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          keyboardDisplayRequiresUserAction={false}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          injectedJavaScript={injected}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg?.type === 'logout') signOut();
            } catch {
              // ignore
            }
          }}
          onLoadEnd={() => {
            setLoading(false);
            webRef.current?.injectJavaScript(injected);
          }}
          onError={() => setLoading(false)}
        />
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#F5B700" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Root() {
  const { ready, session, configured } = useAuth();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#F5B700" />
        <Text style={styles.bootText}>Starting…</Text>
      </View>
    );
  }

  if (!configured) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootTitle}>Connect Supabase</Text>
        <Text style={styles.bootText}>
          Create a `.env` file from `.env.example` with your Supabase URL and anon key, then restart Expo.
        </Text>
        <Text style={[styles.bootText, { marginTop: 12 }]}>
          Configured: {isSupabaseConfigured ? 'yes' : 'no'}
        </Text>
      </View>
    );
  }

  if (!session) return <AuthScreen />;
  return <Dashboard />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  authBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEE',
  },
  authBarText: { flex: 1, color: '#1A1A1A', fontWeight: '700', fontSize: 13, marginRight: 10 },
  logoutChip: {
    borderWidth: 1.5,
    borderColor: '#ECECEE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  logoutText: { fontWeight: '800', color: '#1A1A1A', fontSize: 12 },
  webWrap: { flex: 1, backgroundColor: '#F6F6F8' },
  webview: { flex: 1, backgroundColor: '#F6F6F8' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F6F8',
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#F6F6F8',
  },
  bootTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', marginBottom: 10 },
  bootText: { color: '#8A8A8E', textAlign: 'center', lineHeight: 20 },
});
