import nodemailer, { type Transporter } from "nodemailer";
import { logEvent } from "./store";

/**
 * Email over SMTP (free with a Gmail app password, Brevo, etc.: SMTP_HOST/PORT/USER/PASS/FROM).
 * Without SMTP config it uses a free Ethereal test inbox and returns a preview link — clearly a test send.
 */
let transport: Promise<{ t: Transporter; from: string; test: boolean }> | null = null;
function getTransport() {
  transport ??= (async () => {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT || 587);
      return {
        t: nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }),
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "Relay <no-reply@relay.local>", test: false,
      };
    }
    const acct = await nodemailer.createTestAccount();
    return { t: nodemailer.createTransport({ host: acct.smtp.host, port: acct.smtp.port, secure: acct.smtp.secure, auth: { user: acct.user, pass: acct.pass } }), from: `Relay Reports <${acct.user}>`, test: true };
  })().catch((e) => { transport = null; throw e; });
  return transport;
}

export const emailMode = () => (process.env.SMTP_HOST ? "smtp" : "test inbox (Ethereal)");

export async function sendEmail(workspaceId: string, msg: { to: string[]; subject: string; html: string; text: string }) {
  try {
    const { t, from, test } = await getTransport();
    const info = await t.sendMail({ from, to: msg.to.join(", "), subject: msg.subject, html: msg.html, text: msg.text });
    const previewUrl = test ? nodemailer.getTestMessageUrl(info) || null : null;
    await logEvent({ workspaceId, provider: "email", direction: "outbound", kind: "report.sent", reference: info.messageId, result: "success", detail: { to: msg.to, previewUrl } });
    return { id: info.messageId, previewUrl: previewUrl as string | null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await logEvent({ workspaceId, provider: "email", direction: "outbound", kind: "report.sent", result: "failure", error, detail: { to: msg.to } });
    throw new Error(`Email couldn't be sent: ${error}`);
  }
}
