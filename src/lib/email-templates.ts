import { env } from "../config/env.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(title: string, body: string) {
  return `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-top: 0;">${title}</h2>
      ${body}
      <p style="color: #6b7280; font-size: 13px;">${escapeHtml(env.MAIL_FROM_NAME)}</p>
    </div>
  </body>
</html>`;
}

function button(link: string, label: string) {
  return `<p><a href="${link}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;">${label}</a></p>`;
}

export function invitationEmail(name: string, token: string, expiresInHours: number) {
  const link = `${env.APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`;

  return {
    subject: "You have been invited",
    html: layout(
      `Welcome ${escapeHtml(name)}`,
      `<p>An account has been created for you. Click the button below to choose your password.</p>
      ${button(link, "Set my password")}
      <p>This link expires in ${expiresInHours} hours.</p>`,
    ),
    text: `Welcome ${name},\n\nAn account has been created for you. Choose your password here:\n${link}\n\nThis link expires in ${expiresInHours} hours.`,
  };
}

export function passwordResetEmail(name: string, token: string, expiresInMinutes: number) {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  return {
    subject: "Reset your password",
    html: layout(
      `Hello ${escapeHtml(name)}`,
      `<p>We received a request to reset your password. Click the button below to choose a new one.</p>
      ${button(link, "Reset my password")}
      <p>This link expires in ${expiresInMinutes} minutes and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>`,
    ),
    text: `Hello ${name},\n\nReset your password here:\n${link}\n\nThis link expires in ${expiresInMinutes} minutes and can only be used once.\nIf you did not request this, you can ignore this email.`,
  };
}
