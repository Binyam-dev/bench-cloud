// Tries providers in priority order and falls through to the next one on
// failure (rate limit, outage, bad model id, etc). This is the direct fix
// for "all credentials for one vendor are cooling down": instead of retrying
// the same vendor, it moves to a completely different one.
//
// Only the Anthropic path gets web_search + mcp_servers (tool use). The
// fallback providers (OpenAI, DeepSeek, Kimi, Ollama Cloud) return a plain
// completion with no tool use — they keep a job alive, but with reduced
// capability. That trade-off is intentional and should stay visible to the
// caller via `provider` on the result.

export type ProviderResult = { text: string; provider: string; steps: any[] };

function toPlainText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n\n");
  }
  return String(content ?? "");
}

function toOpenAIFormat(messages: any[]) {
  return messages.map((m) => ({ role: m.role, content: toPlainText(m.content) }));
}

async function callAnthropic(
  messages: any[],
  opts: { webSearch?: boolean; mcpServers?: any[] }
): Promise<ProviderResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages,
      ...(opts.webSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
      ...(opts.mcpServers?.length ? { mcp_servers: opts.mcpServers } : {}),
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n\n");
  const steps = (data.content || [])
    .filter((b: any) => b.type === "server_tool_use" || b.type === "mcp_tool_use")
    .map((b: any) => ({ name: b.name }));
  return { text: text || "(no text returned)", provider: "anthropic", steps };
}

async function callOpenAI(messages: any[]): Promise<ProviderResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.1",
      messages: toOpenAIFormat(messages),
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || "(no text returned)", provider: "openai", steps: [] };
}

async function callDeepSeek(messages: any[]): Promise<ProviderResult> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: toOpenAIFormat(messages),
    }),
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || "(no text returned)", provider: "deepseek", steps: [] };
}

async function callKimi(messages: any[]): Promise<ProviderResult> {
  const base = process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.MOONSHOT_MODEL || "kimi-k2-0905-preview",
      messages: toOpenAIFormat(messages),
    }),
  });
  if (!res.ok) throw new Error(`kimi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || "(no text returned)", provider: "kimi", steps: [] };
}

async function callOllamaCloud(messages: any[]): Promise<ProviderResult> {
  const base = (process.env.OLLAMA_CLOUD_URL as string).replace(/\/$/, "");
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: {
      ...(process.env.OLLAMA_CLOUD_API_KEY ? { Authorization: `Bearer ${process.env.OLLAMA_CLOUD_API_KEY}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_CLOUD_MODEL || "llama3.3",
      messages: toOpenAIFormat(messages),
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.message?.content || "(no text returned)", provider: "ollama-cloud", steps: [] };
}

type Chain = { name: string; enabled: boolean; fn: () => Promise<ProviderResult> };

export async function routeJob(
  messages: any[],
  opts: { webSearch?: boolean; mcpServers?: any[] } = {}
): Promise<ProviderResult & { attempts: { provider: string; error: string }[] }> {
  const chain: Chain[] = [
    { name: "anthropic", enabled: !!process.env.ANTHROPIC_API_KEY, fn: () => callAnthropic(messages, opts) },
    { name: "openai", enabled: !!process.env.OPENAI_API_KEY, fn: () => callOpenAI(messages) },
    { name: "deepseek", enabled: !!process.env.DEEPSEEK_API_KEY, fn: () => callDeepSeek(messages) },
    { name: "kimi", enabled: !!process.env.MOONSHOT_API_KEY, fn: () => callKimi(messages) },
    { name: "ollama", enabled: !!process.env.OLLAMA_CLOUD_URL, fn: () => callOllamaCloud(messages) },
  ].filter((p) => p.enabled);

  if (!chain.length) {
    throw new Error("No providers configured — set at least one API key as an environment variable.");
  }

  const attempts: { provider: string; error: string }[] = [];
  for (const p of chain) {
    try {
      const result = await p.fn();
      return { ...result, attempts };
    } catch (err: any) {
      attempts.push({ provider: p.name, error: err.message || String(err) });
    }
  }
  throw new Error(`All providers failed: ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`);
}
