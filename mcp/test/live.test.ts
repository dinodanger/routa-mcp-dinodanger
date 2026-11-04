// Drives the real server over stdio against the running test environment, with both tokens.
// It skips, saying why, when the environment isn't up or the tokens aren't in the shell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const URL = process.env.ROUTA_URL || "http://localhost:4660";
const ADMIN = process.env.ROUTA_TOKEN;
const READONLY = process.env.ROUTA_READONLY_TOKEN;

async function reason(): Promise<string | undefined> {
  if (!ADMIN || !READONLY) return "ROUTA_TOKEN and ROUTA_READONLY_TOKEN are not both set in the shell";
  try {
    const res = await fetch(`${URL}/admin/v1/whoami`, { headers: { Authorization: `Bearer ${ADMIN}` } });
    return res.ok ? undefined : `the platform at ${URL} answered ${res.status} to the admin token`;
  } catch {
    return `the test environment is not running at ${URL} (npm run test-environment)`;
  }
}
const skip = await reason();

const platform = async (method: string, body?: unknown) => {
  const res = await fetch(`${URL}/admin/v1/settings`, {
    method,
    headers: { Authorization: `Bearer ${ADMIN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<{ access: { group: string; apps: string[] }[]; policies: { id: string; value: unknown }[] }>;
};

// Starts the server with one token and returns a function that makes one tool call and waits for its answer.
function startServer(token: string) {
  const child = spawn(process.execPath, ["mcp/src/server.ts"], { env: { ...process.env, ROUTA_URL: URL, MCP_TOKEN: token }, stdio: ["pipe", "pipe", "inherit"] });
  const waiting = new Map<number, (r: { result?: { content: { text: string }[]; isError: boolean; tools?: { name: string }[] } }) => void>();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const reply = JSON.parse(line);
    waiting.get(reply.id)?.(reply);
    waiting.delete(reply.id);
  });
  let next = 0;
  const ask = (method: string, params: object = {}) =>
    new Promise<{ result?: { content: { text: string }[]; isError: boolean; tools?: { name: string }[] } }>((resolve) => {
      const id = ++next;
      waiting.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const call = async (name: string, args: object = {}) => {
    const r = (await ask("tools/call", { name, arguments: args })).result!;
    return { text: r.content[0].text, isError: r.isError };
  };
  return { ask, call, stop: () => child.stdin.end() };
}

test("live: a read-only token reads, is refused every preview and apply, and nothing changes", { skip }, async () => {
  const before = await platform("GET");
  const s = startServer(READONLY!);
  try {
    const listed = (await s.ask("tools/list")).result!.tools!.map((t) => t.name);
    assert.deepEqual(listed.sort(), ["apply_change", "preview_access_change", "preview_policy_change", "show_access", "show_policies"]);
    const access = await s.call("show_access");
    assert.equal(access.isError, false);
    assert.equal(access.text.split("\n").length, before.access.length);
    const policies = await s.call("show_policies");
    assert.equal(policies.text.split("\n").length, before.policies.length);
    for (const [name, args] of [
      ["preview_access_change", { group: before.access[0].group, app: "crm", allowed: !before.access[0].apps.includes("crm") }],
      ["preview_policy_change", { policy: "audit-log-days", value: 1 }],
      ["apply_change", { preview_id: "00000000" }],
    ] as [string, object][]) {
      const r = await s.call(name, args);
      assert.equal(r.isError, true, name);
      assert.match(r.text, /read-only.*Nothing was changed/, name);
    }
  } finally {
    s.stop();
  }
  assert.deepEqual(await platform("GET"), before);
});

test("live: an admin previews, applies, sees the real settings change, then undoes it", { skip }, async () => {
  const before = await platform("GET");
  const s = startServer(ADMIN!);
  const idOf = (text: string) => /preview id ([0-9a-f]{8})/.exec(text)![1];
  try {
    const group = before.access.find((r) => r.apps.length === 0)?.group ?? before.access[0].group;
    const gaining = !before.access.find((r) => r.group === group)!.apps.includes("crm");
    const change = { group, app: "crm", allowed: gaining };

    const shown = await s.call("preview_access_change", change);
    assert.equal(shown.isError, false);
    assert.match(shown.text, gaining ? /would gain access to crm/ : /would lose access to crm/);
    assert.deepEqual(await platform("GET"), before, "a preview must change nothing");
    const applied = await s.call("apply_change", { preview_id: idOf(shown.text) });
    assert.equal(applied.isError, false);
    const during = await platform("GET");
    assert.equal(during.access.find((r) => r.group === group)!.apps.includes("crm"), gaining);
    assert.deepEqual(during.policies, before.policies);
    assert.deepEqual(during.access.filter((r) => r.group !== group), before.access.filter((r) => r.group !== group));
    const undo = await s.call("preview_access_change", { ...change, allowed: !gaining });
    assert.equal((await s.call("apply_change", { preview_id: idOf(undo.text) })).isError, false);

    const current = before.policies.find((p) => p.id === "audit-log-days")!.value as number;
    const pShown = await s.call("preview_policy_change", { policy: "audit-log-days", value: current + 1 });
    assert.match(pShown.text, new RegExp(`would go from ${current} to ${current + 1}`));
    assert.equal((await s.call("apply_change", { preview_id: idOf(pShown.text) })).isError, false);
    assert.equal((await platform("GET")).policies.find((p) => p.id === "audit-log-days")!.value, current + 1);
    const pUndo = await s.call("preview_policy_change", { policy: "audit-log-days", value: current });
    assert.equal((await s.call("apply_change", { preview_id: idOf(pUndo.text) })).isError, false);
  } finally {
    s.stop();
    await restore(before);
  }
  assert.deepEqual(await platform("GET"), before, "the environment must end as it began");
});

test("live: if the settings move after a preview, the apply is refused and only the other change stands", { skip }, async () => {
  const before = await platform("GET");
  const s = startServer(ADMIN!);
  try {
    const current = before.policies.find((p) => p.id === "audit-log-days")!.value as number;
    const shown = await s.call("preview_policy_change", { policy: "audit-log-days", value: current + 5 });
    const id = /preview id ([0-9a-f]{8})/.exec(shown.text)![1];
    await platform("PATCH", { changes: [{ type: "policy", id: "audit-log-days", value: current + 2 }] }); // someone else, behind the server's back
    const r = await s.call("apply_change", { preview_id: id });
    assert.equal(r.isError, true);
    assert.match(r.text, /settings have changed since the preview/);
    assert.equal((await platform("GET")).policies.find((p) => p.id === "audit-log-days")!.value, current + 2);
  } finally {
    s.stop();
    await restore(before);
  }
  assert.deepEqual(await platform("GET"), before, "the environment must end as it began");
});

// Puts back anything a failed test left behind, so the next run starts from the same settings.
async function restore(before: Awaited<ReturnType<typeof platform>>) {
  const now = await platform("GET");
  const changes: object[] = [];
  const apps = new Set(before.access.flatMap((r) => r.apps).concat(now.access.flatMap((r) => r.apps)));
  for (const row of before.access) {
    const nowApps = now.access.find((r) => r.group === row.group)!.apps;
    for (const app of apps) if (row.apps.includes(app) !== nowApps.includes(app)) changes.push({ type: "access", group: row.group, app, allowed: row.apps.includes(app) });
  }
  for (const p of before.policies) if (now.policies.find((q) => q.id === p.id)!.value !== p.value) changes.push({ type: "policy", id: p.id, value: p.value });
  if (changes.length > 0) await platform("PATCH", { changes });
}
