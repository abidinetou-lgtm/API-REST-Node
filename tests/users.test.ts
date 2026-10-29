import { describe, expect, it } from "vitest";
import { PASSWORD, api, bearer, createUser, emailToken, login, loginAs } from "./helpers.js";

describe("POST /users", () => {
  it("lets the super admin create an account and sends the invitation", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const res = await api()
      .post("/users")
      .set(bearer(token))
      .send({ email: "agent@example.com", name: "Karim", role: "AGENT" });

    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(true);
    expect(res.body.user).toMatchObject({ email: "agent@example.com", role: "AGENT", status: "PENDING" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(emailToken("agent@example.com")).toBeDefined();
  });

  it("refuses an email already in use", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    await createUser({ email: "taken@example.com" });

    const res = await api()
      .post("/users")
      .set(bearer(token))
      .send({ email: "taken@example.com", name: "Someone", role: "USER" });
    expect(res.status).toBe(409);
  });

  it("cannot create another super admin", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const res = await api()
      .post("/users")
      .set(bearer(token))
      .send({ email: "boss@example.com", name: "Boss", role: "SUPER_ADMIN" });
    expect(res.status).toBe(400);
  });

  it("is reserved to the super admin", async () => {
    for (const role of ["ADMIN", "AGENT", "USER"] as const) {
      const { token } = await loginAs(role);
      const res = await api()
        .post("/users")
        .set(bearer(token))
        .send({ email: `new-${role}@example.com`, name: "Someone", role: "USER" });
      expect(res.status).toBe(403);
    }
  });
});

describe("GET /users", () => {
  it("is available to super admins and admins only", async () => {
    const expected = { SUPER_ADMIN: 200, ADMIN: 200, AGENT: 403, USER: 403 } as const;

    for (const [role, status] of Object.entries(expected)) {
      const { token } = await loginAs(role as keyof typeof expected);
      expect((await api().get("/users").set(bearer(token))).status).toBe(status);
    }

    expect((await api().get("/users")).status).toBe(401);
  });

  it("shows the account status without the password hash", async () => {
    const { token } = await loginAs("ADMIN");
    const pending = await createUser({ pending: true });
    const disabled = await createUser({ isActive: false });

    const res = await api().get("/users").set(bearer(token));
    const byId = new Map(res.body.map((user: { id: number }) => [user.id, user]));

    expect(byId.get(pending.id)).toMatchObject({ status: "PENDING" });
    expect(byId.get(disabled.id)).toMatchObject({ status: "DISABLED" });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

describe("Disable and enable accounts", () => {
  it("lets an admin disable and enable an agent", async () => {
    const { token } = await loginAs("ADMIN");
    const agent = await createUser({ role: "AGENT" });
    const agentSession = await login(agent.email);

    const disable = await api().patch(`/users/${agent.id}/disable`).set(bearer(token));
    expect(disable.status).toBe(200);
    expect(disable.body.status).toBe("DISABLED");

    expect((await api().get("/tickets").set(bearer(agentSession.token))).status).toBe(401);
    expect((await api().post("/auth/refresh").set("Cookie", agentSession.cookie!)).status).toBe(401);
    expect((await login(agent.email)).res.status).toBe(403);

    const enable = await api().patch(`/users/${agent.id}/enable`).set(bearer(token));
    expect(enable.body.status).toBe("ACTIVE");
    expect((await login(agent.email)).res.status).toBe(200);
  });

  it("does not let an admin manage another admin or the super admin", async () => {
    const { token } = await loginAs("ADMIN");
    const otherAdmin = await createUser({ role: "ADMIN" });
    const superAdmin = await createUser({ role: "SUPER_ADMIN" });

    expect((await api().patch(`/users/${otherAdmin.id}/disable`).set(bearer(token))).status).toBe(403);
    expect((await api().patch(`/users/${superAdmin.id}/disable`).set(bearer(token))).status).toBe(403);
  });

  it("lets the super admin manage admins", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const admin = await createUser({ role: "ADMIN" });

    expect((await api().patch(`/users/${admin.id}/disable`).set(bearer(token))).status).toBe(200);
    expect((await api().patch(`/users/${admin.id}/enable`).set(bearer(token))).status).toBe(200);
  });

  it("does not let anyone disable their own account", async () => {
    const { user, token } = await loginAs("SUPER_ADMIN");
    const res = await api().patch(`/users/${user.id}/disable`).set(bearer(token));
    expect(res.status).toBe(400);
  });

  it("is forbidden to agents and users", async () => {
    const target = await createUser();
    for (const role of ["AGENT", "USER"] as const) {
      const { token } = await loginAs(role);
      expect((await api().patch(`/users/${target.id}/disable`).set(bearer(token))).status).toBe(403);
    }
  });

  it("returns 404 for an unknown user", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    expect((await api().patch("/users/999999/disable").set(bearer(token))).status).toBe(404);
  });
});

describe("POST /users/:id/resend-invitation", () => {
  it("sends a new link and invalidates the previous one", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const created = await api()
      .post("/users")
      .set(bearer(token))
      .send({ email: "slow@example.com", name: "Slow", role: "USER" });
    const firstLink = emailToken("slow@example.com");

    const resend = await api().post(`/users/${created.body.user.id}/resend-invitation`).set(bearer(token));
    expect(resend.status).toBe(204);
    const secondLink = emailToken("slow@example.com");
    expect(secondLink).not.toBe(firstLink);

    expect((await api().post("/auth/accept-invitation").send({ token: firstLink, password: PASSWORD })).status).toBe(400);
    expect((await api().post("/auth/accept-invitation").send({ token: secondLink, password: PASSWORD })).status).toBe(204);
  });

  it("refuses an account that already accepted its invitation", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const user = await createUser();
    const res = await api().post(`/users/${user.id}/resend-invitation`).set(bearer(token));
    expect(res.status).toBe(409);
  });
});
