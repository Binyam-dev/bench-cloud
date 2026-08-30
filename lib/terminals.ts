// MCP connector URLs. IMPORTANT: unlike inside claude.ai (where Anthropic
// already holds your OAuth grant for each of these), a standalone app has to
// obtain and pass its own authorization_token per server for most of these
// to actually authenticate. Out of the box these will mostly fail auth —
// see README "Connectors" section before enabling them for a job.
export const TERMINAL_URLS: Record<string, string> = {
  gmail: "https://gmailmcp.googleapis.com/mcp/v1",
  drive: "https://drivemcp.googleapis.com/mcp/v1",
  notion: "https://mcp.notion.com/mcp",
  slack: "https://mcp.slack.com/mcp",
  vercel: "https://mcp.vercel.com",
  resend: "https://mcp.resend.com",
  cloudflare: "https://bindings.mcp.cloudflare.com/mcp",
};

export const TERMINAL_IDS = Object.keys(TERMINAL_URLS);

export function buildMcpServers(terminalIds: string[]) {
  return terminalIds
    .filter((id) => TERMINAL_URLS[id])
    .map((id) => {
      const tokenEnvVar = `${id.toUpperCase()}_MCP_TOKEN`;
      const token = process.env[tokenEnvVar];
      return {
        type: "url",
        url: TERMINAL_URLS[id],
        name: id,
        ...(token ? { authorization_token: token } : {}),
      };
    });
}
