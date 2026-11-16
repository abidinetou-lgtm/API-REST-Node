import { describe, expect, it } from "vitest";
import { escapeHtml, invitationEmail, passwordResetEmail } from "../../src/lib/email-templates.js";

describe("escapeHtml", () => {
  it("neutralizes HTML characters", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
  });
});

describe("emails", () => {
  it("put the token in the front-end link", () => {
    const email = invitationEmail("Paul", "abc_123-XYZ", 48);

    expect(email.html).toContain("http://localhost:5173/accept-invitation?token=abc_123-XYZ");
    expect(email.text).toContain("http://localhost:5173/accept-invitation?token=abc_123-XYZ");
    expect(email.text).toContain("48 hours");
  });

  it("cannot be used to inject HTML through the user name", () => {
    const email = passwordResetEmail('<img src=x onerror="steal()">', "token", 30);

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });
});
