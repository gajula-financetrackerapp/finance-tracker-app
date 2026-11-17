const { xchacha20poly1305 } = require('@noble/ciphers/chacha');
const { scrypt } = require('@noble/hashes/scrypt');
const { utf8ToBytes, bytesToUtf8 } = require('@noble/hashes/utils');

const ok = (name, condition) => {
  if (!condition) throw new Error(name);
  console.log(`ok  ${name}`);
};

const message = JSON.stringify({
  amount: 9500,
  merchant: 'Private merchant',
  transactions: [{ id: 'txn-1' }],
});
const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const nonce = Uint8Array.from({ length: 24 }, (_, index) => index + 31);
const aad = utf8ToBytes('aio_finance_v2');
const sealed = xchacha20poly1305(key, nonce, aad).encrypt(utf8ToBytes(message));
const opened = bytesToUtf8(xchacha20poly1305(key, nonce, aad).decrypt(sealed));
ok('workspace authenticated encryption round-trips', opened === message);
ok('workspace ciphertext contains no merchant text', !bytesToUtf8(sealed).includes('Private merchant'));

const salt = utf8ToBytes('0123456789abcdef');
const derived = scrypt('correct horse battery staple', salt, {
  N: 2 ** 10,
  r: 8,
  p: 1,
  dkLen: 32,
});
const wrong = scrypt('wrong password', salt, { N: 2 ** 10, r: 8, p: 1, dkLen: 32 });
const backupNonce = Uint8Array.from({ length: 24 }, (_, index) => 255 - index);
const backup = xchacha20poly1305(derived, backupNonce).encrypt(utf8ToBytes(message));
ok(
  'password-encrypted backup round-trips',
  bytesToUtf8(xchacha20poly1305(derived, backupNonce).decrypt(backup)) === message,
);
let wrongPasswordRejected = false;
try {
  xchacha20poly1305(wrong, backupNonce).decrypt(backup);
} catch {
  wrongPasswordRejected = true;
}
ok('wrong backup password is rejected', wrongPasswordRejected);

console.log('\nall encryption checks passed');
