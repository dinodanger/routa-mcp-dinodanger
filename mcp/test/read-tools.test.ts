import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readConfig } from "../src/config.ts";
import { makePlatform } from "../src/platform.ts";
import { callTool, tools } from "../src/tools/index.ts";

const SETTINGS = {
  access: [
    { group: "ext-contractors", apps: ["crm", "finance", "timesheets"] },
    { group: "dept-finance", apps: ["finance"] },
    { group: "dept-consulting", apps: [] },
  ],
  policies: [
    { id: "mfa.partners", label: "Require MFA for partners", value: false },
    { id: "session-length-hours", label: "Session length in hours", value: 24 },
    { id: "guest-access", label: "Guest access", value: "open" },
  ],
};

// A stand-in platform that serves the settings above to a read-only token, and records every request.
async function stub(settings: unknown = SETTINGS) {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/admin/v1/whoami") return void res.end(JSON.stringify({ scope: "read" }));
    if (req.url === "/admin/v1/settings" && req.method === "GET") return void res.end(JSON.stringify(settings));
    res.writeHead(500).end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const platform = makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" }));
  return { platform, requests, close: () => server.close() };
}

const tool = (name: string) => tools.find((t) => t.name === name)!;

test("show_access and show_policies are offered, and only need a read token", () => {
  assert.ok(["show_access", "show_policies"].every((n) => tools.some((t) => t.name === n)));
  assert.ok(["show_access", "show_policies"].every((n) => tool(n).needs === "read"));
});

test("show_access lists every group, with a read-only token, and sends no PATCH", async () => {
  const { platform, requests, close } = await stub();
  const r = await callTool(tool("show_access"), {}, platform);
  close();
  assert.equal(r.isError, false);
  assert.equal(r.text, "ext-contractors: crm, finance, timesheets\ndept-finance: finance\ndept-consulting: nothing");
  assert.ok(requests.every((q) => q.startsWith("GET ")));
});

test("show_access answers for one group and for one application", async () => {
  const { platform, close } = await stub();
  assert.equal((await callTool(tool("show_access"), { group: "dept-finance" }, platform)).text, "dept-finance: finance");
  assert.equal((await callTool(tool("show_access"), { app: "finance" }, platform)).text, "finance is reached by: ext-contractors, dept-finance.");
  assert.equal((await callTool(tool("show_access"), { group: "ext-contractors", app: "crm" }, platform)).text, "ext-contractors reaches crm.");
  assert.equal((await callTool(tool("show_access"), { group: "dept-finance", app: "crm" }, platform)).text, "dept-finance does not reach crm.");
  close();
});

test("show_access names the groups when the group is unknown, and the applications when no group reaches one", async () => {
  const { platform, close } = await stub();
  const badGroup = await callTool(tool("show_access"), { group: "nope" }, platform);
  const badApp = await callTool(tool("show_access"), { app: "financee" }, platform);
  close();
  assert.equal(badGroup.isError, true);
  assert.match(badGroup.text, /no group called "nope".*ext-contractors, dept-finance, dept-consulting/);
  assert.match(badApp.text, /No group reaches financee.*crm, finance, timesheets/);
});

test("show_policies shows labels and plain values, and can filter", async () => {
  const { platform, close } = await stub();
  const all = await callTool(tool("show_policies"), {}, platform);
  const some = await callTool(tool("show_policies"), { search: "SESSION" }, platform);
  const none = await callTool(tool("show_policies"), { search: "zzz" }, platform);
  close();
  assert.equal(all.text, "Require MFA for partners: no (mfa.partners)\nSession length in hours: 24 (session-length-hours)\nGuest access: open (guest-access)");
  assert.equal(some.text, "Session length in hours: 24 (session-length-hours)");
  assert.equal(none.text, 'No policy matches "zzz".');
});

test("a settings answer in an unknown shape is reported, not guessed at", async () => {
  const { platform, close } = await stub({ access: "oops" });
  const r = await callTool(tool("show_access"), {}, platform);
  close();
  assert.equal(r.isError, true);
  assert.match(r.text, /shape the server doesn't know/);
});
