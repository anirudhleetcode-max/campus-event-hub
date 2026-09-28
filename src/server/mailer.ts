import "server-only";
import { db } from "./db";
import { env } from "./env";
import { logger } from "./logger";

export type EmailMessage = {
  to: string;
  subject: string;
  /** Template identifier, stored in the email log. */
  template: string;
  html: string;
  text: string;
};

interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ id?: string }>;
}

/** Resend (https://resend.com) over its HTTP API — no SDK needed. */
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private apiKey: string, private from: string) {}
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { id?: string };
    return { id: body.id };
  }
}

function provider(): EmailProvider | null {
  const e = env();
  if (!e.EMAIL_API_KEY) return null;
  return new ResendProvider(e.EMAIL_API_KEY, e.EMAIL_FROM || "Campus Event Hub <no-reply@example.com>");
}

/**
 * Sends a transactional email. Delivery failures are logged (and recorded in
 * email_logs) but never thrown — email is a side channel, the in-app
 * notification is the source of truth.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const p = provider();
  if (!p) {
    await db.emailLog
      .create({ data: { to: msg.to, subject: msg.subject, template: msg.template, status: "SKIPPED", error: "No email provider configured" } })
      .catch(() => undefined);
    logger.debug("Email skipped (no provider configured)", { template: msg.template });
    return;
  }
  try {
    const { id } = await p.send(msg);
    await db.emailLog.create({ data: { to: msg.to, subject: msg.subject, template: msg.template, status: "SENT", providerId: id } });
  } catch (err) {
    logger.error("Email delivery failed", { template: msg.template, error: err });
    await db.emailLog
      .create({ data: { to: msg.to, subject: msg.subject, template: msg.template, status: "FAILED", error: String(err).slice(0, 500) } })
      .catch(() => undefined);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, client-safe HTML layout for transactional emails. */
export function emailLayout(opts: { heading: string; paragraphs: string[]; cta?: { label: string; url: string } }): { html: string; text: string } {
  const body = opts.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6;color:#334155">${esc(p)}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="background:#3b4fd8;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(opts.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 32px"><div style="font-weight:700;color:#3b4fd8;margin-bottom:20px">Campus Event Hub</div>
<h1 style="font-size:20px;margin:0 0 16px;color:#0f172a">${esc(opts.heading)}</h1>${body}${cta}
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">You received this email because of activity on your Campus Event Hub account.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [opts.heading, "", ...opts.paragraphs, opts.cta ? `\n${opts.cta.label}: ${opts.cta.url}` : ""].join("\n");
  return { html, text };
}
