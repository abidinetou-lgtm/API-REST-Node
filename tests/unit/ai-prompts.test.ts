import { describe, expect, it } from "vitest";
import {
  BASE_RULES,
  DEFAULT_STATUS_SETTINGS,
  buildPrompt,
  isAiStatus,
  nextStatus,
  parseAiAnswer,
} from "../../src/lib/ai-prompts.js";

const ticket = { title: "Black screen", description: "My screen stays black at startup" };

describe("buildPrompt", () => {
  it("puts the fixed rules, the mode and the instructions of the status in the system message", () => {
    const [system] = buildPrompt({ mode: "reply", status: "OPEN", instructions: "Be short.", ticket, messages: [] });

    expect(system.role).toBe("system");
    expect(system.content.startsWith(BASE_RULES)).toBe(true);
    expect(system.content).toContain("sent to the customer right away");
    expect(system.content).toContain("Instructions for the current status of the ticket (OPEN):\nBe short.");
  });

  it("explains that a draft is sent by a person of the team", () => {
    const [system] = buildPrompt({ mode: "draft", status: "IN_PROGRESS", instructions: "x", ticket, messages: [] });
    expect(system.content).toContain("draft for a person of the support team");
  });

  it("sends the ticket, then the conversation with the team on the assistant side", () => {
    const prompt = buildPrompt({
      mode: "reply",
      status: "OPEN",
      instructions: "x",
      ticket,
      messages: [
        { authorType: "AI", body: "Did you restart?" },
        { authorType: "CUSTOMER", body: "Yes" },
        { authorType: "SUPPORT", body: "Let me check" },
      ],
    });

    expect(prompt.slice(1)).toEqual([
      { role: "user", content: "Ticket title: Black screen\n\nMy screen stays black at startup" },
      { role: "assistant", content: "Did you restart?" },
      { role: "user", content: "Yes" },
      { role: "assistant", content: "Let me check" },
    ]);
  });

  it("asks for JSON, which the providers require to use the JSON mode", () => {
    expect(BASE_RULES).toContain("JSON");
  });
});

describe("DEFAULT_STATUS_SETTINGS", () => {
  it("answers new and resolved tickets, and only drafts while a person works on the ticket", () => {
    expect(DEFAULT_STATUS_SETTINGS.OPEN.autoReply).toBe(true);
    expect(DEFAULT_STATUS_SETTINGS.IN_PROGRESS.autoReply).toBe(false);
    expect(DEFAULT_STATUS_SETTINGS.RESOLVED.autoReply).toBe(true);
  });
});

describe("isAiStatus", () => {
  it("excludes closed tickets", () => {
    expect(isAiStatus("OPEN")).toBe(true);
    expect(isAiStatus("CLOSED")).toBe(false);
  });
});

describe("parseAiAnswer", () => {
  it("reads a valid answer", () => {
    expect(parseAiAnswer('{"reply": "  Hello  ", "status": "IN_PROGRESS"}')).toEqual({
      reply: "Hello",
      status: "IN_PROGRESS",
    });
  });

  it("accepts an answer without status", () => {
    expect(parseAiAnswer('{"reply": "Hello"}')).toEqual({ reply: "Hello" });
  });

  it("refuses an answer that is not JSON, has no reply, or tries to close the ticket", () => {
    expect(() => parseAiAnswer("Hello")).toThrow("not valid JSON");
    expect(() => parseAiAnswer('{"reply": ""}')).toThrow();
    expect(() => parseAiAnswer('{"answer": "Hello"}')).toThrow();
    expect(() => parseAiAnswer('{"reply": "Bye", "status": "CLOSED"}')).toThrow();
  });
});

describe("nextStatus", () => {
  it("applies the status proposed by the AI", () => {
    expect(nextStatus({ current: "OPEN", proposed: "IN_PROGRESS", customerHasReplied: false })).toBe("IN_PROGRESS");
    expect(nextStatus({ current: "OPEN", proposed: "RESOLVED", customerHasReplied: true })).toBe("RESOLVED");
    expect(nextStatus({ current: "RESOLVED", proposed: "OPEN", customerHasReplied: true })).toBe("OPEN");
    expect(nextStatus({ current: "RESOLVED", proposed: "IN_PROGRESS", customerHasReplied: true })).toBe("IN_PROGRESS");
  });

  it("keeps the status without proposal", () => {
    expect(nextStatus({ current: "RESOLVED", customerHasReplied: true })).toBe("RESOLVED");
  });

  it("never resolves a ticket before a reply of the customer", () => {
    expect(nextStatus({ current: "OPEN", proposed: "RESOLVED", customerHasReplied: false })).toBe("OPEN");
  });

  it("never changes the status of a ticket that a person of the team has", () => {
    expect(nextStatus({ current: "IN_PROGRESS", proposed: "OPEN", customerHasReplied: true })).toBe("IN_PROGRESS");
    expect(nextStatus({ current: "IN_PROGRESS", proposed: "RESOLVED", customerHasReplied: true })).toBe("IN_PROGRESS");
  });
});
