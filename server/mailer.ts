// server/mailer.ts
//
// Transactional email for the Matloob Tax & Consulting portal.
// Uses Google Workspace SMTP via nodemailer when configured.
// Fails gracefully — never throws, never crashes, never prompts for creds.
// Templates follow Circular 230 and IRS-approved EA language.

import nodemailer, { type Transporter } from "nodemailer";
import { storage } from "./storage";

// ---- Config (env-driven, with safe defaults) --------------------------------

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = (process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";

const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Matloob Tax & Consulting";
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || SMTP_USER;
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || SMTP_USER;
const PORTAL_BASE_URL =
  process.env.PORTAL_BASE_URL ||
  "https://www.perplexity.ai/computer/a/matloob-ea-portal-BCBrVOunQ6GjG8Chky1vgA";

export function mailerConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASSWORD && MAIL_FROM_EMAIL);
}

export function mailerConfig() {
  return {
    configured: mailerConfigured(),
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    user: SMTP_USER ? SMTP_USER.replace(/(.{2}).+(@.+)/, "$1***$2") : null,
    fromName: MAIL_FROM_NAME,
    fromEmail: MAIL_FROM_EMAIL || null,
    adminNotifyEmail: ADMIN_NOTIFY_EMAIL || null,
    portalBaseUrl: PORTAL_BASE_URL,
  };
}

export { ADMIN_NOTIFY_EMAIL, PORTAL_BASE_URL };

// ---- Transporter (lazy singleton) -------------------------------------------

let transporter: Transporter | null = null;
let verified = false;
let verifyAttempted = false;

function getTransporter(): Transporter | null {
  if (!mailerConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  // fire-and-forget verify; any failure is surfaced when we actually send.
  if (!verifyAttempted) {
    verifyAttempted = true;
    transporter
      .verify()
      .then(() => {
        verified = true;
        console.log(`[mailer] SMTP verified: ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
      })
      .catch((err) => {
        console.warn(`[mailer] SMTP verify failed: ${err?.message || err}`);
      });
  }
  return transporter;
}

// ---- Audit helpers ----------------------------------------------------------

async function auditEmail(
  action: "email_sent" | "email_failed" | "email_skipped_no_config",
  details: Record<string, unknown>,
) {
  try {
    await storage.createAuditLog({
      userId: null,
      action,
      targetType: "email",
      targetId: null,
      ipAddress: null,
      userAgent: null,
      metadata: JSON.stringify(details),
      createdAt: new Date(),
    });
  } catch {
    // never throw from audit
  }
}

// ---- Public send helper -----------------------------------------------------

export interface SendMailArgs {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Optional identifier added to the audit log for traceability. */
  template?: string;
}

export async function sendMail(args: SendMailArgs): Promise<{ ok: boolean; skipped?: boolean }> {
  const toList = Array.isArray(args.to) ? args.to.filter(Boolean) : [args.to].filter(Boolean);
  if (toList.length === 0) {
    return { ok: false, skipped: true };
  }
  if (!mailerConfigured()) {
    await auditEmail("email_skipped_no_config", {
      template: args.template || null,
      to: toList,
      subject: args.subject,
    });
    return { ok: false, skipped: true };
  }
  const tx = getTransporter();
  if (!tx) {
    await auditEmail("email_skipped_no_config", {
      template: args.template || null,
      to: toList,
      subject: args.subject,
    });
    return { ok: false, skipped: true };
  }
  try {
    const info = await tx.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_EMAIL}>`,
      to: toList.join(", "),
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    await auditEmail("email_sent", {
      template: args.template || null,
      to: toList,
      subject: args.subject,
      messageId: (info as any)?.messageId || null,
    });
    return { ok: true };
  } catch (err: any) {
    await auditEmail("email_failed", {
      template: args.template || null,
      to: toList,
      subject: args.subject,
      error: String(err?.message || err),
    });
    return { ok: false };
  }
}

/** Fire-and-forget — never bubbles an error. */
export function sendMailAsync(args: SendMailArgs): void {
  sendMail(args).catch(() => {
    /* swallowed — already audit-logged */
  });
}

// =============================================================================
// Templates
// =============================================================================

const FIRM_NAME = "Matloob Tax & Consulting";
const FIRM_PRACTITIONER = "Abdul H. Matloob, EA";
const FIRM_EA_LINE = "Enrolled to practice before the Internal Revenue Service";
const FIRM_PHONE = "(508) 258-9890";
const FIRM_ADDRESS = "758B Falmouth Road, Hyannis, MA 02601";
const FIRM_EMAIL = "contact@matloob-ea.com";
const FIRM_WEBSITE = "matloobtaxandconsulting.com";

// Palette (matches the portal)
const NAVY = "#1a2744";
const GOLD = "#b8860b";
const IVORY = "#faf9f6";
const INK = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const CIRCULAR_230 =
  "Circular 230 disclosure: Any tax advice contained in this message is not intended to be used, and cannot be used, to avoid tax-related penalties.";

const UNSUB_LINE =
  `You're receiving this because you have a ${FIRM_NAME} portal account. ` +
  `If this reached you in error, please reply so we can remove you.`;

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

interface EmailBody {
  /** Main heading */
  heading: string;
  /** Preheader (snippet) — shown in many mail clients' inbox preview */
  preheader: string;
  /** Body paragraphs as plain strings; rendered into styled <p> tags */
  paragraphs: string[];
  /** Optional call-to-action button */
  cta?: { label: string; url: string };
  /** Optional data rows rendered as a definition list */
  details?: { label: string; value: string }[];
  /** Optional callout block (e.g., checklist) — raw HTML string already sanitized */
  calloutHtml?: string;
}

/**
 * Shared chrome: letterhead, body, footer, Circular 230.
 * No external images. All inline CSS. Table-based for mail-client safety.
 */
function renderLayout(body: EmailBody): { html: string; text: string } {
  const { heading, preheader, paragraphs, cta, details, calloutHtml } = body;

  const detailsHtml = details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:16px 0;">
         ${details
           .map(
             (d) => `
           <tr>
             <td style="padding:8px 12px;background:${IVORY};border:1px solid ${BORDER};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;width:35%;">${escapeHtml(
               d.label,
             )}</td>
             <td style="padding:8px 12px;background:#ffffff;border:1px solid ${BORDER};font-size:14px;color:${INK};">${escapeHtml(
               d.value,
             )}</td>
           </tr>`,
           )
           .join("")}
       </table>`
    : "";

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
         <tr><td style="background:${NAVY};border-radius:4px;">
           <a href="${cta.url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${escapeHtml(
             cta.label,
           )}</a>
         </td></tr>
       </table>`
    : "";

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK};">${p}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${IVORY};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
    <!-- preheader (hidden) -->
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
      preheader,
    )}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${IVORY};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:6px;">
            <!-- Letterhead -->
            <tr>
              <td style="padding:28px 32px 20px;border-bottom:3px solid ${GOLD};">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${NAVY};font-weight:600;letter-spacing:-0.01em;">${FIRM_NAME}</div>
                <div style="font-size:13px;color:${MUTED};margin-top:4px;">${FIRM_PRACTITIONER} · ${FIRM_EA_LINE}</div>
                <div style="font-size:12px;color:${MUTED};margin-top:2px;">${FIRM_PHONE} · ${FIRM_ADDRESS}</div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${NAVY};font-weight:600;letter-spacing:-0.01em;">${escapeHtml(
                  heading,
                )}</h1>
                ${paragraphsHtml}
                ${detailsHtml}
                ${calloutHtml || ""}
                ${ctaHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 32px 28px;border-top:1px solid ${BORDER};">
                <div style="font-size:12px;color:${MUTED};line-height:1.5;margin-top:12px;">
                  ${FIRM_NAME} · ${FIRM_PRACTITIONER}<br/>
                  ${FIRM_ADDRESS} · ${FIRM_PHONE}<br/>
                  <a href="mailto:${FIRM_EMAIL}" style="color:${NAVY};text-decoration:none;">${FIRM_EMAIL}</a> ·
                  <a href="https://${FIRM_WEBSITE}" style="color:${NAVY};text-decoration:none;">${FIRM_WEBSITE}</a>
                </div>
                <div style="font-size:11px;color:${MUTED};line-height:1.5;margin-top:12px;">${UNSUB_LINE}</div>
                <div style="font-size:11px;color:${MUTED};line-height:1.5;margin-top:8px;font-style:italic;">${CIRCULAR_230}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // ---- plaintext ----
  const textLines: string[] = [];
  textLines.push(`${FIRM_NAME}`);
  textLines.push(`${FIRM_PRACTITIONER} — ${FIRM_EA_LINE}`);
  textLines.push(`${FIRM_PHONE} · ${FIRM_ADDRESS}`);
  textLines.push("");
  textLines.push(heading);
  textLines.push("");
  textLines.push(...paragraphs.map((p) => p.replace(/<[^>]+>/g, "")));
  if (details?.length) {
    textLines.push("");
    for (const d of details) textLines.push(`  ${d.label}: ${d.value}`);
  }
  if (cta) {
    textLines.push("");
    textLines.push(`${cta.label}: ${cta.url}`);
  }
  textLines.push("");
  textLines.push("—");
  textLines.push(`${FIRM_NAME} · ${FIRM_PRACTITIONER}`);
  textLines.push(`${FIRM_ADDRESS}`);
  textLines.push(`${FIRM_PHONE} · ${FIRM_EMAIL} · ${FIRM_WEBSITE}`);
  textLines.push("");
  textLines.push(UNSUB_LINE);
  textLines.push("");
  textLines.push(CIRCULAR_230);

  return { html, text: textLines.join("\n") };
}

// ---- Individual templates ---------------------------------------------------

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export function signupReceivedClient(args: { firstName: string }): Rendered {
  const { html, text } = renderLayout({
    heading: "Thanks for signing up",
    preheader: "Your portal account is under review — we'll email you once it's approved.",
    paragraphs: [
      `Hi ${escapeHtml(args.firstName)},`,
      `Thanks for signing up with ${FIRM_NAME}. Your account is under review. We'll email you the moment it's approved — typically within one business day.`,
      `If you have an urgent question, please call the office at ${FIRM_PHONE} or reply to this email.`,
    ],
  });
  return { subject: `We received your ${FIRM_NAME} portal signup`, html, text };
}

export function signupAlertAdmin(args: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  portalUrl: string;
}): Rendered {
  const reviewUrl = `${args.portalUrl.replace(/\/$/, "")}/#/admin/clients`;
  const { html, text } = renderLayout({
    heading: "New client signup — pending approval",
    preheader: `${args.firstName} ${args.lastName} (${args.email}) is waiting for approval.`,
    paragraphs: [
      `A new client has signed up for your portal and is awaiting approval.`,
    ],
    details: [
      { label: "Name", value: `${args.firstName} ${args.lastName}` },
      { label: "Email", value: args.email },
      { label: "Phone", value: args.phone || "—" },
    ],
    cta: { label: "Review in Portal", url: reviewUrl },
  });
  return {
    subject: `New client signup: ${args.firstName} ${args.lastName}`,
    html,
    text,
  };
}

export function accountApprovedClient(args: {
  firstName: string;
  portalUrl: string;
}): Rendered {
  const signInUrl = `${args.portalUrl.replace(/\/$/, "")}/#/signin`;
  const { html, text } = renderLayout({
    heading: "Your portal account is approved",
    preheader: "You can now sign in and begin exchanging documents securely.",
    paragraphs: [
      `Hi ${escapeHtml(args.firstName)},`,
      `Your ${FIRM_NAME} portal account is approved. You can sign in now to upload documents, view resources, and message Abdul directly.`,
      `All files are encrypted at rest (AES-256-GCM) and access is logged.`,
    ],
    cta: { label: "Sign in to your portal", url: signInUrl },
  });
  return { subject: `Your ${FIRM_NAME} portal account is approved`, html, text };
}

export function accountSuspendedClient(args: { firstName: string }): Rendered {
  const { html, text } = renderLayout({
    heading: "Your portal access has been suspended",
    preheader: "Please contact the firm to restore access.",
    paragraphs: [
      `Hi ${escapeHtml(args.firstName)},`,
      `Access to your ${FIRM_NAME} portal account has been temporarily suspended. Your documents remain secure and are not affected.`,
      `Please call ${FIRM_PHONE} or reply to this email and we'll get you reconnected.`,
    ],
  });
  return { subject: `Your ${FIRM_NAME} portal access`, html, text };
}

export function fileUploadedToClient(args: {
  firstName: string;
  fileName: string;
  portalUrl: string;
}): Rendered {
  const filesUrl = `${args.portalUrl.replace(/\/$/, "")}/#/client/files`;
  const { html, text } = renderLayout({
    heading: "A new document is waiting in your portal",
    preheader: `${args.fileName} has been uploaded for your review.`,
    paragraphs: [
      `Hi ${escapeHtml(args.firstName)},`,
      `Abdul uploaded a new document to your portal: <strong>${escapeHtml(args.fileName)}</strong>.`,
      `Sign in to view or download it. Documents are encrypted at rest and the download is logged in the firm's audit trail.`,
    ],
    cta: { label: "Open your documents", url: filesUrl },
  });
  return { subject: `New document in your ${FIRM_NAME} portal`, html, text };
}

export function fileUploadedByClient(args: {
  firstName: string;
  lastName: string;
  fileName: string;
  adminPortalUrl: string;
}): Rendered {
  const filesUrl = `${args.adminPortalUrl.replace(/\/$/, "")}/#/admin/clients`;
  const { html, text } = renderLayout({
    heading: "Client uploaded a new document",
    preheader: `${args.firstName} ${args.lastName} uploaded ${args.fileName}.`,
    paragraphs: [
      `${escapeHtml(args.firstName)} ${escapeHtml(args.lastName)} uploaded a new document to their portal: <strong>${escapeHtml(
        args.fileName,
      )}</strong>.`,
    ],
    cta: { label: "Review in Portal", url: filesUrl },
  });
  return {
    subject: `${args.firstName} ${args.lastName} uploaded ${args.fileName}`,
    html,
    text,
  };
}

export function passwordResetEmail(args: {
  firstName: string;
  resetUrl: string;
}): Rendered {
  const { html, text } = renderLayout({
    heading: "Reset your portal password",
    preheader: "This secure link expires in one hour.",
    paragraphs: [
      `Hi ${escapeHtml(args.firstName)},`,
      `We received a request to reset the password on your ${FIRM_NAME} portal account. Click the button below to choose a new password. This link will expire in one hour.`,
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
    ],
    cta: { label: "Reset password", url: args.resetUrl },
  });
  return { subject: `Reset your ${FIRM_NAME} portal password`, html, text };
}

export function newMessageClient(args: {
  firstName: string;
  preview: string;
  portalUrl: string;
}): Rendered {
  const messagesUrl = `${args.portalUrl.replace(/\/$/, "")}/#/client/messages`;
  const { html, text } = renderLayout({
    heading: "New message from Abdul",
    preheader: args.preview.slice(0, 120),
    paragraphs: [
      `Hi ${escapeHtml(args.firstName)},`,
      `You have a new message in your portal.`,
      `<em style="color:${MUTED};">"${escapeHtml(args.preview.slice(0, 240))}${args.preview.length > 240 ? "…" : ""}"</em>`,
    ],
    cta: { label: "Read in Portal", url: messagesUrl },
  });
  return { subject: `New message in your ${FIRM_NAME} portal`, html, text };
}

export function newMessageAdmin(args: {
  clientName: string;
  preview: string;
  adminPortalUrl: string;
}): Rendered {
  const messagesUrl = `${args.adminPortalUrl.replace(/\/$/, "")}/#/admin/clients`;
  const { html, text } = renderLayout({
    heading: `New message from ${args.clientName}`,
    preheader: args.preview.slice(0, 120),
    paragraphs: [
      `${escapeHtml(args.clientName)} sent you a message in the portal.`,
      `<em style="color:${MUTED};">"${escapeHtml(args.preview.slice(0, 240))}${args.preview.length > 240 ? "…" : ""}"</em>`,
    ],
    cta: { label: "Open in Portal", url: messagesUrl },
  });
  return { subject: `New portal message from ${args.clientName}`, html, text };
}
