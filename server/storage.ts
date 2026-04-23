import {
  users,
  sessions,
  files,
  auditLogs,
  resources,
  messages,
  clientNotes,
  passwordResets,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  Session,
  FileRecord,
  InsertFile,
  AuditLog,
  InsertAuditLog,
  Resource,
  InsertResource,
  Message,
  InsertMessage,
  ClientNote,
  InsertClientNote,
  PasswordReset,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, isNull, or, sql as dsql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

// DATA_DIR can be overridden via env var (e.g. /var/data on Render's persistent disk).
// Defaults to ./server/data for local dev.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "server/data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(path.join(DATA_DIR, "portal.db"));
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// --- Migration: create tables if they don't exist (idempotent)
function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL,
      mfa_secret TEXT,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL,
      direction TEXT NOT NULL,
      filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      tax_year INTEGER,
      encryption_iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      url TEXT NOT NULL,
      pub_date TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      last_checked_at INTEGER,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      read_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
}
runMigrations();

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  listUsers(role?: "client" | "admin"): Promise<User[]>;
  createUser(data: InsertUser & { createdAt: Date }): Promise<User>;
  updateUser(id: number, patch: Partial<User>): Promise<User | undefined>;

  // Sessions
  createSession(data: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Session>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  touchSession(tokenHash: string, expiresAt: Date): Promise<void>;
  purgeExpiredSessions(): Promise<void>;

  // Files
  createFile(data: InsertFile & { createdAt: Date }): Promise<FileRecord>;
  getFile(id: number): Promise<FileRecord | undefined>;
  listFilesForOwner(ownerId: number): Promise<FileRecord[]>;
  softDeleteFile(id: number): Promise<void>;

  // Audit
  createAuditLog(data: InsertAuditLog & { createdAt: Date }): Promise<AuditLog>;
  listAuditLogs(limit: number, offset: number): Promise<AuditLog[]>;
  countAuditLogs(): Promise<number>;

  // Resources
  listResources(): Promise<Resource[]>;
  upsertResource(data: InsertResource & { addedAt: Date }): Promise<Resource>;
  updateResource(id: number, patch: Partial<Resource>): Promise<Resource | undefined>;
  deleteResource(id: number): Promise<void>;
  replaceAllResources(list: (InsertResource & { addedAt: Date })[]): Promise<void>;

  // Messages
  createMessage(data: InsertMessage & { createdAt: Date }): Promise<Message>;
  listMessagesForClient(clientId: number): Promise<Message[]>;
  markMessageRead(id: number): Promise<void>;

  // Notes
  createNote(data: InsertClientNote & { createdAt: Date }): Promise<ClientNote>;
  listNotesForClient(clientId: number): Promise<ClientNote[]>;

  // Password resets
  createPasswordReset(data: { userId: number; tokenHash: string; expiresAt: Date }): Promise<PasswordReset>;
  getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordReset | undefined>;
  markPasswordResetUsed(id: number): Promise<void>;
  deletePasswordResetsForUser(userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByEmail(email: string) {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }
  async listUsers(role?: "client" | "admin") {
    if (role) return db.select().from(users).where(eq(users.role, role)).all();
    return db.select().from(users).all();
  }
  async createUser(data: InsertUser & { createdAt: Date }) {
    return db
      .insert(users)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning()
      .get();
  }
  async updateUser(id: number, patch: Partial<User>) {
    const existing = await this.getUser(id);
    if (!existing) return undefined;
    return db.update(users).set(patch).where(eq(users.id, id)).returning().get();
  }

  async createSession(data: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return db
      .insert(sessions)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        createdAt: new Date(),
      })
      .returning()
      .get();
  }
  async getSessionByTokenHash(tokenHash: string) {
    return db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
  }
  async deleteSession(tokenHash: string) {
    db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
  }
  async touchSession(tokenHash: string, expiresAt: Date) {
    db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash)).run();
  }
  async purgeExpiredSessions() {
    db.delete(sessions)
      .where(dsql`${sessions.expiresAt} < ${new Date()}`)
      .run();
  }

  async createFile(data: InsertFile & { createdAt: Date }) {
    return db.insert(files).values(data).returning().get();
  }
  async getFile(id: number) {
    return db.select().from(files).where(eq(files.id, id)).get();
  }
  async listFilesForOwner(ownerId: number) {
    return db
      .select()
      .from(files)
      .where(and(eq(files.ownerId, ownerId), isNull(files.deletedAt)))
      .orderBy(desc(files.createdAt))
      .all();
  }
  async softDeleteFile(id: number) {
    db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id)).run();
  }

  async createAuditLog(data: InsertAuditLog & { createdAt: Date }) {
    return db.insert(auditLogs).values(data).returning().get();
  }
  async listAuditLogs(limit: number, offset: number) {
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
  }
  async countAuditLogs() {
    const row = db.select({ c: dsql<number>`count(*)` }).from(auditLogs).get();
    return row?.c ?? 0;
  }

  async listResources() {
    return db.select().from(resources).orderBy(desc(resources.isPinned), desc(resources.pubDate)).all();
  }
  async upsertResource(data: InsertResource & { addedAt: Date }) {
    // Match by (source, url)
    const existing = db
      .select()
      .from(resources)
      .where(and(eq(resources.source, data.source), eq(resources.url, data.url)))
      .get();
    if (existing) {
      return db
        .update(resources)
        .set({ ...data, isPinned: existing.isPinned })
        .where(eq(resources.id, existing.id))
        .returning()
        .get();
    }
    return db.insert(resources).values(data).returning().get();
  }
  async updateResource(id: number, patch: Partial<Resource>) {
    return db.update(resources).set(patch).where(eq(resources.id, id)).returning().get();
  }
  async deleteResource(id: number) {
    db.delete(resources).where(eq(resources.id, id)).run();
  }
  async replaceAllResources(list: (InsertResource & { addedAt: Date })[]) {
    // Preserve pinned manual overrides: simplest path is upsert each.
    for (const r of list) {
      await this.upsertResource(r);
    }
  }

  async createMessage(data: InsertMessage & { createdAt: Date }) {
    return db.insert(messages).values(data).returning().get();
  }
  async listMessagesForClient(clientId: number) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.clientId, clientId))
      .orderBy(messages.createdAt)
      .all();
  }
  async markMessageRead(id: number) {
    db.update(messages).set({ readAt: new Date() }).where(eq(messages.id, id)).run();
  }

  async createNote(data: InsertClientNote & { createdAt: Date }) {
    return db.insert(clientNotes).values(data).returning().get();
  }
  async listNotesForClient(clientId: number) {
    return db
      .select()
      .from(clientNotes)
      .where(eq(clientNotes.clientId, clientId))
      .orderBy(desc(clientNotes.createdAt))
      .all();
  }

  async createPasswordReset(data: { userId: number; tokenHash: string; expiresAt: Date }) {
    return db
      .insert(passwordResets)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        createdAt: new Date(),
      })
      .returning()
      .get();
  }
  async getPasswordResetByTokenHash(tokenHash: string) {
    return db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).get();
  }
  async markPasswordResetUsed(id: number) {
    db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, id)).run();
  }
  async deletePasswordResetsForUser(userId: number) {
    db.delete(passwordResets).where(eq(passwordResets.userId, userId)).run();
  }
}

export const storage: IStorage = new DatabaseStorage();
