import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { readConfig } from "../src/config.ts";
import { makePlatform } from "../src/platform.ts";
import { findPreview, PREVIEW_MINUTES } from "../src/previews.ts";
import { callTool, tools } from "../src/tools/index.ts";

type Change = { type: string; group?: string; app?: string; allowed?: boolean; id?: string; value?: unknown };

// A stand-in platform that keeps real state, applies PATCH like the real one, and records the PATCH bodies.
async function stub() {
  const state = {
    access: { "ext-contractors": ["crm", "finance", "timesheets"], "dept-finance": ["finance"] } as Record<string, string[]>,
    policies: { "session-length-hours": 24, "mfa.partners": false } as Record<string, unknown>,
  };
  const labels: Record<string, string> = { "session-length-hours": "Session length in hours", "mfa.partners": "Require MFA for partners" };
  const control = { scope: "admin", failPatchWith: undefined as string | undefined, patches: [] as Change[][], requests: [] as string[] };
  const view = () => ({
    access: Object.entries(state.access).map(([group, apps]) => ({ group, apps })),
    policies: Object.entries(state.policies).map(([id, value]) => ({ id, label: labels[id], value })),
  });
  const body = (req: IncomingMessage) => new Promise<string>((resolve) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => resolve(s)); });
  const server = createServer(async (req, res) => {
    control.requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/admin/v1/whoami") return void res.end(JSON.stringify({ scope: control.scope }));
    if (req.method === "GET") return void res.end(JSON.stringify(view()));
    const changes = JSON.parse(await body(req)).changes as Change[];
    control.patches.push(changes);
    if (control.failPatchWith) return void res.writeHead(400).end(JSON.stringify({ status: "400", detail: control.failPatchWith }));
    for (const c of changes) {
      if (c.type === "access") state.access[c.group!] = c.allowed ? [...new Set([...state.access[c.group!], c.app!])] : state.access[c.group!].filter((a) => a !== c.app);
      else state.policies[c.id!] = c.value;
    }
    res.end(JSON.stringify({ applied: changes.length, settings: view() }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { state, control, platform: makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" })), close: () => server.close() };
}

const tool = (name: string) => tools.find((t) => t.name === name)!;
const idOf = (text: string) => /preview id ([0-9a-f]{8})/.exec(text)![1];
const loseFinance = { group: "ext-contractors", app: "finance", allowed: false };

test("apply_change takes only a preview id, and needs an admin token", () => {
  assert.equal(tool("apply_change").needs, "admin");
  assert.deepEqual((tool("apply_change").inputSchema as { required: string[] }).required, ["preview_id"]);
});

test("applying a previewed access change sends exactly that change and the settings show it", async () => {
  const s = await stub();
  const preview = await callTool(tool("preview_access_change"), loseFinance, s.platform);
  assert.equal(s.control.patches.length, 0);
  const r = await callTool(tool("apply_change"), { preview_id: idOf(preview.text), group: "partners", app: "hr", allowed: true }, s.platform);
  s.close();
  assert.equal(r.isError, false);
  assert.equal(r.text, "Applied. ext-contractors no longer has access to finance.");
  assert.deepEqual(s.control.patches, [[{ type: "access", group: "ext-contractors", app: "finance", allowed: false }]]);
  assert.deepEqual(s.state.access["ext-contractors"], ["crm", "timesheets"]);
});

test("applying a previewed policy change sends exactly that change", async () => {
  const s = await stub();
  const preview = await callTool(tool("preview_policy_change"), { policy: "Session length in hours", value: 8 }, s.platform);
  const r = await callTool(tool("apply_change"), { preview_id: idOf(preview.text) }, s.platform);
  s.close();
  assert.equal(r.text, 'Applied. "Session length in hours" is now 8 (it was 24).');
  assert.deepEqual(s.control.patches, [[{ type: "policy", id: "session-length-hours", value: 8 }]]);
  assert.equal(s.state.policies["session-length-hours"], 8);
});

test("a read-only token can't apply even a preview an admin made, and nothing changes", async () => {
  const s = await stub();
  const preview = await callTool(tool("preview_access_change"), loseFinance, s.platform);
  s.control.scope = "read";
  const r = await callTool(tool("apply_change"), { preview_id: idOf(preview.text) }, s.platform);
  s.close();
  assert.equal(r.isError, true);
  assert.match(r.text, /read-only.*Nothing was changed/);
  assert.equal(s.control.patches.length, 0);
  assert.deepEqual(s.state.access["ext-contractors"], ["crm", "finance", "timesheets"]);
});

test("no id, an unknown id, or a made-up id changes nothing", async () => {
  const s = await stub();
  const none = await callTool(tool("apply_change"), {}, s.platform);
  const unknown = await callTool(tool("apply_change"), { preview_id: "deadbeef" }, s.platform);
  s.close();
  assert.match(none.text, /needs the preview id/);
  assert.match(unknown.text, /no preview with id "deadbeef".*Nothing was changed/);
  assert.equal(s.control.patches.length, 0);
});

test("a preview applies once; asking again is refused and nothing more is sent", async () => {
  const s = await stub();
  const id = idOf((await callTool(tool("preview_access_change"), loseFinance, s.platform)).text);
  await callTool(tool("apply_change"), { preview_id: id }, s.platform);
  const again = await callTool(tool("apply_change"), { preview_id: id }, s.platform);
  s.close();
  assert.equal(again.isError, true);
  assert.match(again.text, /already applied/);
  assert.equal(s.control.patches.length, 1);
});

test("if the settings moved since the preview, nothing is applied", async () => {
  const s = await stub();
  const access = idOf((await callTool(tool("preview_access_change"), loseFinance, s.platform)).text);
  const policy = idOf((await callTool(tool("preview_policy_change"), { policy: "session-length-hours", value: 8 }, s.platform)).text);
  s.state.access["ext-contractors"] = ["crm", "timesheets"]; // someone else already took finance away
  s.state.policies["session-length-hours"] = 12; // someone else set it to 12
  const a = await callTool(tool("apply_change"), { preview_id: access }, s.platform);
  const p = await callTool(tool("apply_change"), { preview_id: policy }, s.platform);
  s.close();
  for (const r of [a, p]) {
    assert.equal(r.isError, true);
    assert.match(r.text, /settings have changed since the preview.*Nothing was applied\. Preview the change again/);
  }
  assert.equal(s.control.patches.length, 0);
  assert.equal(s.state.policies["session-length-hours"], 12);
});

test("a preview left for too long is refused", async () => {
  const s = await stub();
  const id = idOf((await callTool(tool("preview_access_change"), loseFinance, s.platform)).text);
  findPreview(id)!.createdAt -= (PREVIEW_MINUTES + 1) * 60_000;
  const r = await callTool(tool("apply_change"), { preview_id: id }, s.platform);
  s.close();
  assert.match(r.text, /more than 15 minutes old.*Nothing was changed/);
  assert.equal(s.control.patches.length, 0);
});

test("when the platform refuses the change, its reason comes back in plain text and the preview can be tried again", async () => {
  const s = await stub();
  const id = idOf((await callTool(tool("preview_access_change"), loseFinance, s.platform)).text);
  s.control.failPatchWith = 'No group called "ext-contractors".';
  const refused = await callTool(tool("apply_change"), { preview_id: id }, s.platform);
  s.control.failPatchWith = undefined;
  const retried = await callTool(tool("apply_change"), { preview_id: id }, s.platform);
  s.close();
  assert.equal(refused.isError, true);
  assert.match(refused.text, /refused the request \(400\): No group called "ext-contractors"\./);
  assert.equal(retried.isError, false);
  assert.deepEqual(s.state.access["ext-contractors"], ["crm", "timesheets"]);
});
