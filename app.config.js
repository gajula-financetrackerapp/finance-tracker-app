const path = require('path');

// Load .env if present (no extra dependency)
try {
  const fs = require('fs');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const i = trimmed.indexOf('=');
        if (i < 0) return;
        const key = trimmed.slice(0, i).trim();
        let val = trimmed.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      });
  }
} catch {
  // ignore
}

const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || undefined;

/** Google sample App IDs — replace via env for production AdMob apps. */
const admobAndroidAppId =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
const admobIosAppId =
  process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511';

module.exports = {
  expo: {
    name: 'Pulse Wallet',
    slug: 'finance-tracker',
    version: '1.3.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'financetracker',
    userInterfaceStyle: 'automatic',
    // Play Store / EAS: keep package id stable forever after first publish.
    primaryColor: '#FFCD3C',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FFCD3C',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.financetracker.app',
      buildNumber: '131',
    },
    android: {
      package: 'com.financetracker.app',
      versionCode: 131,
      softwareKeyboardLayoutMode: 'resize',
      adaptiveIcon: {
        backgroundColor: '#FFCD3C',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      // Required so Google/Supabase OAuth can return into the installed app.
      intentFilters: [
        {
          action: 'VIEW',
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            { scheme: 'financetracker' },
            { scheme: 'financetracker', host: 'auth', pathPrefix: '/callback' },
          ],
        },
      ],
      permissions: [
        'CAMERA',
        'READ_MEDIA_IMAGES',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'VIBRATE',
      ],
      blockedPermissions: ['RECORD_AUDIO'],
    },
    plugins: [
      '@react-native-community/datetimepicker',
      'expo-video',
      'expo-dev-client',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow Pulse Wallet to attach bill photos and ad banner media from your library.',
          cameraPermission: 'Allow Pulse Wallet to snap bill photos.',
        },
      ],
      googleIosUrlScheme
        ? [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: googleIosUrlScheme },
          ]
        : '@react-native-google-signin/google-signin',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: admobAndroidAppId,
          iosAppId: admobIosAppId,
        },
      ],
    ],
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      adminEmail: process.env.EXPO_PUBLIC_ADMIN_EMAIL || '',
      adminEmails:
        process.env.EXPO_PUBLIC_ADMIN_EMAILS ||
        process.env.EXPO_PUBLIC_ADMIN_EMAIL ||
        '',
      googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      admobAndroidAppId,
      admobIosAppId,
    },
  },
  // Required by the AdMob native package (must sit outside `expo`).
  'react-native-google-mobile-ads': {
    android_app_id: admobAndroidAppId,
    ios_app_id: admobIosAppId,
  },
};
