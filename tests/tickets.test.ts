import { describe, expect, it } from "vitest";
import { api, bearer, loginAs } from "./helpers.js";

const validTicket = { title: "Black screen", description: "My screen stays black at startup" };

describe("Tickets", () => {
  it("require authentication", async () => {
    expect((await api().get("/tickets")).status).toBe(401);
    expect((await api().post("/tickets").send(validTicket)).status).toBe(401);
  });

  it("are created as OPEN and owned by the connected user", async () => {
    const { user, token } = await loginAs("USER");
    const res = await api().post("/tickets").set(bearer(token)).send(validTicket);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...validTicket, status: "OPEN", createdBy: { id: user.id } });
  });

  it("cannot be created on behalf of someone else", async () => {
    const { user, token } = await loginAs("USER");
    const { user: other } = await loginAs("ADMIN");

    const res = await api()
      .post("/tickets")
      .set(bearer(token))
      .send({ ...validTicket, createdById: other.id });

    expect(res.body.createdBy.id).toBe(user.id);
  });

  it("validate the body", async () => {
    const { token } = await loginAs("USER");
    const res = await api().post("/tickets").set(bearer(token)).send({ title: "ab" });

    expect(res.status).toBe(400);
    expect(res.body.details.map((detail: { field: string }) => detail.field)).toEqual(["title", "description"]);
  });
});

describe("Ticket visibility", () => {
  it("lets a user see only their own tickets", async () => {
    const alice = await loginAs("USER");
    const bob = await loginAs("USER");

    const aliceTicket = await api().post("/tickets").set(bearer(alice.token)).send(validTicket);
    const bobTicket = await api().post("/tickets").set(bearer(bob.token)).send(validTicket);

    const list = await api().get("/tickets").set(bearer(alice.token));
    expect(list.body.map((ticket: { id: number }) => ticket.id)).toEqual([aliceTicket.body.id]);

    expect((await api().get(`/tickets/${aliceTicket.body.id}`).set(bearer(alice.token))).status).toBe(200);
    // Someone else's ticket answers 404 so its existence is not revealed
    expect((await api().get(`/tickets/${bobTicket.body.id}`).set(bearer(alice.token))).status).toBe(404);
  });

  it("lets the support team see every ticket", async () => {
    const customer = await loginAs("USER");
    await api().post("/tickets").set(bearer(customer.token)).send(validTicket);
    await api().post("/tickets").set(bearer(customer.token)).send(validTicket);

    for (const role of ["SUPER_ADMIN", "ADMIN", "AGENT"] as const) {
      const { token } = await loginAs(role);
      const res = await api().get("/tickets").set(bearer(token));
      expect(res.body).toHaveLength(2);
    }
  });

  it("returns 404 for a missing ticket and 400 for an invalid id", async () => {
    const { token } = await loginAs("AGENT");
    expect((await api().get("/tickets/999999").set(bearer(token))).status).toBe(404);
    expect((await api().get("/tickets/abc").set(bearer(token))).status).toBe(400);
  });
});

describe("PATCH /tickets/:id/status", () => {
  it("is allowed to the support team", async () => {
    const customer = await loginAs("USER");
    const ticket = await api().post("/tickets").set(bearer(customer.token)).send(validTicket);

    for (const [role, status] of [["AGENT", "IN_PROGRESS"], ["ADMIN", "RESOLVED"], ["SUPER_ADMIN", "CLOSED"]] as const) {
      const { token } = await loginAs(role);
      const res = await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(token)).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  it("is forbidden to users, even on their own tickets", async () => {
    const { token } = await loginAs("USER");
    const ticket = await api().post("/tickets").set(bearer(token)).send(validTicket);

    const res = await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(token)).send({ status: "CLOSED" });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown status and a missing ticket", async () => {
    const { token } = await loginAs("AGENT");
    const ticket = await api().post("/tickets").set(bearer(token)).send(validTicket);

    const invalid = await api().patch(`/tickets/${ticket.body.id}/status`).set(bearer(token)).send({ status: "DONE" });
    expect(invalid.status).toBe(400);

    const missing = await api().patch("/tickets/999999/status").set(bearer(token)).send({ status: "CLOSED" });
    expect(missing.status).toBe(404);
  });
});
