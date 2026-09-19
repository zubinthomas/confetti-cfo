// Sends real email via SMTP - currently only the forgot-password flow
// (routes/auth.ts) uses this. Reads SMTP_HOST/PORT/USER/PASS/EMAIL_FROM
// straight from process.env at call time, same convention every other
// runtime-config read in this codebase follows (see routes/integrations.ts) -
// the `settings` table is a display/audit copy only, not a live config
// source (see db/settings.ts).
import nodemailer from 'nodemailer';

export class MailNotConfiguredError extends Error {}

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    throw new MailNotConfiguredError('SMTP is not configured (SMTP_HOST/PORT/USER/PASS)');
  }
  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const transport = buildTransport();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  return transport.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
}
