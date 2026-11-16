import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { BASE_RULES, DEFAULT_STATUS_SETTINGS, type AiStatus } from "../../src/lib/ai-prompts.js";
import { aiSettingsSchema, aiStatusSettingSchema, aiSuggestionSchema } from "../../src/docs/response.schemas.js";
import { waitForPendingReplies } from "../../src/services/ai.service.js";
import type { AiMessage } from "../../src/lib/ai-client.js";
import { api, bearer, loginAs } from "./helpers.js";

const completeJson = vi.hoisted(() => vi.fn<(messages: AiMessage[]) => Promise<string>>());

// Fake AI: the tests choose its answers and check what it receives. Nothing is sent to a provider.
vi.mock("../../src/lib/ai-client.js", () => ({
  aiClient: { provider: "openai", model: "test-model", promptId: null, completeJson },
}));

function answer(reply: string, status?: AiStatus) {
  return JSON.stringify({ reply, ...(status ? { status } : {}) });
}

function aiAnswersOnce(reply: string, status?: AiStatus) {
  completeJson.mockResolvedValueOnce(answer(reply, status));
}

// Lets the test decide when the AI answer arrives
function aiAnswersLater() {
  let respond: (text: string) => void = () => {};
  completeJson.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
  return (text: string) => respond(text);
}

// Prompt sent to the AI on its n-th call
function promptOfCall(index: number) {
  return completeJson.mock.calls[index][0];
}

const validTicket = { title: "Black screen", description: "My screen stays black at startup" };

async function openTicket(token: string) {
  const res = await api().post("/tickets").set(bearer(token)).send(validTicket);
  await waitForPendingReplies();
  return res;
}

async function write(ticketId: string, token: string, body: string) {
  const res = await api().post(`/tickets/${ticketId}/messages`).set(bearer(token)).send({ body });
  await waitForPendingReplies();
  return res;
}

function setStatus(ticketId: string, token: string, status: string) {
  return api().patch(`/tickets/${ticketId}/status`).set(bearer(token)).send({ status });
}

async function getTicket(ticketId: string, token: string) {
  return (await api().get(`/tickets/${ticketId}`).set(bearer(token))).body;
}

async function messagesOf(ticketId: string, token: string) {
  const res = await api().get(`/tickets/${ticketId}/messages`).set(bearer(token));
  return res.body.data as { authorType: string; author: unknown; body: string }[];
}

beforeEach(() => {
  completeJson.mockReset();
  completeJson.mockResolvedValue(answer("Default answer", "OPEN"));
});

describe("Automatic answers of the AI", () => {
  it("answer a new ticket and save the answer, without sending the name or email of the customer", async () => {
    const customer = await loginAs("USER");
    aiAnswersOnce("Try to restart your computer", "OPEN");

    const res = await openTicket(customer.token);
    expect(res.status).toBe(201);

    expect(await messagesOf(res.body.id, customer.token)).toMatchObject([
      { authorType: "AI", author: null, body: "Try to restart your computer" },
    ]);
    expect(await getTicket(res.body.id, customer.token)).toMatchObject({ status: "OPEN", needsAgent: false });

    const [system, ticket] = promptOfCall(0);
    expect(system.content).toContain(BASE_RULES);
    expect(system.content).toContain(DEFAULT_STATUS_SETTINGS.OPEN.instructions);
    expect(ticket).toEqual({ role: "user", content: `Ticket title: ${validTicket.title}\n\n${validTicket.description}` });

    const sent = JSON.stringify(promptOfCall(0));
    expect(sent).not.toContain(customer.user.email);
    expect(sent).not.toContain(customer.user.name);
  });

  it("move the ticket to IN_PROGRESS when the AI asks for a person, and log it", async () => {
    const customer = await loginAs("USER");
    aiAnswersOnce("A member of the team will follow up", "IN_PROGRESS");

    const res = await openTicket(customer.token);

    expect(await messagesOf(res.body.id, customer.token)).toHaveLength(1);
    expect(await getTicket(res.body.id, customer.token)).toMatchObject({ status: "IN_PROGRESS", needsAgent: true });
    const log = await prisma.auditLog.findFirst({ where: { targetId: res.body.id } });
    expect(log).toMatchObject({
      action: "TICKET_STATUS_CHANGED",
      actorId: null,
      metadata: { from: "OPEN", to: "IN_PROGRESS", source: "AI" },
    });

    // A person has the ticket now: the AI does not answer anymore
    await write(res.body.id, customer.token, "Hello?");
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it("mark the ticket RESOLVED when the customer confirms that the problem is solved", async () => {
    const customer = await loginAs("USER");
    const ticket = (await openTicket(customer.token)).body;

    aiAnswersOnce("Great, have a nice day!", "RESOLVED");
    await write(ticket.id, customer.token, "It works now, thank you");

    expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "RESOLVED", needsAgent: false });
  });

  it("never mark RESOLVED a ticket that the customer has not answered about", async () => {
    const customer = await loginAs("USER");
    aiAnswersOnce("This should fix it", "RESOLVED");

    const res = await openTicket(customer.token);

    expect((await getTicket(res.body.id, customer.token)).status).toBe("OPEN");
    expect(await prisma.auditLog.count({ where: { targetId: res.body.id } })).toBe(0);
  });

  it("let the support team take over when the AI fails or answers badly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const customer = await loginAs("USER");

    completeJson.mockRejectedValueOnce(new Error("Request timed out"));
    const failed = await openTicket(customer.token);

    completeJson.mockResolvedValueOnce("Sorry, I cannot answer in JSON");
    const invalid = await openTicket(customer.token);

    completeJson.mockResolvedValueOnce(answer("Goodbye", "CLOSED" as AiStatus));
    const closing = await openTicket(customer.token);

    for (const ticket of [failed.body, invalid.body, closing.body]) {
      expect(await messagesOf(ticket.id, customer.token)).toEqual([]);
      expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "OPEN", needsAgent: true });
    }
  });

  it("answer the next customer messages with the whole conversation, up to the limit", async () => {
    const customer = await loginAs("USER");
    const ticket = (await openTicket(customer.token)).body;

    await write(ticket.id, customer.token, "I restarted, still black");
    // Second call: the ticket, the first answer of the AI, then the new customer message
    expect(promptOfCall(1).slice(1).map((message) => message.role)).toEqual(["user", "assistant", "user"]);

    await write(ticket.id, customer.token, "Any other idea?");
    expect((await getTicket(ticket.id, customer.token)).needsAgent).toBe(false);

    // AI_MAX_AUTO_REPLIES is 3 in the tests: the fourth message waits for a person
    await write(ticket.id, customer.token, "Still nothing");
    expect(completeJson).toHaveBeenCalledTimes(3);
    expect((await getTicket(ticket.id, customer.token)).needsAgent).toBe(true);
  });

  it("stop answering by itself once a person of the team takes the ticket", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = (await openTicket(customer.token)).body;

    await write(ticket.id, agent.token, "I am taking your ticket");
    await write(ticket.id, customer.token, "Thank you");

    // IN_PROGRESS: the AI only writes drafts, the customer waits for the agent
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "IN_PROGRESS", needsAgent: true });
  });

  it("give a resolved ticket back to the team if the problem persists", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = (await openTicket(customer.token)).body;
    await setStatus(ticket.id, agent.token, "RESOLVED");
    expect((await getTicket(ticket.id, customer.token)).needsAgent).toBe(false);

    aiAnswersOnce("Sorry about that, an agent will look at it again", "IN_PROGRESS");
    await write(ticket.id, customer.token, "It broke again this morning");

    expect(promptOfCall(1)[0].content).toContain(DEFAULT_STATUS_SETTINGS.RESOLVED.instructions);
    expect((await messagesOf(ticket.id, customer.token)).at(-1)).toMatchObject({ authorType: "AI" });
    expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "IN_PROGRESS", needsAgent: true });
  });

  it("reopen a resolved ticket when the customer asks a new question that the AI answers", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = (await openTicket(customer.token)).body;
    await setStatus(ticket.id, agent.token, "RESOLVED");

    aiAnswersOnce("You can change it in the settings", "OPEN");
    await write(ticket.id, customer.token, "And how do I change the language?");

    expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "OPEN", needsAgent: false });
  });

  it("drop an answer that arrives after a newer customer message", async () => {
    const customer = await loginAs("USER");
    const answerFirst = aiAnswersLater();
    aiAnswersOnce("Answer to the details");

    const ticket = (await api().post("/tickets").set(bearer(customer.token)).send(validTicket)).body;
    await vi.waitFor(() => expect(completeJson).toHaveBeenCalledTimes(1));

    // The customer adds details while the first answer is being written
    await api().post(`/tickets/${ticket.id}/messages`).set(bearer(customer.token)).send({ body: "More details" });
    await vi.waitFor(() => expect(completeJson).toHaveBeenCalledTimes(2));

    answerFirst(answer("Answer to the ticket only", "OPEN"));
    await waitForPendingReplies();

    const aiMessages = (await messagesOf(ticket.id, customer.token)).filter((message) => message.authorType === "AI");
    expect(aiMessages.map((message) => message.body)).toEqual(["Answer to the details"]);
  });

  it("never override a status changed by a person while the answer is being written", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const answerLater = aiAnswersLater();

    const ticket = (await api().post("/tickets").set(bearer(customer.token)).send(validTicket)).body;
    await vi.waitFor(() => expect(completeJson).toHaveBeenCalledTimes(1));

    await setStatus(ticket.id, agent.token, "RESOLVED");
    answerLater(answer("A member of the team will follow up", "IN_PROGRESS"));
    await waitForPendingReplies();

    expect(await messagesOf(ticket.id, customer.token)).toEqual([]);
    expect(await getTicket(ticket.id, customer.token)).toMatchObject({ status: "RESOLVED", needsAgent: false });
  });
});

describe("AI settings", () => {
  it("are visible to the admins, with the default behavior of each status", async () => {
    const admin = await loginAs("ADMIN");
    const res = await api().get("/ai/settings").set(bearer(admin.token));

    expect(res.status).toBe(200);
    const settings = aiSettingsSchema.parse(res.body);
    expect(settings).toMatchObject({ enabled: true, provider: "openai", model: "test-model", maxAutoReplies: 3 });
    expect(settings.statuses).toEqual([
      { status: "OPEN", ...DEFAULT_STATUS_SETTINGS.OPEN, isDefault: true, updatedAt: null, updatedBy: null },
      { status: "IN_PROGRESS", ...DEFAULT_STATUS_SETTINGS.IN_PROGRESS, isDefault: true, updatedAt: null, updatedBy: null },
      { status: "RESOLVED", ...DEFAULT_STATUS_SETTINGS.RESOLVED, isDefault: true, updatedAt: null, updatedBy: null },
    ]);

    for (const role of ["AGENT", "USER"] as const) {
      const { token } = await loginAs(role);
      expect((await api().get("/ai/settings").set(bearer(token))).status).toBe(403);
    }
  });

  it("can only be changed by the super admin, and the change is logged", async () => {
    const superAdmin = await loginAs("SUPER_ADMIN");
    const admin = await loginAs("ADMIN");
    const change = { autoReply: false, instructions: "Only say that the team will answer within 24 hours." };

    expect((await api().put("/ai/settings/OPEN").set(bearer(admin.token)).send(change)).status).toBe(403);
    expect((await api().put("/ai/settings/CLOSED").set(bearer(superAdmin.token)).send(change)).status).toBe(400);
    expect((await api().put("/ai/settings/OPEN").set(bearer(superAdmin.token)).send({ autoReply: true })).status).toBe(
      400,
    );

    const res = await api().put("/ai/settings/OPEN").set(bearer(superAdmin.token)).send(change);
    expect(res.status).toBe(200);
    expect(aiStatusSettingSchema.parse(res.body)).toMatchObject({
      status: "OPEN",
      ...change,
      isDefault: false,
      updatedBy: { id: superAdmin.user.id },
    });

    const log = await prisma.auditLog.findFirst({ where: { action: "AI_SETTING_CHANGED" } });
    expect(log).toMatchObject({
      actorId: superAdmin.user.id,
      targetType: "AI_SETTING",
      metadata: { status: "OPEN", from: DEFAULT_STATUS_SETTINGS.OPEN, to: change },
    });
  });

  it("are used for the next answers, always after the fixed safety rules", async () => {
    const superAdmin = await loginAs("SUPER_ADMIN");
    const customer = await loginAs("USER");
    const instructions = "Answer like a pirate, but stay polite.";

    await api().put("/ai/settings/OPEN").set(bearer(superAdmin.token)).send({ autoReply: true, instructions });
    await openTicket(customer.token);
    const system = promptOfCall(0)[0].content;
    expect(system).toContain(BASE_RULES);
    expect(system).toContain(instructions);

    // Automatic answers turned off for new tickets: they wait for a person
    await api().put("/ai/settings/OPEN").set(bearer(superAdmin.token)).send({ autoReply: false, instructions });
    const res = await openTicket(customer.token);
    expect(res.body.needsAgent).toBe(true);
    expect(completeJson).toHaveBeenCalledTimes(1);
  });
});

describe("POST /tickets/:id/ai-suggestion", () => {
  it("gives a draft and a suggested status to the team, without saving, sending or changing anything", async () => {
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = (await openTicket(customer.token)).body;
    await write(ticket.id, agent.token, "I am taking your ticket");
    await write(ticket.id, customer.token, "I installed the driver, it works!");

    aiAnswersOnce("Glad to hear it, I am closing the subject", "RESOLVED");
    const res = await api().post(`/tickets/${ticket.id}/ai-suggestion`).set(bearer(agent.token));

    expect(res.status).toBe(200);
    expect(aiSuggestionSchema.parse(res.body)).toEqual({
      suggestion: "Glad to hear it, I am closing the subject",
      suggestedStatus: "RESOLVED",
    });
    const system = promptOfCall(1)[0].content;
    expect(system).toContain("draft for a person of the support team");
    expect(system).toContain(DEFAULT_STATUS_SETTINGS.IN_PROGRESS.instructions);

    // First answer of the AI, the agent, the customer: the draft was not added and the status did not change
    expect(await messagesOf(ticket.id, customer.token)).toHaveLength(3);
    expect((await getTicket(ticket.id, customer.token)).status).toBe("IN_PROGRESS");
  });

  it("is reserved to the support team", async () => {
    const customer = await loginAs("USER");
    const ticket = (await openTicket(customer.token)).body;

    expect((await api().post(`/tickets/${ticket.id}/ai-suggestion`).set(bearer(customer.token))).status).toBe(403);
  });

  it("answers 502 when the AI fails and 409 on a closed ticket", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const customer = await loginAs("USER");
    const agent = await loginAs("AGENT");
    const ticket = (await openTicket(customer.token)).body;

    completeJson.mockRejectedValueOnce(new Error("Service unavailable"));
    const failed = await api().post(`/tickets/${ticket.id}/ai-suggestion`).set(bearer(agent.token));
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("AI_UNAVAILABLE");

    await setStatus(ticket.id, agent.token, "CLOSED");
    expect((await api().post(`/tickets/${ticket.id}/ai-suggestion`).set(bearer(agent.token))).status).toBe(409);
  });
});
