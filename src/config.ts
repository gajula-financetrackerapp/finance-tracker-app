import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  adminEmails?: string;
  adminEmail?: string;
};

const extra = (Constants.expoConfig?.extra || {}) as Extra;

/**
 * Client-safe config. Supabase anon/publishable keys are meant for the app.
 * Prefer EXPO_PUBLIC_* / app.config.js extra; keep hardcoded fallbacks so
 * Expo Go still shows Login even if .env wasn't loaded.
 */
const FALLBACK_URL = 'https://egbcgwqhwubiasiuxekr.supabase.co';
const FALLBACK_KEY = 'sb_publishable_vFw0kUPqUu6LO-yrVX7gmg_FGd4UefX';
const FALLBACK_ADMINS = 'g.ramkumar3127@gmail.com,lakshmankumar586@gmail.com';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  extra.supabaseUrl ||
  FALLBACK_URL;

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  extra.supabaseAnonKey ||
  FALLBACK_KEY;

const adminEmailsRaw =
  process.env.EXPO_PUBLIC_ADMIN_EMAILS ||
  process.env.EXPO_PUBLIC_ADMIN_EMAIL ||
  extra.adminEmails ||
  extra.adminEmail ||
  FALLBACK_ADMINS;

export const ADMIN_EMAILS = adminEmailsRaw
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function isConfiguredAdminEmail(email?: string | null) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
