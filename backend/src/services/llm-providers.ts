// ─── LLM Provider Abstraction ─────────────────────────────────────────────────
// Allows the judge to use Anthropic, OpenAI, Google, OpenRouter, or Groq interchangeably.
// OpenRouter and Groq both use the OpenAI Chat Completions API format.

import { getAllSettings } from "./db.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], maxTokens?: number): Promise<string>;
}

// ─── Anthropic Provider ───────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "claude-opus-4-5") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], maxTokens = 800): Promise<string> {
    const system = messages.find(m => m.role === "system")?.content ?? "";
    const userMessages = messages.filter(m => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: userMessages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    return data.content.find(b => b.type === "text")?.text ?? "";
  }
}

// ─── OpenAI Provider (native OpenAI API) ──────────────────────────────────────

class OpenAIProvider implements LLMProvider {
  name = "openai";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], maxTokens = 1024): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }>; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);
    return data.choices[0]?.message?.content ?? "";
  }
}

// ─── Google Gemini Provider ───────────────────────────────────────────────────

class GoogleGeminiProvider implements LLMProvider {
  name = "google";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], maxTokens = 1024): Promise<string> {
    // Convert OpenAI-style messages to Gemini format
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // Extract system instruction if present
    const systemInstruction = messages.find(m => m.role === "system");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google error ${res.status}: ${await res.text()}`);
    const data = await res.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      error?: { message: string };
    };
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}

// ─── OpenAI-compatible Provider (OpenRouter + Groq share this impl) ───────────

class OpenAICompatibleProvider implements LLMProvider {
  name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private extraHeaders: Record<string, string>;

  constructor(opts: {
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    extraHeaders?: Record<string, string>;
  }) {
    this.name = opts.name;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl;
    this.model = opts.model;
    this.extraHeaders = opts.extraHeaders ?? {};
  }

  async chat(messages: ChatMessage[], maxTokens = 800): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        ...this.extraHeaders,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`${this.name} error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "";
  }
}

// ─── Provider factory ─────────────────────────────────────────────────────────
// Priority: local DB config → environment variables.
// Cascade: configured provider → Anthropic → OpenAI → Google → OpenRouter → Groq → mock

export async function createJudgeProvider(): Promise<LLMProvider | null> {
  const settings = await getAllSettings();

  // Use || so empty-string DB values fall back to env vars
  const ANTHROPIC_KEY  = settings["ANTHROPIC_API_KEY"]  || process.env.ANTHROPIC_API_KEY  || "";
  const OPENAI_KEY     = settings["OPENAI_API_KEY"]     || process.env.OPENAI_API_KEY     || "";
  const GOOGLE_KEY     = settings["GOOGLE_API_KEY"]     || process.env.GOOGLE_API_KEY     || "";
  const OPENROUTER_KEY = settings["OPENROUTER_API_KEY"] || process.env.OPENROUTER_API_KEY || "";
  const GROQ_KEY       = settings["GROQ_API_KEY"]       || process.env.GROQ_API_KEY       || "";
  const JUDGE_PROVIDER = (settings["JUDGE_PROVIDER"] || process.env.JUDGE_PROVIDER || "auto").toLowerCase();

  const ANTHROPIC_MODEL   = settings["JUDGE_MODEL_ANTHROPIC"]  || process.env.JUDGE_MODEL_ANTHROPIC   || "claude-opus-4-5";
  const OPENAI_MODEL      = settings["JUDGE_MODEL_OPENAI"]     || process.env.JUDGE_MODEL_OPENAI      || "gpt-4o";
  const GOOGLE_MODEL      = settings["JUDGE_MODEL_GOOGLE"]     || process.env.JUDGE_MODEL_GOOGLE      || "gemini-2.0-flash";
  const OPENROUTER_MODEL  = settings["JUDGE_MODEL_OPENROUTER"] || process.env.JUDGE_MODEL_OPENROUTER  || "google/gemini-2.0-flash-001";
  const GROQ_MODEL        = settings["JUDGE_MODEL_GROQ"]       || process.env.JUDGE_MODEL_GROQ        || "llama-3.3-70b-versatile";

  const explicit = JUDGE_PROVIDER !== "auto";

  // Explicit selection
  if (explicit) {
    if (JUDGE_PROVIDER === "anthropic" && ANTHROPIC_KEY) {
      return new AnthropicProvider(ANTHROPIC_KEY, ANTHROPIC_MODEL);
    }
    if (JUDGE_PROVIDER === "openrouter" && OPENROUTER_KEY) {
      return new OpenAICompatibleProvider({
        name: "openrouter",
        apiKey: OPENROUTER_KEY,
        baseUrl: "https://openrouter.ai/api/v1",
        model: OPENROUTER_MODEL,
        extraHeaders: {
          "HTTP-Referer": process.env.BASE_URL ?? "https://ai-battle-arena.app",
          "X-Title": "AI Battle Arena — Judge",
        },
      });
    }
    if (JUDGE_PROVIDER === "openai" && OPENAI_KEY) {
      return new OpenAIProvider(OPENAI_KEY, OPENAI_MODEL);
    }
    if (JUDGE_PROVIDER === "google" && GOOGLE_KEY) {
      return new GoogleGeminiProvider(GOOGLE_KEY, GOOGLE_MODEL);
    }
    if (JUDGE_PROVIDER === "groq" && GROQ_KEY) {
      return new OpenAICompatibleProvider({
        name: "groq",
        apiKey: GROQ_KEY,
        baseUrl: "https://api.groq.com/openai/v1",
        model: GROQ_MODEL,
      });
    }
    console.error(`[Judge] JUDGE_PROVIDER="${JUDGE_PROVIDER}" configured but API key missing. Falling back to auto-detect.`);
  }

  // Auto-detect: first available key wins
  if (ANTHROPIC_KEY)  return new AnthropicProvider(ANTHROPIC_KEY, ANTHROPIC_MODEL);
  if (OPENAI_KEY)     return new OpenAIProvider(OPENAI_KEY, OPENAI_MODEL);
  if (GOOGLE_KEY)     return new GoogleGeminiProvider(GOOGLE_KEY, GOOGLE_MODEL);
  if (OPENROUTER_KEY) return new OpenAICompatibleProvider({
    name: "openrouter",
    apiKey: OPENROUTER_KEY,
    baseUrl: "https://openrouter.ai/api/v1",
    model: OPENROUTER_MODEL,
    extraHeaders: {
      "HTTP-Referer": process.env.BASE_URL ?? "https://ai-battle-arena.app",
      "X-Title": "AI Battle Arena — Judge",
    },
  });
  if (GROQ_KEY) return new OpenAICompatibleProvider({
    name: "groq",
    apiKey: GROQ_KEY,
    baseUrl: "https://api.groq.com/openai/v1",
    model: GROQ_MODEL,
  });

  // No keys available — will use mock judge
  return null;
}
