import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { readConfig } from "../src/config.ts";
import { makePlatform } from "../src/platform.ts";
import { serve } from "../src/server.ts";
import type { Tool } from "../src/tools/index.ts";

// A stand-in platform: whoami answers with whatever scope the test sets, and every request is recorded.
async function stubPlatform() {
  const stub = { scope: "admin" as string, requests: [] as string[], seenAuth: [] as string[] };
  const server = createServer((req, res) => {
    stub.requests.push(`${req.method} ${req.url}`);
    stub.seenAuth.push(String(req.headers.authorization));
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer fake-token") return void res.writeHead(401).end(JSON.stringify({ status: "401", detail: "no" }));
    if (req.url === "/admin/v1/whoami") return void res.end(JSON.stringify({ scope: stub.scope }));
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { stub, url, close: () => server.close() };
}

const readTool: Tool = { name: "read_thing", description: "reads", inputSchema: { type: "object" }, needs: "read", run: async () => "read ok" };
const changeTool: Tool = { name: "change_thing", description: "changes", inputSchema: { type: "object" }, needs: "admin", run: async () => "changed" };

// Sends the messages through the server over streams and returns the replies.
async function talk(url: string, token: string | undefined, messages: object[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  const platform = makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: token }));
  const done = serve(input, output, [readTool, changeTool], platform);
  for (const m of messages) input.write(JSON.stringify(m) + "\n");
  input.end();
  await done;
  output.end();
  const text = (await output.toArray()).join("");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const call = (id: number, name: string) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } });

test("initialize and tools/list answer, and a notification gets no reply", async () => {
  const { url, close } = await stubPlatform();
  const replies = await talk(url, "fake-token", [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  close();
  assert.equal(replies.length, 2);
  assert.equal(replies[0].result.protocolVersion, "2025-06-18");
  assert.deepEqual(replies[0].result.capabilities, { tools: {} });
  assert.deepEqual(replies[1].result.tools.map((t: { name: string }) => t.name), ["read_thing", "change_thing"]);
});

test("a bad line gets a parse error and the server carries on", async () => {
  const { url, close } = await stubPlatform();
  const input = new PassThrough();
  const output = new PassThrough();
  const done = serve(input, output, [], makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" })));
  input.write("not json\n" + JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }) + "\n");
  input.end();
  await done;
  output.end();
  close();
  const replies = (await output.toArray()).join("").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(replies[0].error.code, -32700);
  assert.deepEqual(replies[1], { jsonrpc: "2.0", id: 5, result: {} });
});

test("an admin token runs both a read tool and a change tool, and sends the token", async () => {
  const { stub, url, close } = await stubPlatform();
  const replies = await talk(url, "fake-token", [call(1, "read_thing"), call(2, "change_thing")]);
  close();
  assert.equal(replies[0].result.content[0].text, "read ok");
  assert.equal(replies[1].result.content[0].text, "changed");
  assert.equal(replies[1].result.isError, false);
  assert.deepEqual(stub.seenAuth, ["Bearer fake-token", "Bearer fake-token"]);
});

test("a read-only token can read but is refused a change tool, which never runs", async () => {
  const { stub, url, close } = await stubPlatform();
  stub.scope = "read";
  let ran = false;
  const guarded: Tool = { ...changeTool, run: async () => ((ran = true), "changed") };
  const input = new PassThrough();
  const output = new PassThrough();
  const done = serve(input, output, [readTool, guarded], makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" })));
  input.write(JSON.stringify(call(1, "read_thing")) + "\n" + JSON.stringify(call(2, "change_thing")) + "\n");
  input.end();
  await done;
  output.end();
  close();
  const replies = (await output.toArray()).join("").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(replies[0].result.isError, false);
  assert.equal(replies[1].result.isError, true);
  assert.match(replies[1].result.content[0].text, /read-only.*Nothing was changed/);
  assert.equal(ran, false);
  assert.ok(!stub.requests.some((r) => r.startsWith("PATCH")));
});

test("the scope is asked on every call: a token that stops being admin is refused at once", async () => {
  const { stub, url, close } = await stubPlatform();
  const input = new PassThrough();
  const output = new PassThrough();
  const done = serve(input, output, [changeTool], makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" })));
  const replies: { result: { isError: boolean } }[] = [];
  output.on("data", (d: Buffer) => replies.push(...String(d).split("\n").filter(Boolean).map((l) => JSON.parse(l))));
  input.write(JSON.stringify(call(1, "change_thing")) + "\n");
  await new Promise((r) => setTimeout(r, 100));
  stub.scope = "read";
  input.write(JSON.stringify(call(2, "change_thing")) + "\n");
  input.end();
  await done;
  close();
  assert.deepEqual(replies.map((r) => r.result.isError), [false, true]);
  assert.equal(stub.requests.filter((r) => r === "GET /admin/v1/whoami").length, 2);
});

test("a token the platform rejects, or no token at all, gets a plain message and the tool never runs", async () => {
  const { stub, url, close } = await stubPlatform();
  const bad = await talk(url, "wrong-token", [call(1, "read_thing")]);
  assert.equal(bad[0].result.isError, true);
  assert.match(bad[0].result.content[0].text, /doesn't accept this token/);
  const requestsBefore = stub.requests.length;
  const none = await talk(url, undefined, [call(2, "change_thing")]);
  close();
  assert.equal(none[0].result.isError, true);
  assert.match(none[0].result.content[0].text, /MCP_TOKEN is not set/);
  assert.equal(stub.requests.length, requestsBefore);
});

test("an unreachable platform says so and the tool never runs", async () => {
  const replies = await talk("http://127.0.0.1:1", "fake-token", [call(1, "change_thing")]);
  assert.equal(replies[0].result.isError, true);
  assert.match(replies[0].result.content[0].text, /Can't reach the platform/);
});

test("an unknown tool is a protocol error", async () => {
  const { url, close } = await stubPlatform();
  const replies = await talk(url, "fake-token", [call(1, "nope")]);
  close();
  assert.equal(replies[0].error.code, -32602);
});

test("the platform client only talks to /admin/v1/", async () => {
  const { stub, url, close } = await stubPlatform();
  const platform = makePlatform(readConfig({ ROUTA_URL: url, MCP_TOKEN: "fake-token" }));
  await platform.whoami();
  await platform.getSettings();
  await platform.patchSettings([]);
  close();
  assert.ok(stub.requests.every((r) => r.split(" ")[1].startsWith("/admin/v1/")));
});

test("config defaults to the local platform", () => {
  assert.equal(readConfig({}).url, "http://localhost:4660");
  assert.equal(readConfig({ ROUTA_URL: "http://x:1/" }).url, "http://x:1");
});
