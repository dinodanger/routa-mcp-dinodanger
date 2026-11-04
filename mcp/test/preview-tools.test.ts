import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readConfig } from "../src/config.ts";
import { makePlatform } from "../src/platform.ts";
import { findPreview } from "../src/previews.ts";
import { callTool, tools } from "../src/tools/index.ts";

const SETTINGS = {
  access: [
    { group: "ext-contractors", apps: ["crm", "finance", "timesheets"] },
    { group: "dept-finance", apps: ["finance"] },
  ],
  policies: [
    { id: "mfa.partners", label: "Require MFA for partners", value: false },
    { id: "session-length-hours", label: "Session length in hours", value: 24 },
    { id: "guest-access", label: "Guest access", value: "open" },
  ],
};

// A stand-in platform with a settable scope. Every request is recorded, so a test can see that no PATCH was sent.
async function stub(scope: "read" | "admin") {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/admin/v1/whoami") return void res.end(JSON.stringify({ scope }));
    if (req.url === "/admin/v1/settings" && req.method === "GET") return void res.end(JSON.stringify(SETTINGS));
    res.writeHead(500).end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { platform: makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" })), requests, close: () => server.close() };
}

const tool = (name: string) => tools.find((t) => t.name === name)!;
const idOf = (text: string) => /preview id ([0-9a-f]{8})/.exec(text)![1];

test("both preview tools need an admin token", () => {
  assert.equal(tool("preview_access_change").needs, "admin");
  assert.equal(tool("preview_policy_change").needs, "admin");
});

test("a read-only token is refused both previews, and no preview is made", async () => {
  const { platform, requests, close } = await stub("read");
  const a = await callTool(tool("preview_access_change"), { group: "ext-contractors", app: "finance", allowed: false }, platform);
  const p = await callTool(tool("preview_policy_change"), { policy: "session-length-hours", value: 8 }, platform);
  close();
  for (const r of [a, p]) {
    assert.equal(r.isError, true);
    assert.match(r.text, /read-only.*Nothing was changed/);
  }
  assert.deepEqual([...new Set(requests)], ["GET /admin/v1/whoami"]);
});

test("an access preview says in words who loses or gains what, and sends nothing to change", async () => {
  const { platform, requests, close } = await stub("admin");
  const lose = await callTool(tool("preview_access_change"), { group: "ext-contractors", app: "finance", allowed: false }, platform);
  const gain = await callTool(tool("preview_access_change"), { group: "dept-finance", app: "crm", allowed: true }, platform);
  close();
  assert.match(lose.text, /^ext-contractors would lose access to finance\.\nNothing has been changed yet\./);
  assert.match(gain.text, /^dept-finance would gain access to crm\./);
  assert.ok(requests.every((q) => q.startsWith("GET ")));
  assert.deepEqual(findPreview(idOf(lose.text))?.change, { type: "access", group: "ext-contractors", app: "finance", allowed: false });
  assert.notEqual(idOf(lose.text), idOf(gain.text));
});

test("a policy preview says from and to, using the policy's name, and accepts its id or its name", async () => {
  const { platform, close } = await stub("admin");
  const byId = await callTool(tool("preview_policy_change"), { policy: "session-length-hours", value: 8 }, platform);
  const byName = await callTool(tool("preview_policy_change"), { policy: "require mfa for PARTNERS", value: true }, platform);
  close();
  assert.match(byId.text, /^"Session length in hours" would go from 24 to 8\./);
  assert.match(byName.text, /^"Require MFA for partners" would go from no to yes\./);
  assert.deepEqual(findPreview(idOf(byName.text))?.change, { type: "policy", id: "mfa.partners", value: true });
  assert.doesNotMatch(byId.text + byName.text, /"type"|"allowed"|"value"/);
});

test("a change that changes nothing says so and gives no id", async () => {
  const { platform, close } = await stub("admin");
  const a = await callTool(tool("preview_access_change"), { group: "ext-contractors", app: "finance", allowed: true }, platform);
  const d = await callTool(tool("preview_access_change"), { group: "dept-finance", app: "crm", allowed: false }, platform);
  const p = await callTool(tool("preview_policy_change"), { policy: "guest-access", value: "open" }, platform);
  close();
  for (const r of [a, d, p]) {
    assert.equal(r.isError, false);
    assert.match(r.text, /^No change: .*nothing to apply\.$/);
    assert.doesNotMatch(r.text, /preview id/);
  }
});

test("unknown groups, applications and policies are refused with the real names listed", async () => {
  const { platform, requests, close } = await stub("admin");
  const group = await callTool(tool("preview_access_change"), { group: "nope", app: "crm", allowed: true }, platform);
  const app = await callTool(tool("preview_access_change"), { group: "dept-finance", app: "zzz", allowed: true }, platform);
  const policy = await callTool(tool("preview_policy_change"), { policy: "nope", value: 1 }, platform);
  close();
  assert.match(group.text, /no group called "nope".*ext-contractors, dept-finance/);
  assert.match(app.text, /no application called "zzz".*crm, finance, timesheets/);
  assert.match(policy.text, /no policy called "nope".*Session length in hours \(session-length-hours\)/);
  assert.ok([group, app, policy].every((r) => r.isError));
  assert.ok(requests.every((q) => q.startsWith("GET ")));
});

test("a value of the wrong kind is refused in plain words", async () => {
  const { platform, close } = await stub("admin");
  const num = await callTool(tool("preview_policy_change"), { policy: "session-length-hours", value: "8" }, platform);
  const bool = await callTool(tool("preview_policy_change"), { policy: "mfa.partners", value: "yes" }, platform);
  const missing = await callTool(tool("preview_access_change"), { group: "dept-finance", app: "crm" }, platform);
  close();
  assert.match(num.text, /"Session length in hours" takes a number, not "8"/);
  assert.match(bool.text, /takes yes or no/);
  assert.match(missing.text, /needs a group, an application/);
});

test("an application that just lost its last group is still known", async () => {
  // First sight of the grid: crm is reached. Later the grid says nobody reaches it; the server still knows crm.
  const first = await stub("admin");
  await callTool(tool("preview_access_change"), { group: "dept-finance", app: "crm", allowed: true }, first.platform);
  first.close();
  const { parseSettings } = await import("../src/settings.ts");
  parseSettings({ access: [{ group: "ext-contractors", apps: [] }], policies: [] });
  const again = await stub("admin");
  const r = await callTool(tool("preview_access_change"), { group: "dept-finance", app: "crm", allowed: true }, again.platform);
  again.close();
  assert.equal(r.isError, false);
});
