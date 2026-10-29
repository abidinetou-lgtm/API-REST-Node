import { env } from "../config/env.js";

type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail(email: Email) {
  // Without an API key (local development), print the email instead of sending it
  if (!env.BREVO_API_KEY) {
    console.log(`\n--- Email to ${email.to} ---\nSubject: ${email.subject}\n\n${email.text}\n---------------\n`);
    return;
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email sending failed (${response.status}): ${await response.text()}`);
  }
}
