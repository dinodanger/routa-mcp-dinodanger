// A small client for the platform's admin API. It only talks to /admin/v1/.
import type { Config } from "./config.ts";

export type Scope = "read" | "admin";

// A problem whose message is safe and useful to show the user as it is.
export class UserError extends Error {}

export type Platform = {
  whoami(): Promise<Scope>;
  getSettings(): Promise<unknown>;
  patchSettings(changes: unknown[]): Promise<unknown>;
};

export function makePlatform(config: Config): Platform {
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!config.token) throw new UserError("MCP_TOKEN is not set, so the server has no token to use. Set it to your read-only or admin token and restart the server.");
    let res: Response;
    try {
      res = await fetch(config.url + path, {
        method,
        headers: { Authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new UserError(`Can't reach the platform at ${config.url}. Is it running?`);
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    if (res.status === 401) throw new UserError("The platform doesn't accept this token. Check MCP_TOKEN.");
    if (!res.ok) {
      const detail = (parsed as { detail?: unknown } | undefined)?.detail;
      throw new UserError(`The platform refused the request (${res.status}): ${typeof detail === "string" ? detail : "no reason given"}`);
    }
    return parsed;
  }

  return {
    async whoami() {
      const scope = ((await call("GET", "/admin/v1/whoami")) as { scope?: unknown } | undefined)?.scope;
      if (scope !== "read" && scope !== "admin") throw new UserError("The platform didn't say what this token may do, so nothing was done.");
      return scope;
    },
    getSettings: () => call("GET", "/admin/v1/settings"),
    patchSettings: (changes) => call("PATCH", "/admin/v1/settings", { changes }),
  };
}
