import crypto from "crypto";

const IV_LENGTH = 12; // AES-GCM standard
const SALT_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const PBKDF2_ITER = 100_000;

// Encrypts plaintext with password, returns base64(salt + iv + ciphertext + authTag)
export function encryptWithPassword(
  plaintext: string,
  password: string
): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITER,
    KEY_LENGTH,
    "sha256"
  );
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: [salt][iv][ciphertext][authTag]
  return Buffer.concat([salt, iv, ciphertext, authTag]).toString("base64");
}

// Decrypts base64(salt + iv + ciphertext + authTag) with password
export function decryptWithPassword(enc: string, password: string): string {
  const data = Buffer.from(enc, "base64");
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.slice(data.length - 16);
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH, data.length - 16);
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITER,
    KEY_LENGTH,
    "sha256"
  );
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
