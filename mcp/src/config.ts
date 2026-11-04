// Reads the server's two settings from the environment. Never prints the token.
export type Config = { url: string; token: string | undefined };

export function readConfig(env: Record<string, string | undefined>): Config {
  const url = (env.ROUTA_URL || "http://localhost:4660").replace(/\/+$/, "");
  const token = env.MCP_TOKEN || undefined;
  return { url, token };
}
