import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { scryptAsync } from '@noble/hashes/scrypt';
import { bytesToUtf8, utf8ToBytes } from '@noble/hashes/utils';

const DEVICE_KEY_NAME = 'moneylit_workspace_key_v1';
const DEVICE_PREFIX = 'mlenc1:';
const BACKUP_FORMAT = 'moneylit-backup';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeUtf8(bytes: Uint8Array): string {
  return bytesToUtf8(bytes);
}

async function randomBytes(length: number): Promise<Uint8Array> {
  return new Uint8Array(await Crypto.getRandomBytesAsync(length));
}

async function deviceKey(create: boolean): Promise<Uint8Array | null> {
  const saved = await SecureStore.getItemAsync(DEVICE_KEY_NAME);
  if (saved) return base64ToBytes(saved);
  if (!create) return null;
  const key = await randomBytes(32);
  await SecureStore.setItemAsync(DEVICE_KEY_NAME, bytesToBase64(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

export function isDeviceEncryptedValue(value: string | null | undefined): boolean {
  return String(value || '').startsWith(DEVICE_PREFIX);
}

export async function encryptDeviceValue(value: string, storageKey: string): Promise<string> {
  if (isDeviceEncryptedValue(value)) return value;
  const key = await deviceKey(true);
  if (!key) throw new Error('Device encryption key unavailable');
  const nonce = await randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce, utf8ToBytes(storageKey));
  const ciphertext = cipher.encrypt(utf8ToBytes(value));
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return `${DEVICE_PREFIX}${bytesToBase64(combined)}`;
}

export async function decryptDeviceValue(value: string, storageKey: string): Promise<string> {
  if (!isDeviceEncryptedValue(value)) return value;
  const key = await deviceKey(false);
  if (!key) throw new Error('Encrypted local data cannot be opened on this device');
  const combined = base64ToBytes(value.slice(DEVICE_PREFIX.length));
  if (combined.length < 41) throw new Error('Encrypted local data is damaged');
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);
  const cipher = xchacha20poly1305(key, nonce, utf8ToBytes(storageKey));
  try {
    return decodeUtf8(cipher.decrypt(ciphertext));
  } catch {
    throw new Error('Encrypted local data is damaged or belongs to another device');
  }
}

export type EncryptedBackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  kdf: 'scrypt';
  kdfParams: { N: number; r: number; p: number; salt: string };
  cipher: 'xchacha20-poly1305';
  nonce: string;
  ciphertext: string;
};

export function isEncryptedBackupJson(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedBackupEnvelope>;
    return parsed.format === BACKUP_FORMAT && parsed.version === 1;
  } catch {
    return false;
  }
}

export async function encryptBackupJson(plainJson: string, password: string): Promise<string> {
  if (password.length < 8) throw new Error('Use at least 8 characters for the backup password');
  const salt = await randomBytes(16);
  const nonce = await randomBytes(24);
  const N = 2 ** 15;
  const r = 8;
  const p = 1;
  const key = await scryptAsync(password, salt, {
    N,
    r,
    p,
    dkLen: 32,
    maxmem: 64 * 1024 * 1024,
  });
  const cipher = xchacha20poly1305(key, nonce, utf8ToBytes(BACKUP_FORMAT));
  const ciphertext = cipher.encrypt(utf8ToBytes(plainJson));
  const envelope: EncryptedBackupEnvelope = {
    format: BACKUP_FORMAT,
    version: 1,
    kdf: 'scrypt',
    kdfParams: { N, r, p, salt: bytesToBase64(salt) },
    cipher: 'xchacha20-poly1305',
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackupJson(encryptedJson: string, password: string): Promise<string> {
  const envelope = JSON.parse(encryptedJson) as EncryptedBackupEnvelope;
  if (
    envelope.format !== BACKUP_FORMAT ||
    envelope.version !== 1 ||
    envelope.kdf !== 'scrypt' ||
    envelope.cipher !== 'xchacha20-poly1305'
  ) {
    throw new Error('Unsupported encrypted backup');
  }
  const { N, r, p, salt } = envelope.kdfParams || {};
  const nonce = base64ToBytes(envelope.nonce || '');
  const saltBytes = base64ToBytes(salt || '');
  if (
    N !== 2 ** 15 ||
    r !== 8 ||
    p !== 1 ||
    saltBytes.length !== 16 ||
    nonce.length !== 24 ||
    typeof envelope.ciphertext !== 'string' ||
    envelope.ciphertext.length < 24
  ) {
    throw new Error('Unsupported or invalid backup encryption parameters');
  }
  const key = await scryptAsync(password, saltBytes, {
    N,
    r,
    p,
    dkLen: 32,
    maxmem: 64 * 1024 * 1024,
  });
  const cipher = xchacha20poly1305(
    key,
    nonce,
    utf8ToBytes(BACKUP_FORMAT),
  );
  try {
    return decodeUtf8(cipher.decrypt(base64ToBytes(envelope.ciphertext)));
  } catch {
    throw new Error('Incorrect password or damaged backup');
  }
}
