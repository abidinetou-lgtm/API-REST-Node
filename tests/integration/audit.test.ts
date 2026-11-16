import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { PASSWORD, api, bearer, createUser, emailToken, login, loginAs } from "./helpers.js";

function auditLogs() {
  return prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
}

describe("PATCH /users/:id/role", () => {
  it("lets the super admin change a role and records it", async () => {
    const { user: superAdmin, token } = await loginAs("SUPER_ADMIN");
    const agent = await createUser({ role: "AGENT" });

    const res = await api().patch(`/users/${agent.id}/role`).set(bearer(token)).send({ role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ADMIN");

    const [log] = await auditLogs();
    expect(log).toMatchObject({
      action: "USER_ROLE_CHANGED",
      actorId: superAdmin.id,
      targetType: "USER",
      targetId: agent.id,
      metadata: { from: "AGENT", to: "ADMIN" },
      requestId: res.headers["x-request-id"],
    });
    expect(log.ipAddress).toBeTruthy();
  });

  it("applies the new role immediately, without a new login", async () => {
    const { token: superAdminToken } = await loginAs("SUPER_ADMIN");
    const customer = await loginAs("USER");
    const ticket = await api().post("/tickets").set(bearer(customer.token)).send({
      title: "Broken keyboard",
      description: "Some keys do not work anymore",
    });

    const before = await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(customer.token)).send({ status: "CLOSED" });
    expect(before.status).toBe(403);

    await api().patch(`/users/${customer.user.id}/role`).set(bearer(superAdminToken)).send({ role: "AGENT" });

    const after = await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(customer.token)).send({ status: "CLOSED" });
    expect(after.status).toBe(200);
  });

  it("enforces the role rules", async () => {
    const { user: superAdmin, token } = await loginAs("SUPER_ADMIN");
    const otherSuperAdmin = await createUser({ role: "SUPER_ADMIN" });
    const user = await createUser();
    const admin = await loginAs("ADMIN");

    const cases = [
      { id: superAdmin.id, role: "ADMIN", token, status: 400 },
      { id: otherSuperAdmin.id, role: "ADMIN", token, status: 403 },
      { id: user.id, role: "SUPER_ADMIN", token, status: 400 },
      { id: user.id, role: "AGENT", token: admin.token, status: 403 },
      { id: "0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70", role: "AGENT", token, status: 404 },
    ];

    for (const { id, role, token: authToken, status } of cases) {
      const res = await api().patch(`/users/${id}/role`).set(bearer(authToken)).send({ role });
      expect(res.status, `${role} on ${id}`).toBe(status);
    }

    // Refused actions leave no trace
    expect(await auditLogs()).toEqual([]);
  });

  it("does not record anything when the role is the same", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const agent = await createUser({ role: "AGENT" });

    const res = await api().patch(`/users/${agent.id}/role`).set(bearer(token)).send({ role: "AGENT" });
    expect(res.status).toBe(200);
    expect(await auditLogs()).toEqual([]);
  });
});

describe("Audit logs", () => {
  it("record account creation, deactivation and reactivation", async () => {
    const { user: superAdmin, token } = await loginAs("SUPER_ADMIN");

    const created = await api()
      .post("/users")
      .set(bearer(token))
      .send({ email: "new@example.com", name: "Newcomer", role: "USER" });
    const id = created.body.user.id;

    await api().patch(`/users/${id}/disable`).set(bearer(token));
    // Disabling twice only records one action
    await api().patch(`/users/${id}/disable`).set(bearer(token));
    await api().patch(`/users/${id}/enable`).set(bearer(token));

    const logs = await auditLogs();
    expect(logs.map((log) => log.action)).toEqual(["USER_CREATED", "USER_DISABLED", "USER_ENABLED"]);
    expect(logs.every((log) => log.actorId === superAdmin.id && log.targetId === id)).toBe(true);
    expect(logs[0].metadata).toEqual({ email: "new@example.com", role: "USER" });
  });

  it("record the invitation acceptance by the user", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const created = await api()
      .post("/users")
      .set(bearer(token))
      .send({ email: "invited@example.com", name: "Invited", role: "USER" });

    await api()
      .post("/auth/accept-invitation")
      .send({ token: emailToken("invited@example.com"), password: PASSWORD });

    const logs = await auditLogs();
    expect(logs.at(-1)).toMatchObject({
      action: "INVITATION_ACCEPTED",
      actorId: created.body.user.id,
      targetId: created.body.user.id,
    });
  });

  it("record a ticket status change with the previous status", async () => {
    const agent = await loginAs("AGENT");
    const ticket = await api().post("/tickets").set(bearer(agent.token)).send({
      title: "Slow network",
      description: "Pages take a minute to load",
    });

    await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(agent.token)).send({ status: "IN_PROGRESS" });
    await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(agent.token)).send({ status: "IN_PROGRESS" });

    const logs = await auditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "TICKET_STATUS_CHANGED",
      actorId: agent.user.id,
      targetType: "TICKET",
      targetId: ticket.body.id,
      metadata: { from: "OPEN", to: "IN_PROGRESS" },
    });
  });

  it("record the reuse of a stolen refresh token", async () => {
    const user = await createUser();
    const { cookie: oldCookie } = await login(user.email);

    await api().post("/auth/refresh").set("Cookie", oldCookie!);
    await api().post("/auth/refresh").set("Cookie", oldCookie!);

    const [log] = await auditLogs();
    expect(log).toMatchObject({ action: "REFRESH_TOKEN_REUSED", actorId: null, targetId: user.id });
  });

  it("cannot be modified or deleted", async () => {
    const { token } = await loginAs("SUPER_ADMIN");
    const agent = await createUser({ role: "AGENT" });
    await api().patch(`/users/${agent.id}/disable`).set(bearer(token));
    const [log] = await auditLogs();

    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { actorId: null } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow();
    expect(await auditLogs()).toHaveLength(1);
  });
});

describe("GET /audit-logs", () => {
  it("is reserved to the super admin", async () => {
    const expected = { SUPER_ADMIN: 200, ADMIN: 403, AGENT: 403, USER: 403 } as const;

    for (const [role, status] of Object.entries(expected)) {
      const { token } = await loginAs(role as keyof typeof expected);
      expect((await api().get("/audit-logs").set(bearer(token))).status).toBe(status);
    }
  });

  it("lists the logs with their author, filtered and paginated", async () => {
    const { user: superAdmin, token } = await loginAs("SUPER_ADMIN");
    const first = await createUser({ role: "AGENT" });
    const second = await createUser({ role: "AGENT" });

    await api().patch(`/users/${first.id}/disable`).set(bearer(token));
    await api().patch(`/users/${second.id}/disable`).set(bearer(token));
    await api().patch(`/users/${second.id}/role`).set(bearer(token)).send({ role: "USER" });

    const all = await api().get("/audit-logs?limit=2").set(bearer(token));
    expect(all.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(all.body.data[0].action).toBe("USER_ROLE_CHANGED");
    expect(all.body.data[0].actor).toEqual({ id: superAdmin.id, name: superAdmin.name, email: superAdmin.email });

    const byTarget = await api().get(`/audit-logs?targetId=${second.id}`).set(bearer(token));
    expect(byTarget.body.data.map((log: { action: string }) => log.action)).toEqual([
      "USER_ROLE_CHANGED",
      "USER_DISABLED",
    ]);

    const byAction = await api().get("/audit-logs?action=USER_DISABLED").set(bearer(token));
    expect(byAction.body.meta.total).toBe(2);

    expect((await api().get("/audit-logs?action=UNKNOWN").set(bearer(token))).status).toBe(400);
  });
});
