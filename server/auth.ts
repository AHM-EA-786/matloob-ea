import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import qrcode from "qrcode";

export const BCRYPT_COST = 12;
export const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateTotpSecret(email: string): { base32: string; otpauthUrl: string } {
  const secret = speakeasy.generateSecret({
    name: `Matloob Tax (${email})`,
    issuer: "Matloob Tax & Consulting",
    length: 20,
  });
  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url || "",
  };
}

export async function totpQrDataUrl(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl);
}

export function verifyTotp(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1,
  });
}

// --- Rate limiter: 5 failed logins → 15-minute lockout per email
interface LoginAttemptState {
  failures: number;
  lastFailureAt: number;
  lockedUntil?: number;
}
const loginAttempts = new Map<string, LoginAttemptState>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function checkLockout(email: string): { locked: boolean; retryAfterMs?: number } {
  const s = loginAttempts.get(email.toLowerCase());
  if (!s) return { locked: false };
  if (s.lockedUntil && s.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: s.lockedUntil - Date.now() };
  }
  // Expired lockout: reset
  if (s.lockedUntil && s.lockedUntil <= Date.now()) {
    loginAttempts.delete(email.toLowerCase());
  }
  return { locked: false };
}

export function recordLoginFailure(email: string): { locked: boolean; retryAfterMs?: number } {
  const key = email.toLowerCase();
  const s = loginAttempts.get(key) || { failures: 0, lastFailureAt: 0 };
  s.failures += 1;
  s.lastFailureAt = Date.now();
  if (s.failures >= MAX_FAILURES) {
    s.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(key, s);
  if (s.lockedUntil && s.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: s.lockedUntil - Date.now() };
  }
  return { locked: false };
}

export function recordLoginSuccess(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}
