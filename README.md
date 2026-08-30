# Bench Cloud

A persistent, multi-provider agentic job runner. You describe a job, it runs
against Claude (with real web search), and — unlike a chat tab — the job and
its result live on a server, so they survive across sessions and can be
re-run on a schedule.

## What's genuinely better than OmniRoute here

OmniRoute's cooldown problem (from earlier) is one vendor's credential pool
going to zero. This router falls through to a **different vendor entirely**
the moment one fails:

`Anthropic → OpenAI → DeepSeek → Kimi (Moonshot) → Ollama Cloud`

Only the Anthropic call gets tool use (web search). The others are
plain-completion fallbacks — they keep the job from dying, with reduced
capability. That's a deliberate, visible trade-off (`lastProvider` on every
job tells you which one actually answered), not a hidden approximation.

## What's honestly still missing vs. Perplexity Computer

- **No code sandbox.** This is tool-use + API calls, not arbitrary code
  execution.
- **Cron is best-effort, not native.** Vercel's Hobby plan only allows
  once-a-day cron, imprecise to the hour. This ships a GitHub Actions
  workflow that pings `/api/cron` every 5 minutes instead — free, reliable,
  no Vercel Pro required.
- **Connectors (Gmail/Notion/Slack/etc.) need their own OAuth.** Inside
  claude.ai, Anthropic already holds your OAuth grant for each connector.
  A standalone app doesn't get that for free — most MCP servers require a
  per-service OAuth flow you'd need to implement and store a token for
  (`lib/terminals.ts` reads `<ID>_MCP_TOKEN` env vars for this). Out of the
  box, enabling a terminal without a token will just fail that tool call —
  it won't silently do nothing. Treat this as the next real chunk of work,
  not a solved problem.

## Setup

### 1. Storage — create a Cloudflare KV namespace

```bash
npx wrangler login
npx wrangler kv namespace create bench_cloud_jobs
```

Copy the returned `id` into `CLOUDFLARE_KV_NAMESPACE_ID`. Get
`CLOUDFLARE_ACCOUNT_ID` from your Cloudflare dashboard sidebar. Create
`CLOUDFLARE_API_TOKEN` under **My Profile → API Tokens**, permission
**Workers KV Storage: Edit**.

### 2. Model providers

Add whichever keys you have to `.env.local` (copy `.env.example`). You only
need one to function; more keys = deeper fallback.

### 3. Deploy

```bash
npm i -g vercel
vercel link
vercel env add ANTHROPIC_API_KEY production
# ...repeat per variable in .env.example you're using
vercel --prod
```

Or, matching your usual flow: open this folder in Claude Code and say
*"read .env.example, set these as Vercel production env vars from my local
values, then deploy to production."*

### 4. Scheduling

In your GitHub repo settings → **Secrets and variables → Actions**, add:

- `BENCH_CLOUD_URL` — your deployed URL (no trailing slash)
- `BENCH_CRON_SECRET` — same value as `CRON_SECRET` in Vercel

The included `.github/workflows/cron.yml` then pings `/api/cron` every
5 minutes, which advances any job you created with a schedule.

## API

- `GET /api/jobs` — list all jobs
- `POST /api/jobs` — `{ text, schedule?, terminals?, webSearch? }` — creates
  and immediately runs a job. `schedule` is one of `every:15m`, `every:1h`,
  `every:1d`, or omitted for a one-off.
- `GET /api/jobs/:id` / `DELETE /api/jobs/:id`
- `GET /api/cron` — `Authorization: Bearer $CRON_SECRET` — advances due jobs
- `GET /api/providers` — which providers are currently configured
