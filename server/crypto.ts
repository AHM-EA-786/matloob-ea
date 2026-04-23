import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.FILE_ENCRYPTION_KEY || "";
  if (raw.length < 32) {
    // Derive a stable dev key so the server can run out of the box; log a warning once.
    const seed = raw || "dev-only-unsafe-key-please-set-FILE_ENCRYPTION_KEY";
    return crypto.createHash("sha256").update(seed).digest();
  }
  // Accept either a 32-byte utf8 string or hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return Buffer.from(raw.slice(0, 32), "utf8");
}

// FILES_DIR lives inside DATA_DIR so Render's persistent disk covers both the SQLite DB
// and the encrypted file blobs with a single mount.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "server/data");
export const FILES_DIR = path.join(DATA_DIR, "files");
fs.mkdirSync(FILES_DIR, { recursive: true });

export interface EncryptedBlob {
  storedPath: string;
  iv: string; // hex
  authTag: string; // hex
  sizeBytes: number;
}

export function encryptBuffer(buffer: Buffer): EncryptedBlob {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.bin`;
  const storedPath = path.join(FILES_DIR, storedName);
  fs.writeFileSync(storedPath, encrypted);
  // Store just the filename; we always resolve against FILES_DIR on read.
  // (Legacy rows that stored relative "server/data/files/..." paths still resolve correctly below.)
  return {
    storedPath: storedName,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    sizeBytes: buffer.length,
  };
}

function resolveStoredPath(storedPath: string): string {
  if (path.isAbsolute(storedPath)) return storedPath;
  // New format: just a filename inside FILES_DIR
  const inFilesDir = path.join(FILES_DIR, storedPath);
  if (fs.existsSync(inFilesDir)) return inFilesDir;
  // Legacy format: relative path like "server/data/files/xxx.bin"
  return path.resolve(process.cwd(), storedPath);
}

export function decryptToBuffer(storedPath: string, ivHex: string, authTagHex: string): Buffer {
  const absPath = resolveStoredPath(storedPath);
  const data = fs.readFileSync(absPath);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function deleteFile(storedPath: string): void {
  const absPath = resolveStoredPath(storedPath);
  try {
    fs.unlinkSync(absPath);
  } catch {
    // ignore
  }
}

// Helper to encrypt MFA secrets stored in users.mfaSecret
export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptString(packed: string): string {
  const [ivHex, tagHex, encHex] = packed.split(":");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}
