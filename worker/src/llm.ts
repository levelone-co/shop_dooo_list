/**
 * Provider router for tool-using LLM calls (mirror of Pre-Do's LlmRouter.gs).
 *
 *   • model id starts with "claude-"   → Anthropic /v1/messages
 *   • model id starts with "deepseek-" → DeepSeek /v1/chat/completions
 *   • DeepSeek "thinking" models (deepseek-reasoner / -pro / -thinking) auto-
 *     route to a JSON-output path because they reject forced tool_choice.
 *
 * Required env (secrets) — only the ones for the chosen provider must be set:
 *   ANTHROPIC_API_KEY  (for claude-*)
 *   DEEPSEEK_API_KEY   (for deepseek-*)
 *
 * Prompt caching:
 *   • Anthropic: explicit `cache_control:{type:"ephemeral"}` on the system block.
 *   • DeepSeek: automatic on stable prompt prefixes — keep system first.
 */

export interface LlmEnv {
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEEPSEEK_API_URL  = "https://api.deepseek.com/v1/chat/completions";

function providerFor(model: string): "anthropic" | "deepseek" {
  return /^deepseek/i.test(model || "") ? "deepseek" : "anthropic";
}

function isDeepSeekThinking(model: string): boolean {
  return /(reasoner|pro|thinking)/i.test(model || "");
}

function apiKeyFor(env: LlmEnv, model: string): string {
  const p = providerFor(model);
  if (p === "deepseek") {
    if (!env.DEEPSEEK_API_KEY) throw new Error(`DEEPSEEK_API_KEY not set (required for ${model})`);
    return env.DEEPSEEK_API_KEY;
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error(`ANTHROPIC_API_KEY not set (required for ${model})`);
  return env.ANTHROPIC_API_KEY;
}

export interface LlmToolCallArgs {
  model: string;
  system: string;
  userText: string;
  toolName: string;
  toolDescription?: string;
  toolSchema: unknown;  // JSON schema; same shape works for both providers
  maxTokens?: number;
}

/**
 * Force the model to call a single tool. Returns the parsed tool-input object.
 * Provider-agnostic — caller writes one body and gets one shape back.
 */
export async function callLlmWithTool<T = Record<string, unknown>>(
  env: LlmEnv, args: LlmToolCallArgs
): Promise<T> {
  const apiKey = apiKeyFor(env, args.model);
  const provider = providerFor(args.model);
  if (provider === "deepseek") {
    return isDeepSeekThinking(args.model)
      ? callDeepSeekJson<T>(apiKey, args)
      : callDeepSeekTools<T>(apiKey, args);
  }
  return callAnthropic<T>(apiKey, args);
}

async function callAnthropic<T>(apiKey: string, a: LlmToolCallArgs): Promise<T> {
  const payload = {
    model: a.model,
    max_tokens: a.maxTokens ?? 300,
    system: [{ type: "text", text: a.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: a.userText }],
    tools: [{
      name: a.toolName,
      description: a.toolDescription ?? "",
      input_schema: a.toolSchema
    }],
    tool_choice: { type: "tool", name: a.toolName }
  };
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${text.slice(0, 500)}`);
  const parsed: any = JSON.parse(text);
  const block = (parsed.content || []).find((b: any) => b.type === "tool_use" && b.name === a.toolName);
  if (!block || !block.input) throw new Error(`No ${a.toolName} tool_use in Anthropic response: ${text.slice(0, 400)}`);
  return block.input as T;
}

async function callDeepSeekTools<T>(apiKey: string, a: LlmToolCallArgs): Promise<T> {
  const payload = {
    model: a.model,
    max_tokens: a.maxTokens ?? 300,
    messages: [
      { role: "system", content: a.system },
      { role: "user",   content: a.userText }
    ],
    tools: [{
      type: "function",
      function: {
        name: a.toolName,
        description: a.toolDescription ?? "",
        parameters: a.toolSchema
      }
    }],
    tool_choice: { type: "function", function: { name: a.toolName } }
  };
  const resp = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) {
    if (resp.status === 400 && /thinking mode does not support/i.test(text)) {
      return callDeepSeekJson<T>(apiKey, a);
    }
    throw new Error(`DeepSeek HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }
  const parsed: any = JSON.parse(text);
  const msg = parsed.choices?.[0]?.message;
  const tc = msg?.tool_calls?.[0];
  if (!tc?.function?.arguments) throw new Error(`No ${a.toolName} tool_call in DeepSeek response: ${text.slice(0, 400)}`);
  try { return JSON.parse(tc.function.arguments) as T; }
  catch (e) { throw new Error(`Failed to parse DeepSeek tool args: ${e}; raw: ${tc.function.arguments.slice(0, 400)}`); }
}

async function callDeepSeekJson<T>(apiKey: string, a: LlmToolCallArgs): Promise<T> {
  const schemaText = JSON.stringify(a.toolSchema, null, 2);
  const system = a.system + "\n\nOUTPUT FORMAT — STRICT:\n" +
    "When you're done reasoning, your final `content` MUST be ONLY a single " +
    "JSON object that conforms to the schema. No prose, no markdown fences. " +
    "Keep your reasoning concise so you have budget left for the JSON.\n\n" +
    "JSON Schema:\n" + schemaText;
  const payload = {
    model: a.model,
    max_tokens: Math.max(a.maxTokens ?? 300, 4096),
    messages: [
      { role: "system", content: system },
      { role: "user",   content: a.userText },
      { role: "user",   content: "Now emit ONLY the JSON object as the final reply." }
    ]
  };
  const resp = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`DeepSeek (thinking) HTTP ${resp.status}: ${text.slice(0, 500)}`);
  const parsed: any = JSON.parse(text);
  const msg = parsed.choices?.[0]?.message;
  if (!msg) throw new Error(`No message in DeepSeek thinking response: ${text.slice(0, 500)}`);
  const out = extractJsonObject(typeof msg.content === "string" ? msg.content : "")
    || extractJsonObject(typeof msg.reasoning_content === "string" ? msg.reasoning_content : "");
  if (!out) throw new Error(
    `DeepSeek thinking model produced no JSON. finish_reason=${parsed.choices?.[0]?.finish_reason}; ` +
    `content="${(msg.content || "").slice(0, 200)}"; reasoning_tail="${(msg.reasoning_content || "").slice(-200)}"`
  );
  return out as T;
}

function extractJsonObject(s: string): unknown | null {
  if (!s) return null;
  const t = s.trim();
  try { return JSON.parse(t); } catch (_) {}
  const fenced = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  if (fenced !== t) { try { return JSON.parse(fenced); } catch (_) {} }
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
