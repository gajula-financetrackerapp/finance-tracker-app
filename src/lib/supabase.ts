import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  ADMIN_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isConfiguredAdminEmail,
  isSupabaseConfigured,
} from '../config';

export {
  ADMIN_EMAILS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isConfiguredAdminEmail,
  isSupabaseConfigured,
};

export const ADMIN_EMAIL = ADMIN_EMAILS[0] || '';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      try {
        return Promise.resolve(localStorage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
        return Promise.resolve();
      } catch {
        return Promise.resolve();
      }
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
        return Promise.resolve();
      } catch {
        return Promise.resolve();
      }
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type UserRole = 'user' | 'admin';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_premium?: boolean;
  premium_since?: string | null;
  premium_ended_at?: string | null;
  cloud_purge_at?: string | null;
  active_session_id?: string | null;
};
