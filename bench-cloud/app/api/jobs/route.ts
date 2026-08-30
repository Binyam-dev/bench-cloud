import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvPut, kvList } from "@/lib/kv";
import { routeJob } from "@/lib/providers";
import { buildMcpServers } from "@/lib/terminals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys = await kvList("job:");
    const jobs = await Promise.all(keys.map((k) => kvGet(k.name)));
    const sorted = jobs.filter(Boolean).sort((a: any, b: any) => b.createdAt - a.createdAt);
    return NextResponse.json({ jobs: sorted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body?.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "'text' is required" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const job: any = {
    id,
    title: body.text.length > 60 ? body.text.slice(0, 60) + "…" : body.text,
    createdAt: Date.now(),
    status: "running",
    schedule: body.schedule || null, // e.g. "every:15m", "every:1h", "every:1d"
    terminals: Array.isArray(body.terminals) ? body.terminals : [],
    webSearch: body.webSearch !== false,
    messages: [{ role: "user", content: body.text }],
  };

  try {
    const result = await routeJob(job.messages, {
      webSearch: job.webSearch,
      mcpServers: buildMcpServers(job.terminals),
    });
    job.messages.push({ role: "assistant", content: result.text, provider: result.provider, steps: result.steps });
    job.status = "done";
    job.lastRunAt = Date.now();
    job.lastProvider = result.provider;
    job.attempts = result.attempts;
  } catch (err: any) {
    job.status = "error";
    job.error = err.message || String(err);
  }

  try {
    await kvPut(`job:${id}`, job);
  } catch (err: any) {
    return NextResponse.json({ error: `job ran but failed to save: ${err.message}`, job }, { status: 500 });
  }

  return NextResponse.json({ job });
}
