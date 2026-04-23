import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// users — both clients and admins
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().$type<"client" | "admin">(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  status: text("status").notNull().$type<"pending" | "active" | "suspended" | "archived">(),
  mfaSecret: text("mfa_secret"),
  mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).notNull().default(false),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
  direction: text("direction").notNull().$type<"client_to_firm" | "firm_to_client">(),
  filename: text("filename").notNull(),
  storedPath: text("stored_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  description: text("description"),
  category: text("category").notNull().$type<
    "tax_return" | "w2" | "1099" | "id_doc" | "correspondence" | "other"
  >(),
  taxYear: integer("tax_year"),
  encryptionIv: text("encryption_iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const resources = sqliteTable("resources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().$type<"IRS" | "MA_DOR">(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  url: text("url").notNull(),
  pubDate: text("pub_date"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  fromUserId: integer("from_user_id").notNull(),
  body: text("body").notNull(),
  readAt: integer("read_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const clientNotes = sqliteTable("client_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  authorId: integer("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Insert schemas — loose zod schemas; Drizzle values use strict types below.
export const insertUserSchema = createInsertSchema(users as any).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
} as any) as unknown as z.ZodType<any>;
export const insertFileSchema = createInsertSchema(files as any).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
} as any) as unknown as z.ZodType<any>;
export const insertAuditLogSchema = createInsertSchema(auditLogs as any).omit({
  id: true,
  createdAt: true,
} as any) as unknown as z.ZodType<any>;
export const insertResourceSchema = createInsertSchema(resources as any).omit({
  id: true,
  addedAt: true,
} as any) as unknown as z.ZodType<any>;
export const insertMessageSchema = createInsertSchema(messages as any).omit({
  id: true,
  createdAt: true,
  readAt: true,
} as any) as unknown as z.ZodType<any>;
export const insertClientNoteSchema = createInsertSchema(clientNotes as any).omit({
  id: true,
  createdAt: true,
} as any) as unknown as z.ZodType<any>;

// Signup/signin DTOs
export const signupSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a digit")
    .regex(/[^A-Za-z0-9]/, "Must contain a symbol"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

export const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ClientNote = typeof clientNotes.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;

export type InsertUser = typeof users.$inferInsert;
export type InsertFile = typeof files.$inferInsert;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type InsertResource = typeof resources.$inferInsert;
export type InsertMessage = typeof messages.$inferInsert;
export type InsertClientNote = typeof clientNotes.$inferInsert;

// Public-facing user (no secrets)
export type PublicUser = Omit<User, "passwordHash" | "mfaSecret">;
export function toPublicUser(u: User): PublicUser {
  const { passwordHash, mfaSecret, ...rest } = u;
  return rest;
}
