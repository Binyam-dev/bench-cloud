// Thin client for Cloudflare's Workers KV REST API.
// Used as the persistence layer so jobs survive across serverless invocations
// and across the GitHub Actions cron trigger.

function base() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  if (!accountId || !namespaceId) {
    throw new Error(
      "Cloudflare KV is not configured — set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_KV_NAMESPACE_ID."
    );
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
}

function headers() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set.");
  return { Authorization: `Bearer ${token}` };
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  const res = await fetch(`${base()}/values/${encodeURIComponent(key)}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`kv get failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function kvPut(key: string, value: any): Promise<void> {
  const res = await fetch(`${base()}/values/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`kv put failed: ${res.status} ${await res.text()}`);
}

export async function kvDelete(key: string): Promise<void> {
  const res = await fetch(`${base()}/values/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) throw new Error(`kv delete failed: ${res.status} ${await res.text()}`);
}

export async function kvList(prefix: string): Promise<{ name: string }[]> {
  const res = await fetch(`${base()}/keys?prefix=${encodeURIComponent(prefix)}`, { headers: headers() });
  if (!res.ok) throw new Error(`kv list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.result || [];
}
