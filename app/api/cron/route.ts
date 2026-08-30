import { NextRequest, NextResponse } from "next/server";
import { kvList, kvGet, kvPut } from "@/lib/kv";
import { routeJob } from "@/lib/providers";
import { buildMcpServers } from "@/lib/terminals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isDue(schedule: string, lastRunAt: number | undefined, now: number): boolean {
  const m = /^every:(\d+)(m|h|d)$/.exec(schedule);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  const unitMs = m[2] === "m" ? 60_000 : m[2] === "h" ? 3_600_000 : 86_400_000;
  if (!lastRunAt) return true;
  return now - lastRunAt >= n * unitMs;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  let ran = 0;
  let checked = 0;
  const errors: string[] = [];

  try {
    const keys = await kvList("job:");
    for (const k of keys) {
      checked++;
      const job = await kvGet<any>(k.name);
      if (!job || !job.schedule) continue;
      if (!isDue(job.schedule, job.lastRunAt, now)) continue;

      try {
        const result = await routeJob(job.messages, {
          webSearch: job.webSearch,
          mcpServers: buildMcpServers(job.terminals || []),
        });
        job.messages.push({
          role: "assistant",
          content: result.text,
          provider: result.provider,
          steps: result.steps,
          at: now,
        });
        job.status = "done";
        job.lastRunAt = now;
        job.lastProvider = result.provider;
      } catch (err: any) {
        job.status = "error";
        job.error = err.message || String(err);
        errors.push(`${job.id}: ${job.error}`);
      }
      await kvPut(k.name, job);
      ran++;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ checked, ran, errors });
}
