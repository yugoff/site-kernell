import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const CURRENT_KEY_VERSION = 1;

function resolveEncryptionKey(): Buffer {
  const configured = process.env.CLOUD_DATA_ENCRYPTION_KEY?.trim();
  if (configured) {
    if (/^[0-9a-f]{64}$/i.test(configured)) {
      return Buffer.from(configured, "hex");
    }
    const base64 = Buffer.from(configured, "base64");
    if (base64.length === 32) return base64;
    return createHash("sha256").update(configured).digest();
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.CLOUD_DEMO_ENABLED === "false"
  ) {
    throw new Error(
      "CLOUD_DATA_ENCRYPTION_KEY must be set when production sales are enabled.",
    );
  }

  const dbPath = process.env.CLOUD_DATABASE_PATH || "kernell-cloud-dev";
  return createHash("sha256")
    .update(`kernell-cloud-preview:${dbPath}`)
    .digest();
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Encrypts sensitive JSON payloads (PII, provider credentials) with AES-256-GCM.
 */
export function encryptJson(payload: unknown): {
  ciphertext: string;
  keyVersion: number;
} {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    keyVersion: CURRENT_KEY_VERSION,
    ciphertext: `v${CURRENT_KEY_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`,
  };
}

/**
 * Decrypts payloads produced by encryptJson.
 */
export function decryptJson<T>(ciphertext: string): T {
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported encrypted payload format.");
  }
  const key = resolveEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}

