import OpenAI from "openai";
import { env } from "../config/env.js";

export type AiProvider = typeof env.AI_PROVIDER;

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiClient = {
  provider: AiProvider;
  // null when the model comes from the dashboard prompt
  model: string | null;
  // Prompt saved in the OpenAI dashboard, null when the instructions all come from the code
  promptId: string | null;
  // Returns the raw text of the answer, which is asked as a JSON object
  completeJson(messages: AiMessage[]): Promise<string>;
};

// DeepSeek uses the same API as OpenAI: only the address changes
const BASE_URLS: Record<AiProvider, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
};

// Prompt of the OpenAI dashboard: it gives the model and the reference instructions.
// The rules of the code are sent after it as developer messages, then the conversation.
async function completeWithDashboardPrompt(client: OpenAI, promptId: string, messages: AiMessage[]) {
  const response = await client.responses.create({
    prompt: { id: promptId, ...(env.AI_PROMPT_VERSION ? { version: env.AI_PROMPT_VERSION } : {}) },
    // Overrides the model of the dashboard only if one is set in .env
    ...(env.AI_MODEL ? { model: env.AI_MODEL } : {}),
    input: messages.map((message) => ({
      role: message.role === "system" ? ("developer" as const) : message.role,
      content: message.content,
    })),
    text: { format: { type: "json_object" } },
  });
  return response.output_text;
}

// Chat Completions is the API that both providers support.
// No temperature or token limit: their names and accepted values differ between models.
async function completeWithChat(client: OpenAI, model: string, messages: AiMessage[]) {
  const completion = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
  });
  return completion.choices[0]?.message.content;
}

function createAiClient(): AiClient | null {
  const promptId = env.AI_PROMPT_ID ?? null;
  const model = env.AI_MODEL ?? null;

  if (!env.AI_API_KEY || (!promptId && !model)) {
    return null;
  }

  const client = new OpenAI({
    apiKey: env.AI_API_KEY,
    baseURL: env.AI_BASE_URL ?? BASE_URLS[env.AI_PROVIDER],
    timeout: env.AI_TIMEOUT_MS,
    maxRetries: 2,
  });

  return {
    provider: env.AI_PROVIDER,
    model,
    promptId,
    async completeJson(messages) {
      const content = promptId
        ? await completeWithDashboardPrompt(client, promptId, messages)
        : await completeWithChat(client, model as string, messages);

      if (!content) {
        throw new Error("The AI returned an empty answer");
      }
      return content;
    },
  };
}

// null when no API key is configured: the AI features are disabled
export const aiClient = createAiClient();
