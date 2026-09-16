import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * AES-256-GCM secret encryption for the Assistant BYOK API keys.
 *
 * Envelope format: `v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>`
 *
 * The master key comes from the `AGENT_ENCRYPTION_KEY` environment variable
 * (see `.env.example`). Any string is accepted; it is stretched to 32 bytes
 * with SHA-256 so operators can paste a passphrase.
 */

const CURRENT_VERSION = 'v1';

export class DecryptionError extends Error {
  constructor(message = 'Failed to decrypt secret') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/** Derive the 32-byte AES key from the configured master key material. */
export function deriveKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey, 'utf8').digest();
}

export function encryptSecret(plaintext: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    CURRENT_VERSION,
    iv.toString('hex'),
    authTag.toString('hex'),
    ciphertext.toString('hex'),
  ].join(':');
}

export function decryptSecret(envelope: string, masterKey: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== CURRENT_VERSION) {
    throw new DecryptionError('Unsupported secret envelope format');
  }
  const [, ivHex, authTagHex, ciphertextHex] = parts;
  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;
  try {
    iv = Buffer.from(ivHex, 'hex');
    authTag = Buffer.from(authTagHex, 'hex');
    ciphertext = Buffer.from(ciphertextHex, 'hex');
  } catch {
    throw new DecryptionError('Malformed secret envelope');
  }
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new DecryptionError('Malformed secret envelope');
  }
  const key = deriveKey(masterKey);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptionError('Decryption failed (wrong key or corrupted data)');
  }
}

/** Mask an API key for display: `••••` + last 4 chars. */
export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) {
    return '••••';
  }
  return `••••${trimmed.slice(-4)}`;
}

/**
 * Resolve the effective master key: explicit argument, then the
 * `AGENT_ENCRYPTION_KEY` env var. Throws a descriptive error when missing so
 * callers fail fast instead of silently storing plaintext.
 */
export function requireMasterKey(explicit?: string): string {
  const masterKey = explicit ?? process.env.AGENT_ENCRYPTION_KEY;
  if (!masterKey || masterKey.trim().length === 0) {
    throw new Error(
      'AGENT_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` and add it to the environment.',
    );
  }
  return masterKey.trim();
}
