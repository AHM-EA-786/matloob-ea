import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { storage } from "./storage";
import {
  signupSchema,
  signinSchema,
  toPublicUser,
  type User,
  type InsertResource,
} from "@shared/schema";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  generateTotpSecret,
  totpQrDataUrl,
  verifyTotp,
  checkLockout,
  recordLoginFailure,
  recordLoginSuccess,
  SESSION_DURATION_MS,
} from "./auth";
import { encryptBuffer, decryptToBuffer, deleteFile, encryptString, decryptString } from "./crypto";
import { maybeRefreshLiveNewsAsync, refreshLiveNews, lastRefreshStatus } from "./news-fetcher";
import crypto from "node:crypto";
import {
  sendMail,
  sendMailAsync,
  mailerConfigured,
  mailerConfig,
  ADMIN_NOTIFY_EMAIL,
  PORTAL_BASE_URL,
  signupReceivedClient,
  signupAlertAdmin,
  accountApprovedClient,
  accountSuspendedClient,
  fileUploadedToClient,
  fileUploadedByClient,
  passwordResetEmail,
  newMessageClient,
  newMessageAdmin,
} from "./mailer";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "text/csv",
  "text/plain",
  "application/octet-stream", // xlsx sometimes reports this; we'll sniff ext too
]);
const ALLOWED_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".docx", ".csv", ".txt"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype || ext}`));
  },
});

// ---- Auth middleware ----
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionTokenHash?: string;
    }
  }
}

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    ""
  );
}

async function audit(
  req: Request,
  action: string,
  opts: {
    userId?: number | null;
    targetType?: string;
    targetId?: number;
    metadata?: unknown;
  } = {},
) {
  await storage.createAuditLog({
    userId: opts.userId ?? req.user?.id ?? null,
    action,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
    ipAddress: clientIp(req),
    userAgent: (req.headers["user-agent"] as string) || null,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
    createdAt: new Date(),
  });
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ message: "Missing Authorization header" });
  const token = m[1];
  const tokenHash = hashToken(token);
  const session = await storage.getSessionByTokenHash(tokenHash);
  if (!session) return res.status(401).json({ message: "Invalid session" });
  if (session.expiresAt.getTime() < Date.now()) {
    await storage.deleteSession(tokenHash);
    return res.status(401).json({ message: "Session expired" });
  }
  const user = await storage.getUser(session.userId);
  if (!user || user.status !== "active") {
    return res.status(401).json({ message: "Account inactive" });
  }
  // Sliding expiry
  await storage.touchSession(tokenHash, new Date(Date.now() + SESSION_DURATION_MS));
  req.user = user;
  req.sessionTokenHash = tokenHash;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
  next();
}

// ---- Seed admin ----
export async function seedInitialAdmin() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || "abdul@matloob-ea.com").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "ChangeMe!2026";
  const existing = await storage.getUserByEmail(email);
  if (existing) return;
  await storage.createUser({
    email,
    passwordHash: await hashPassword(password),
    role: "admin",
    firstName: "Abdul",
    lastName: "Matloob",
    phone: "(508) 258-9890",
    status: "active",
    mfaSecret: null,
    mfaEnabled: false,
    mustChangePassword: true,
    createdAt: new Date(),
  });
  console.log(`[seed] Initial admin seeded: ${email}`);
}

// Normalize source strings to the schema-compatible union.
// Accepts: "IRS", "MA DOR", "MA_DOR", "MA-DOR", "Massachusetts DOR".
function normalizeSource(s: string): "IRS" | "MA_DOR" {
  const v = String(s || "").trim().toUpperCase();
  if (v === "IRS") return "IRS";
  return "MA_DOR";
}

// ---- Load resources.json on startup (if present) ----
export async function loadResourcesFile() {
  const p = path.resolve(process.cwd(), "server/data/resources.json");
  try {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, "[]");
      return;
    }
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as any;
    // Accept either an array or an object { items: [...] }
    const data: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    if (!data.length) {
      console.log("[resources] resources.json has no items");
      return;
    }
    const items: (InsertResource & { addedAt: Date })[] = data
      .filter((r) => r && r.source && r.title && r.url)
      .map((r) => ({
        source: normalizeSource(r.source),
        category: r.category || "publications",
        title: String(r.title),
        summary: String(r.summary || ""),
        url: String(r.url),
        pubDate: r.pubDate || null,
        isPinned: !!r.isPinned,
        lastCheckedAt: r.lastCheckedAt ? new Date(r.lastCheckedAt) : null,
        addedAt: r.addedAt ? new Date(r.addedAt) : new Date(),
      }));
    await storage.replaceAllResources(items);
    console.log(`[resources] loaded ${items.length} resources from resources.json`);
  } catch (err) {
    console.error("[resources] failed to load resources.json:", err);
  }
}

// ---- Routes ----
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedInitialAdmin();
  await loadResourcesFile();

  // ==== AUTH ====
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }
    const existing = await storage.getUserByEmail(parsed.data.email);
    if (existing) return res.status(409).json({ message: "Account with this email already exists." });
    const user = await storage.createUser({
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "client",
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone || null,
      status: "pending",
      mfaSecret: null,
      mfaEnabled: false,
      mustChangePassword: false,
      createdAt: new Date(),
    });
    await audit(req, "signup", { userId: user.id, targetType: "user", targetId: user.id });

    // Fire-and-forget: confirmation to client + alert to admin.
    // sendMailAsync handles the missing-config case by logging email_skipped_no_config
    // to audit_logs — so we always call it and let the mailer decide.
    const emailConfigured = mailerConfigured();
    const clientTpl = signupReceivedClient({ firstName: user.firstName });
    sendMailAsync({
      to: user.email,
      subject: clientTpl.subject,
      html: clientTpl.html,
      text: clientTpl.text,
      template: "signupReceivedClient",
    });
    if (ADMIN_NOTIFY_EMAIL) {
      const adminTpl = signupAlertAdmin({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        portalUrl: PORTAL_BASE_URL,
      });
      sendMailAsync({
        to: ADMIN_NOTIFY_EMAIL,
        subject: adminTpl.subject,
        html: adminTpl.html,
        text: adminTpl.text,
        template: "signupAlertAdmin",
      });
    }

    res.json({
      ok: true,
      message: "Account created. An administrator will approve your account shortly.",
      emailSent: emailConfigured,
    });
  });

  // ---- Forgot / reset password ----
  app.post("/api/auth/forgot-password", async (req, res) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      // Same generic response to avoid enumeration.
      return res.json({ ok: true });
    }
    const user = await storage.getUserByEmail(parsed.data.email);
    // Always return ok (don't leak whether email exists)
    if (!user || user.status === "archived") {
      await audit(req, "password_reset_requested_noop", { metadata: { email: parsed.data.email } });
      return res.json({ ok: true, emailSent: mailerConfigured() });
    }
    // Invalidate prior tokens for this user
    await storage.deletePasswordResetsForUser(user.id);
    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await storage.createPasswordReset({ userId: user.id, tokenHash, expiresAt });
    await audit(req, "password_reset_requested", {
      userId: user.id,
      targetType: "user",
      targetId: user.id,
    });
    const resetUrl = `${PORTAL_BASE_URL.replace(/\/$/, "")}/#/reset-password?token=${raw}`;
    const tpl = passwordResetEmail({ firstName: user.firstName, resetUrl });
    sendMailAsync({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      template: "passwordResetEmail",
    });
    res.json({ ok: true, emailSent: mailerConfigured() });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const schema = z.object({
      token: z.string().min(32),
      password: signupSchema.shape.password,
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }
    const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
    const record = await storage.getPasswordResetByTokenHash(tokenHash);
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
    }
    const user = await storage.getUser(record.userId);
    if (!user) return res.status(400).json({ message: "Invalid reset link." });
    await storage.updateUser(user.id, {
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
    });
    await storage.markPasswordResetUsed(record.id);
    await audit(req, "password_reset_completed", {
      userId: user.id,
      targetType: "user",
      targetId: user.id,
    });
    res.json({ ok: true });
  });

  // Lightweight config probe — tells the client whether email is wired up
  // so the signup page can show the right confirmation message.
  app.get("/api/config/email", (_req, res) => {
    res.json({ emailConfigured: mailerConfigured(), config: mailerConfig() });
  });

  // Health check for Render / uptime monitors — no DB, no disk, always fast.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), time: new Date().toISOString() });
  });

  app.post("/api/auth/signin", async (req, res) => {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const { email, password, mfaCode } = parsed.data;

    const lockout = checkLockout(email);
    if (lockout.locked) {
      await audit(req, "login_locked_out", { metadata: { email } });
      return res
        .status(429)
        .json({ message: `Too many failed attempts. Try again in ${Math.ceil((lockout.retryAfterMs || 0) / 60000)} min.` });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      recordLoginFailure(email);
      await audit(req, "login_failed", { metadata: { email, reason: "no_user" } });
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      recordLoginFailure(email);
      await audit(req, "login_failed", { userId: user.id, metadata: { email, reason: "bad_password" } });
      return res.status(401).json({ message: "Invalid email or password." });
    }
    if (user.status === "pending") {
      return res.status(403).json({ message: "Your account is pending admin approval." });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "Your account is not active." });
    }

    if (user.mfaEnabled) {
      if (!mfaCode) {
        return res.json({ requiresMfa: true });
      }
      if (!user.mfaSecret) return res.status(500).json({ message: "MFA not configured" });
      const decrypted = (() => {
        try { return decryptString(user.mfaSecret!); } catch { return null; }
      })();
      if (!decrypted || !verifyTotp(decrypted, mfaCode)) {
        recordLoginFailure(email);
        await audit(req, "login_failed", { userId: user.id, metadata: { reason: "bad_mfa" } });
        return res.status(401).json({ message: "Invalid MFA code." });
      }
    }

    recordLoginSuccess(email);
    const { raw, hash } = generateSessionToken();
    await storage.createSession({
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      ipAddress: clientIp(req),
      userAgent: (req.headers["user-agent"] as string) || undefined,
    });
    await storage.updateUser(user.id, { lastLoginAt: new Date() });
    await audit(req, "login_success", { userId: user.id });

    res.json({
      token: raw,
      user: toPublicUser(user),
    });
  });

  app.post("/api/auth/signout", requireAuth, async (req, res) => {
    if (req.sessionTokenHash) await storage.deleteSession(req.sessionTokenHash);
    await audit(req, "logout");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({ user: toPublicUser(req.user!) });
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: signupSchema.shape.password,
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const u = req.user!;
    const ok = await verifyPassword(parsed.data.currentPassword, u.passwordHash);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect." });
    await storage.updateUser(u.id, {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    });
    await audit(req, "password_change", { userId: u.id });
    res.json({ ok: true });
  });

  app.post("/api/auth/mfa/setup", requireAuth, async (req, res) => {
    const { base32, otpauthUrl } = generateTotpSecret(req.user!.email);
    const qr = await totpQrDataUrl(otpauthUrl);
    // Store secret encrypted but NOT yet enabled
    await storage.updateUser(req.user!.id, { mfaSecret: encryptString(base32), mfaEnabled: false });
    res.json({ qr, otpauthUrl });
  });

  app.post("/api/auth/mfa/enable", requireAuth, async (req, res) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
    const u = await storage.getUser(req.user!.id);
    if (!u?.mfaSecret) return res.status(400).json({ message: "Run MFA setup first." });
    const secret = decryptString(u.mfaSecret);
    if (!verifyTotp(secret, code)) return res.status(401).json({ message: "Invalid code." });
    await storage.updateUser(u.id, { mfaEnabled: true });
    await audit(req, "mfa_enabled", { userId: u.id });
    res.json({ ok: true });
  });

  app.post("/api/auth/mfa/disable", requireAuth, async (req, res) => {
    await storage.updateUser(req.user!.id, { mfaEnabled: false, mfaSecret: null });
    await audit(req, "mfa_disabled", { userId: req.user!.id });
    res.json({ ok: true });
  });

  // ==== FILES ====
  app.get("/api/files", requireAuth, async (req, res) => {
    if (req.user!.role === "admin") {
      const clientId = Number(req.query.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId required for admin" });
      const files = await storage.listFilesForOwner(clientId);
      res.json({ files });
    } else {
      const files = await storage.listFilesForOwner(req.user!.id);
      res.json({ files });
    }
  });

  app.post("/api/files/upload", requireAuth, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const schema = z.object({
      ownerId: z.coerce.number().optional(),
      description: z.string().optional(),
      category: z
        .enum(["tax_return", "w2", "1099", "id_doc", "correspondence", "other"]).optional(),
      taxYear: z.coerce.number().optional(),
      direction: z.enum(["client_to_firm", "firm_to_client"]).optional(),
    });
    const meta = schema.parse(req.body);

    const ownerId =
      req.user!.role === "admin" ? meta.ownerId ?? req.user!.id : req.user!.id;
    const direction =
      req.user!.role === "admin"
        ? meta.direction || "firm_to_client"
        : "client_to_firm";

    const { storedPath, iv, authTag, sizeBytes } = encryptBuffer(req.file.buffer);
    const record = await storage.createFile({
      ownerId,
      uploadedBy: req.user!.id,
      direction,
      filename: req.file.originalname,
      storedPath,
      mimeType: req.file.mimetype,
      sizeBytes,
      description: meta.description || null,
      category: meta.category || "other",
      taxYear: meta.taxYear ?? null,
      encryptionIv: iv,
      authTag,
      createdAt: new Date(),
    });
    await audit(req, "file_upload", {
      targetType: "file",
      targetId: record.id,
      metadata: { filename: record.filename, size: sizeBytes },
    });

    // Notify the other side.
    if (direction === "firm_to_client") {
      const owner = await storage.getUser(ownerId);
      if (owner && owner.status === "active") {
        const tpl = fileUploadedToClient({
          firstName: owner.firstName,
          fileName: record.filename,
          portalUrl: PORTAL_BASE_URL,
        });
        sendMailAsync({
          to: owner.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          template: "fileUploadedToClient",
        });
      }
    } else if (direction === "client_to_firm" && ADMIN_NOTIFY_EMAIL) {
      const tpl = fileUploadedByClient({
        firstName: req.user!.firstName,
        lastName: req.user!.lastName,
        fileName: record.filename,
        adminPortalUrl: PORTAL_BASE_URL,
      });
      sendMailAsync({
        to: ADMIN_NOTIFY_EMAIL,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        template: "fileUploadedByClient",
      });
    }

    res.json({ file: record });
  });

  app.get("/api/files/:id/download", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getFile(id);
    if (!file || file.deletedAt) return res.status(404).json({ message: "Not found" });
    if (req.user!.role !== "admin" && file.ownerId !== req.user!.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const buf = decryptToBuffer(file.storedPath, file.encryptionIv, file.authTag);
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      );
      res.send(buf);
      await audit(req, "file_download", {
        targetType: "file",
        targetId: file.id,
        metadata: { filename: file.filename },
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to decrypt file" });
    }
  });

  app.delete("/api/files/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getFile(id);
    if (!file || file.deletedAt) return res.status(404).json({ message: "Not found" });
    const isOwner = file.ownerId === req.user!.id;
    const isUploader = file.uploadedBy === req.user!.id;
    if (req.user!.role !== "admin" && !(isOwner && isUploader)) {
      return res.status(403).json({ message: "You can only delete files you uploaded." });
    }
    await storage.softDeleteFile(id);
    deleteFile(file.storedPath);
    await audit(req, "file_delete", {
      targetType: "file",
      targetId: file.id,
      metadata: { filename: file.filename },
    });
    res.json({ ok: true });
  });

  // ==== ADMIN ====
  app.get("/api/admin/clients", requireAuth, requireAdmin, async (_req, res) => {
    const all = await storage.listUsers();
    const clients = all.filter((u) => u.role === "client").map(toPublicUser);
    res.json({ clients });
  });

  app.get("/api/admin/clients/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const user = await storage.getUser(id);
    if (!user || user.role !== "client") return res.status(404).json({ message: "Not found" });
    const files = await storage.listFilesForOwner(id);
    const notes = await storage.listNotesForClient(id);
    const messages = await storage.listMessagesForClient(id);
    res.json({ client: toPublicUser(user), files, notes, messages });
  });

  app.patch("/api/admin/clients/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      status: z.enum(["pending", "active", "suspended", "archived"]).optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      note: z.string().optional(),
    });
    const patch = schema.parse(req.body);
    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: "Not found" });
    const { note, ...rest } = patch;
    if (Object.keys(rest).length) {
      await storage.updateUser(id, rest);
    }
    if (note) {
      await storage.createNote({
        clientId: id,
        authorId: req.user!.id,
        body: note,
        createdAt: new Date(),
      });
    }
    if (rest.status) {
      await audit(req, `user_status_${rest.status}`, { targetType: "user", targetId: id });
      const prevStatus = user.status;
      // Pending -> active: notify client
      if (prevStatus === "pending" && rest.status === "active") {
        const tpl = accountApprovedClient({
          firstName: user.firstName,
          portalUrl: PORTAL_BASE_URL,
        });
        sendMailAsync({
          to: user.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          template: "accountApprovedClient",
        });
      }
      // -> suspended: notify client
      if (prevStatus !== "suspended" && rest.status === "suspended") {
        const tpl = accountSuspendedClient({ firstName: user.firstName });
        sendMailAsync({
          to: user.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          template: "accountSuspendedClient",
        });
      }
    }
    const updated = await storage.getUser(id);
    res.json({ client: toPublicUser(updated!) });
  });

  app.get("/api/admin/audit", requireAuth, requireAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const logs = await storage.listAuditLogs(limit, offset);
    const total = await storage.countAuditLogs();
    res.json({ logs, total });
  });

  app.get("/api/admin/stats", requireAuth, requireAdmin, async (_req, res) => {
    const all = await storage.listUsers();
    const clients = all.filter((u) => u.role === "client");
    const pending = clients.filter((c) => c.status === "pending").length;
    const active = clients.filter((c) => c.status === "active").length;
    const recent = await storage.listAuditLogs(25, 0);
    res.json({
      totalClients: clients.length,
      pendingClients: pending,
      activeClients: active,
      recentAudit: recent,
    });
  });

  // ==== RESOURCES ====
  app.get("/api/resources", requireAuth, async (_req, res) => {
    // Kick off a background refresh of live news if cache is stale (>15 min).
    // Non-blocking: current request returns whatever is already in the DB.
    maybeRefreshLiveNewsAsync();
    const list = await storage.listResources();
    const status = lastRefreshStatus();
    res.json({
      resources: list,
      news: {
        lastRefreshAt: status.at ? status.at.toISOString() : null,
        ok: status.ok,
        error: status.error,
      },
    });
  });

  // News-only feed — last 30 days, newest first.
  app.get("/api/resources/news", requireAuth, async (_req, res) => {
    maybeRefreshLiveNewsAsync();
    const all = await storage.listResources();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const news = all
      .filter((r) => r.category === "news")
      .filter((r) => {
        if (!r.pubDate) return true; // keep undated (will be sorted to bottom)
        const t = Date.parse(r.pubDate);
        return isNaN(t) ? true : t >= cutoff;
      })
      .sort((a, b) => {
        const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
        const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
        return tb - ta;
      })
      .slice(0, 20);
    const status = lastRefreshStatus();
    res.json({
      news,
      lastRefreshAt: status.at ? status.at.toISOString() : null,
      ok: status.ok,
      error: status.error,
    });
  });

  // Admin force-refresh of live news feeds.
  app.post("/api/admin/resources/refresh-news", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await refreshLiveNews();
      await audit(req, "resource_news_refresh", { metadata: result });
      const status = lastRefreshStatus();
      res.json({
        ok: true,
        inserted: result.inserted,
        total: result.total,
        lastRefreshAt: status.at ? status.at.toISOString() : null,
        upstreamOk: status.ok,
        error: status.error,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || "Refresh failed" });
    }
  });

  app.post("/api/resources", requireAuth, requireAdmin, async (req, res) => {
    const schema = z.object({
      source: z.enum(["IRS", "MA_DOR"]),
      category: z.string(),
      title: z.string(),
      summary: z.string(),
      url: z.string().url(),
      pubDate: z.string().nullable().optional(),
      isPinned: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const out = await storage.upsertResource({
      ...data,
      pubDate: data.pubDate ?? null,
      isPinned: data.isPinned ?? false,
      lastCheckedAt: new Date(),
      addedAt: new Date(),
    });
    await audit(req, "resource_add", { targetType: "resource", targetId: out.id });
    res.json({ resource: out });
  });

  app.patch("/api/resources/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      isPinned: z.boolean().optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      category: z.string().optional(),
    });
    const patch = schema.parse(req.body);
    const out = await storage.updateResource(id, patch);
    await audit(req, "resource_update", { targetType: "resource", targetId: id });
    res.json({ resource: out });
  });

  app.delete("/api/resources/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteResource(id);
    await audit(req, "resource_delete", { targetType: "resource", targetId: id });
    res.json({ ok: true });
  });

  app.post("/api/admin/resources/refresh", requireAuth, requireAdmin, async (req, res) => {
    await loadResourcesFile();
    await audit(req, "resource_refresh");
    const list = await storage.listResources();
    res.json({ resources: list });
  });

  // ==== MESSAGES ====
  app.get("/api/messages", requireAuth, async (req, res) => {
    if (req.user!.role === "admin") {
      const clientId = Number(req.query.clientId);
      if (!clientId) return res.status(400).json({ message: "clientId required" });
      const msgs = await storage.listMessagesForClient(clientId);
      res.json({ messages: msgs });
    } else {
      const msgs = await storage.listMessagesForClient(req.user!.id);
      res.json({ messages: msgs });
    }
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    const schema = z.object({
      clientId: z.number().optional(),
      body: z.string().min(1).max(5000),
    });
    const data = schema.parse(req.body);
    const clientId = req.user!.role === "admin" ? data.clientId : req.user!.id;
    if (!clientId) return res.status(400).json({ message: "clientId required" });
    const msg = await storage.createMessage({
      clientId,
      fromUserId: req.user!.id,
      body: data.body,
      createdAt: new Date(),
    });

    // Notify the recipient.
    if (req.user!.role === "admin") {
      const client = await storage.getUser(clientId);
      if (client && client.status === "active") {
        const tpl = newMessageClient({
          firstName: client.firstName,
          preview: data.body,
          portalUrl: PORTAL_BASE_URL,
        });
        sendMailAsync({
          to: client.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          template: "newMessageClient",
        });
      }
    } else if (ADMIN_NOTIFY_EMAIL) {
      const tpl = newMessageAdmin({
        clientName: `${req.user!.firstName} ${req.user!.lastName}`,
        preview: data.body,
        adminPortalUrl: PORTAL_BASE_URL,
      });
      sendMailAsync({
        to: ADMIN_NOTIFY_EMAIL,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        template: "newMessageAdmin",
      });
    }

    res.json({ message: msg });
  });

  // Periodic session cleanup
  setInterval(() => {
    storage.purgeExpiredSessions().catch(() => {});
  }, 10 * 60 * 1000);

  return httpServer;
}
