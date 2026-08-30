"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, RefreshCw, ChevronRight } from "lucide-react";

type Provider = { id: string; label: string; enabled: boolean };
type Job = {
  id: string;
  title: string;
  createdAt: number;
  status: "running" | "done" | "error";
  schedule: string | null;
  lastRunAt?: number;
  lastProvider?: string;
  error?: string;
  messages: { role: string; content: any; provider?: string; steps?: any[] }[];
};

const SCHEDULES = [
  { value: "", label: "Run once" },
  { value: "every:15m", label: "Every 15 min" },
  { value: "every:1h", label: "Every hour" },
  { value: "every:1d", label: "Every day" },
];

function lastText(job: Job) {
  const last = job.messages[job.messages.length - 1];
  if (!last) return "";
  return typeof last.content === "string" ? last.content : "";
}

export default function Page() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [text, setText] = useState("");
  const [schedule, setSchedule] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.jobs) setJobs(data.jobs);
    } catch {
      // leave existing state
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
    loadJobs();
  }, [loadJobs]);

  async function runJob(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, schedule: schedule || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setText("");
      setSchedule("");
      await loadJobs();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeJob(id: string) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  const anyEnabled = providers.some((p) => p.enabled);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="font-mono text-2xl tracking-tight text-emerald-400">Bench Cloud</h1>
          <p className="text-sm text-slate-400 mt-1">
            Jobs persist here and can run on a schedule — not just while a tab is open.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {providers.map((p) => (
              <span
                key={p.id}
                className={`text-xs font-mono px-2 py-1 rounded border ${
                  p.enabled
                    ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                    : "border-slate-800 text-slate-600"
                }`}
              >
                {p.label} {p.enabled ? "" : "(off)"}
              </span>
            ))}
          </div>
          {!anyEnabled && (
            <p className="text-xs text-amber-400 mt-2">
              No providers configured yet — add at least one API key to your environment variables
              (see .env.example) and redeploy.
            </p>
          )}
        </header>

        <form onSubmit={runJob} className="mb-10 border border-slate-800 rounded-lg p-4 bg-slate-900/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe the job…"
            rows={3}
            className="w-full resize-none bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-md px-3 py-2.5 text-sm placeholder-slate-500"
          />
          <div className="flex items-center justify-between mt-3">
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-2 text-xs font-mono text-slate-300"
            >
              {SCHEDULES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading || !text.trim() || !anyEnabled}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-medium text-sm rounded-md px-4 py-2 transition-colors"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Run job
            </button>
          </div>
          {schedule && (
            <p className="text-xs text-slate-500 mt-2">
              Scheduled jobs only advance when something calls <code>/api/cron</code> — wire up the
              included GitHub Actions workflow (or any external scheduler) for this to actually run
              unattended.
            </p>
          )}
          {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        </form>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-xs uppercase tracking-wider text-slate-500">Jobs</h2>
          <button onClick={loadJobs} className="text-slate-500 hover:text-slate-300">
            <RefreshCw size={14} className={loadingJobs ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {jobs.length === 0 && !loadingJobs && (
            <p className="text-sm text-slate-500 border border-dashed border-slate-800 rounded-lg px-4 py-8 text-center">
              No jobs yet. Describe one above.
            </p>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{job.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs font-mono text-slate-500">
                    <span
                      className={
                        job.status === "done"
                          ? "text-emerald-400"
                          : job.status === "error"
                          ? "text-red-400"
                          : "text-amber-400"
                      }
                    >
                      {job.status}
                    </span>
                    {job.lastProvider && (
                      <>
                        <ChevronRight size={10} />
                        <span>{job.lastProvider}</span>
                      </>
                    )}
                    {job.schedule && (
                      <>
                        <ChevronRight size={10} />
                        <span>{job.schedule}</span>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => removeJob(job.id)} className="text-slate-600 hover:text-red-400 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              {job.error && <p className="text-xs text-red-400 mt-2">{job.error}</p>}
              {!job.error && (
                <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed">
                  {lastText(job)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
