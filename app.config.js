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

module.exports = {
  expo: {
    name: 'Pulse Wallet',
    slug: 'finance-tracker',
    version: '1.3.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'financetracker',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FFCD3C',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.financetracker.app',
    },
    android: {
      package: 'com.financetracker.app',
      softwareKeyboardLayoutMode: 'resize',
      adaptiveIcon: {
        backgroundColor: '#FFCD3C',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: 'VIEW',
          category: ['BROWSABLE', 'DEFAULT'],
          data: [{ scheme: 'financetracker' }],
        },
      ],
    },
    plugins: [
      '@react-native-community/datetimepicker',
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Pulse Wallet to attach bill photos from your library.',
          cameraPermission: 'Allow Pulse Wallet to snap bill photos.',
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
    },
  },
};
