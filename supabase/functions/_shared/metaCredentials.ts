const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function encryptionKey(value: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(value);
  if (bytes.length !== 32) throw new Error('META_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptMetaToken(token: string, key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(key), encoder.encode(token));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptMetaToken(value: string, key: string): Promise<string> {
  const parts = value.split('.');
  if (parts.length !== 2) throw new Error('Stored Meta credential is invalid.');
  const iv = base64ToBytes(parts[0]);
  if (iv.length !== 12) throw new Error('Stored Meta credential is invalid.');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(key), base64ToBytes(parts[1]));
  return decoder.decode(plaintext);
}
