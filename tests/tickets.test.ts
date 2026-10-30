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
    expect(list.body.data.map((ticket: { id: string }) => ticket.id)).toEqual([aliceTicket.body.id]);

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
      expect(res.body.data).toHaveLength(2);
    }
  });

  it("returns 404 for a missing ticket and 400 for an invalid id", async () => {
    const { token } = await loginAs("AGENT");
    expect((await api().get("/tickets/0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70").set(bearer(token))).status).toBe(404);
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

    const missing = await api().patch("/tickets/0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70/status").set(bearer(token)).send({ status: "CLOSED" });
    expect(missing.status).toBe(404);
  });
});

describe("GET /tickets pagination, filters and sorting", () => {
  async function createTickets(token: string, titles: string[]) {
    const tickets = [];
    for (const title of titles) {
      const res = await api()
        .post("/tickets")
        .set(bearer(token))
        .send({ title, description: `Description of ${title}` });
      tickets.push(res.body);
    }
    return tickets;
  }

  it("paginates and returns the pagination info", async () => {
    const { token } = await loginAs("AGENT");
    await createTickets(token, ["First ticket", "Second ticket", "Third ticket"]);

    const firstPage = await api().get("/tickets?limit=2").set(bearer(token));
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const secondPage = await api().get("/tickets?limit=2&page=2").set(bearer(token));
    expect(secondPage.body.data).toHaveLength(1);

    const ids = [...firstPage.body.data, ...secondPage.body.data].map((ticket: { id: string }) => ticket.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("filters by one or several statuses", async () => {
    const { token } = await loginAs("AGENT");
    const [open, inProgress, closed] = await createTickets(token, ["Ticket one", "Ticket two", "Ticket three"]);
    await api().patch(`/tickets/${inProgress.id}/status`).set(bearer(token)).send({ status: "IN_PROGRESS" });
    await api().patch(`/tickets/${closed.id}/status`).set(bearer(token)).send({ status: "CLOSED" });

    const res = await api().get("/tickets?status=OPEN,IN_PROGRESS").set(bearer(token));
    const ids = res.body.data.map((ticket: { id: string }) => ticket.id);
    expect(ids.sort()).toEqual([open.id, inProgress.id].sort());
  });

  it("searches in the title and the description, ignoring case", async () => {
    const { token } = await loginAs("AGENT");
    const [printer] = await createTickets(token, ["Printer jammed", "Screen broken"]);

    const res = await api().get("/tickets?search=PRINTER").set(bearer(token));
    expect(res.body.data.map((ticket: { id: string }) => ticket.id)).toEqual([printer.id]);
  });

  it("sorts on an allowed field", async () => {
    const { token } = await loginAs("AGENT");
    await createTickets(token, ["Bravo ticket", "Charlie ticket", "Alpha ticket"]);

    const res = await api().get("/tickets?sort=title&order=asc").set(bearer(token));
    expect(res.body.data.map((ticket: { title: string }) => ticket.title)).toEqual([
      "Alpha ticket",
      "Bravo ticket",
      "Charlie ticket",
    ]);
  });

  it("rejects invalid query parameters", async () => {
    const { token } = await loginAs("AGENT");

    for (const query of ["limit=1000", "page=0", "sort=passwordHash", "status=DONE", "createdById=1"]) {
      const res = await api().get(`/tickets?${query}`).set(bearer(token));
      expect(res.status, query).toBe(400);
    }
  });

  it("does not let a user see other tickets through the filters", async () => {
    const alice = await loginAs("USER");
    const bob = await loginAs("USER");
    await createTickets(bob.token, ["Bob ticket"]);

    const res = await api().get(`/tickets?createdById=${bob.user.id}`).set(bearer(alice.token));
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it("treats SQL in the search as plain text", async () => {
    const { token } = await loginAs("AGENT");
    await createTickets(token, ["Normal ticket"]);

    const injection = encodeURIComponent("' OR 1=1; DROP TABLE \"Ticket\"; --");
    const res = await api().get(`/tickets?search=${injection}`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);

    const all = await api().get("/tickets").set(bearer(token));
    expect(all.body.meta.total).toBe(1);
  });
});
