import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { PASSWORD, api, bearer, createUser, emailToken, login, loginAs } from "./helpers.js";

describe("POST /auth/login", () => {
  it("returns an access token and sets the refresh token in an httpOnly cookie", async () => {
    const user = await createUser({ role: "AGENT" });
    const { res } = await login(user.email);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ id: user.id, role: "AGENT" });
    expect(res.body.refreshToken).toBeUndefined();

    const cookie = [res.headers["set-cookie"]].flat().join(";");
    expect(cookie).toContain("refresh_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/auth");
  });

  it("accepts the email whatever its case and surrounding spaces", async () => {
    const user = await createUser({ email: "paul@example.com" });
    const { res } = await login("  PAUL@Example.com ");
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const user = await createUser();
    const wrongPassword = await login(user.email, "WrongPassword1");
    const unknownEmail = await login("nobody@example.com", "WrongPassword1");

    expect(wrongPassword.res.status).toBe(401);
    expect(unknownEmail.res.status).toBe(401);
    expect(wrongPassword.res.body).toEqual(unknownEmail.res.body);
  });

  it("refuses an account that has not accepted its invitation", async () => {
    const user = await createUser({ pending: true });
    const { res } = await login(user.email);
    expect(res.status).toBe(401);
  });

  it("refuses a disabled account", async () => {
    const user = await createUser({ isActive: false });
    const { res } = await login(user.email);
    expect(res.status).toBe(403);
  });

  it("validates the body", async () => {
    const res = await api().post("/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("GET /auth/me", () => {
  it("returns the connected user", async () => {
    const { user, token } = await loginAs("USER");
    const res = await api().get("/auth/me").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: user.email, name: user.name, role: "USER" });
  });

  it("requires a valid token", async () => {
    expect((await api().get("/auth/me")).status).toBe(401);
    expect((await api().get("/auth/me").set(bearer("invalid.token.value"))).status).toBe(401);
  });

  it("blocks a disabled account immediately, even with a valid token", async () => {
    const { user, token } = await loginAs("AGENT");
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await api().get("/auth/me").set(bearer(token));
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("issues a new access token and rotates the refresh token", async () => {
    const { cookie } = await loginAs("USER");
    const res = await api().post("/auth/refresh").set("Cookie", cookie!);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect([res.headers["set-cookie"]].flat().join(";")).not.toContain(cookie!);
  });

  it("closes every session when an old refresh token is reused", async () => {
    const { cookie: first } = await loginAs("USER");
    const rotated = await api().post("/auth/refresh").set("Cookie", first!);
    const second = [rotated.headers["set-cookie"]].flat()[0]!.split(";")[0]!;

    const reuse = await api().post("/auth/refresh").set("Cookie", first!);
    expect(reuse.status).toBe(401);

    const afterTheft = await api().post("/auth/refresh").set("Cookie", second);
    expect(afterTheft.status).toBe(401);
  });

  it("requires the cookie", async () => {
    const res = await api().post("/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token", async () => {
    const { cookie } = await loginAs("USER");

    const logout = await api().post("/auth/logout").set("Cookie", cookie!);
    expect(logout.status).toBe(204);

    const refresh = await api().post("/auth/refresh").set("Cookie", cookie!);
    expect(refresh.status).toBe(401);
  });
});

describe("Invitation", () => {
  it("lets an invited user choose a password, only once", async () => {
    const { token: adminToken } = await loginAs("SUPER_ADMIN");
    await api()
      .post("/users")
      .set(bearer(adminToken))
      .send({ email: "new@example.com", name: "New User", role: "USER" });

    const invitation = emailToken("new@example.com");
    expect(invitation).toBeDefined();

    const weak = await api().post("/auth/accept-invitation").send({ token: invitation, password: "short" });
    expect(weak.status).toBe(400);

    const accept = await api().post("/auth/accept-invitation").send({ token: invitation, password: PASSWORD });
    expect(accept.status).toBe(204);

    const reuse = await api().post("/auth/accept-invitation").send({ token: invitation, password: PASSWORD });
    expect(reuse.status).toBe(400);

    const { res } = await login("new@example.com");
    expect(res.status).toBe(200);
  });

  it("refuses an expired invitation", async () => {
    const { token: adminToken } = await loginAs("SUPER_ADMIN");
    await api()
      .post("/users")
      .set(bearer(adminToken))
      .send({ email: "late@example.com", name: "Late User", role: "USER" });

    await prisma.userToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await api()
      .post("/auth/accept-invitation")
      .send({ token: emailToken("late@example.com"), password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe("Password reset", () => {
  it("answers the same way whether the account exists or not", async () => {
    const user = await createUser();
    const known = await api().post("/auth/forgot-password").send({ email: user.email });
    const unknown = await api().post("/auth/forgot-password").send({ email: "nobody@example.com" });

    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it("resets the password with a single-use link and closes every session", async () => {
    const { user, cookie } = await loginAs("USER");
    await api().post("/auth/forgot-password").send({ email: user.email });

    // The email is sent in the background
    const resetToken = await vi.waitFor(() => {
      const token = emailToken(user.email);
      if (!token) throw new Error("Email not sent yet");
      return token;
    });

    const reset = await api().post("/auth/reset-password").send({ token: resetToken, password: "N3wPassw0rd!" });
    expect(reset.status).toBe(204);

    const reuse = await api().post("/auth/reset-password").send({ token: resetToken, password: "An0therPass!" });
    expect(reuse.status).toBe(400);

    expect((await login(user.email)).res.status).toBe(401);
    expect((await login(user.email, "N3wPassw0rd!")).res.status).toBe(200);
    expect((await api().post("/auth/refresh").set("Cookie", cookie!)).status).toBe(401);
  });
});
