import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiMessage } from "../../src/lib/ai-client.js";

const sdk = vi.hoisted(() => ({
  options: [] as unknown[],
  responsesCreate: vi.fn(),
  chatCreate: vi.fn(),
}));

// The real SDK is replaced: nothing is sent, the tests check what would be sent
vi.mock("openai", () => ({
  default: vi.fn(function (options: unknown) {
    sdk.options.push(options);
    return { responses: { create: sdk.responsesCreate }, chat: { completions: { create: sdk.chatCreate } } };
  }),
}));

// The client is created when the module loads, from the environment variables
async function loadClient(variables: Record<string, string>) {
  for (const [name, value] of Object.entries(variables)) {
    vi.stubEnv(name, value);
  }
  vi.resetModules();
  const { aiClient } = await import("../../src/lib/ai-client.js");
  return aiClient;
}

const messages: AiMessage[] = [
  { role: "system", content: "Rules" },
  { role: "user", content: "Help" },
];

afterEach(() => {
  vi.unstubAllEnvs();
  sdk.options.length = 0;
  sdk.responsesCreate.mockReset();
  sdk.chatCreate.mockReset();
});

describe("aiClient", () => {
  it("is disabled without an API key", async () => {
    expect(await loadClient({ AI_API_KEY: "", AI_MODEL: "some-model" })).toBeNull();
  });

  it("uses the prompt of the OpenAI dashboard when AI_PROMPT_ID is set", async () => {
    sdk.responsesCreate.mockResolvedValue({ output_text: '{"reply": "Hi"}' });
    const client = await loadClient({ AI_API_KEY: "sk-test", AI_PROMPT_ID: "pmpt_123", AI_PROMPT_VERSION: "2" });

    expect(client).toMatchObject({ provider: "openai", model: null, promptId: "pmpt_123" });
    expect(await client?.completeJson(messages)).toBe('{"reply": "Hi"}');
    expect(sdk.options[0]).toMatchObject({ apiKey: "sk-test", baseURL: "https://api.openai.com/v1" });
    // The model of the dashboard is kept: no model is sent
    expect(sdk.responsesCreate).toHaveBeenCalledWith({
      prompt: { id: "pmpt_123", version: "2" },
      input: [
        { role: "developer", content: "Rules" },
        { role: "user", content: "Help" },
      ],
      text: { format: { type: "json_object" } },
    });
  });

  it("uses Chat Completions and the DeepSeek address for DeepSeek", async () => {
    sdk.chatCreate.mockResolvedValue({ choices: [{ message: { content: '{"reply": "Hi"}' } }] });
    const client = await loadClient({ AI_API_KEY: "sk-test", AI_PROVIDER: "deepseek", AI_MODEL: "deepseek-model" });

    expect(await client?.completeJson(messages)).toBe('{"reply": "Hi"}');
    expect(sdk.options[0]).toMatchObject({ baseURL: "https://api.deepseek.com" });
    expect(sdk.chatCreate).toHaveBeenCalledWith({
      model: "deepseek-model",
      messages,
      response_format: { type: "json_object" },
    });
  });

  it("fails on an empty answer", async () => {
    sdk.chatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const client = await loadClient({ AI_API_KEY: "sk-test", AI_MODEL: "gpt-test" });

    await expect(client?.completeJson(messages)).rejects.toThrow("empty answer");
  });
});
