import crypto from "crypto";

const SECRET_ENV_KEY = "ORG_PROVIDER_SECRET_KEY";

function getEncryptionKey(): Buffer {
  const raw = process.env[SECRET_ENV_KEY];
  if (!raw) {
    throw new Error(
      `${SECRET_ENV_KEY} is not set; cannot encrypt or decrypt provider secrets`,
    );
  }

  // Derive a 32-byte key from the env value.
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) {
    throw new Error("Cannot encrypt empty secret");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  if (!payload) {
    throw new Error("Cannot decrypt empty payload");
  }

  const [ivB64, tagB64, cipherB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error("Invalid encrypted payload format");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

