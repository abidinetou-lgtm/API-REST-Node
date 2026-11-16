import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { errorSchema, ticketMessageSchema } from "../../src/docs/response.schemas.js";
import { api, bearer, loginAs } from "./helpers.js";

// The AI is disabled in these tests (no API key): every message waits for a person of the team

const validTicket = { title: "Black screen", description: "My screen stays black at startup" };

async function openTicket(token: string) {
  const res = await api().post("/tickets").set(bearer(token)).send(validTicket);
  return res.body as { id: string; needsAgent: boolean };
}

function write(ticketId: string, token: string, body: string) {
  return api().post(`/tickets/${ticketId}/messages`).set(bearer(token)).send({ body });
}

async function getTicket(ticketId: string, token: string) {
  return (await api().get(`/tickets/${ticketId}`).set(bearer(token))).body;
}

describe("Ticket messages", () => {
  it("let the customer and the support team talk on a ticket", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = await openTicket(customer.token);
    expect(ticket.needsAgent).toBe(true);

    const question = await write(ticket.id, customer.token, "It still does not work");
    expect(question.status).toBe(201);
    expect(ticketMessageSchema.parse(question.body)).toMatchObject({
      authorType: "CUSTOMER",
      author: { id: customer.user.id },
    });

    const answer = await write(ticket.id, agent.token, "Can you send a photo?");
    // The email address of the agent is not shown to the customer
    expect(ticketMessageSchema.parse(answer.body)).toMatchObject({
      authorType: "SUPPORT",
      author: { id: agent.user.id, name: agent.user.name },
    });

    const list = await api().get(`/tickets/${ticket.id}/messages`).set(bearer(customer.token));
    expect(list.status).toBe(200);
    expect(list.body.data.map((message: { body: string }) => message.body)).toEqual([
      "It still does not work",
      "Can you send a photo?",
    ]);
    expect(list.body.meta).toMatchObject({ total: 2, page: 1 });
  });

  it("move a new ticket to IN_PROGRESS when the team answers, and log it", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = await openTicket(customer.token);

    await write(ticket.id, agent.token, "I am looking at it");

    expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "IN_PROGRESS", needsAgent: false });
    const log = await prisma.auditLog.findFirst({ where: { targetId: ticket.id } });
    expect(log).toMatchObject({
      action: "TICKET_STATUS_CHANGED",
      actorId: agent.user.id,
      metadata: { from: "OPEN", to: "IN_PROGRESS", reason: "SUPPORT_REPLY" },
    });

    // The customer answers: the ticket waits for the team again
    await write(ticket.id, customer.token, "Thanks, here is the photo");
    expect((await getTicket(ticket.id, customer.token)).needsAgent).toBe(true);
  });

  it("treat a member of the team writing on their own ticket as the customer", async () => {
    const agent = await loginAs("AGENT");
    const ticket = await openTicket(agent.token);

    const res = await write(ticket.id, agent.token, "My own laptop is broken");
    expect(res.body.authorType).toBe("CUSTOMER");
    expect((await getTicket(ticket.id, agent.token)).status).toBe("OPEN");
  });

  it("hide the conversation of someone else's ticket", async () => {
    const alice = await loginAs("USER");
    const bob = await loginAs("USER");
    const ticket = await openTicket(alice.token);

    expect((await api().get(`/tickets/${ticket.id}/messages`).set(bearer(bob.token))).status).toBe(404);
    expect((await write(ticket.id, bob.token, "Hello")).status).toBe(404);
    expect((await api().get("/tickets/abc/messages").set(bearer(bob.token))).status).toBe(400);
    expect((await api().get(`/tickets/${ticket.id}/messages`)).status).toBe(401);
  });

  it("refuse messages on a closed ticket", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = await openTicket(customer.token);
    await api().patch(`/tickets/${ticket.id}/status`).set(bearer(agent.token)).send({ status: "CLOSED" });

    const res = await write(ticket.id, customer.token, "Hello?");
    expect(res.status).toBe(409);
    expect(errorSchema.parse(res.body).error.code).toBe("TICKET_CLOSED");
  });

  it("validate the body", async () => {
    const customer = await loginAs("USER");
    const ticket = await openTicket(customer.token);

    expect((await write(ticket.id, customer.token, "   ")).status).toBe(400);
    expect((await write(ticket.id, customer.token, "a".repeat(5001))).status).toBe(400);
  });
});

describe("Tickets waiting for the support team", () => {
  it("can be filtered with needsAgent", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const waiting = await openTicket(customer.token);
    const answered = await openTicket(customer.token);
    const resolved = await openTicket(customer.token);

    await write(answered.id, agent.token, "Done on our side");
    await api().patch(`/tickets/${resolved.id}/status`).set(bearer(agent.token)).send({ status: "RESOLVED" });

    const res = await api().get("/tickets?needsAgent=true").set(bearer(agent.token));
    expect(res.body.data.map((ticket: { id: string }) => ticket.id)).toEqual([waiting.id]);

    const others = await api().get("/tickets?needsAgent=false").set(bearer(agent.token));
    expect(others.body.meta.total).toBe(2);
  });
});

describe("AI without API key", () => {
  it("is shown as disabled and cannot write drafts", async () => {
    const admin = await loginAs("ADMIN");
    const settings = await api().get("/ai/settings").set(bearer(admin.token));
    expect(settings.body).toMatchObject({ enabled: false, provider: null, model: null, promptId: null });

    const customer = await loginAs("USER");
    const ticket = await openTicket(customer.token);
    const res = await api().post(`/tickets/${ticket.id}/ai-suggestion`).set(bearer(admin.token));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_DISABLED");
  });
});
