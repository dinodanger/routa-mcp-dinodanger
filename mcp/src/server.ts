// An MCP server over stdio: newline-delimited JSON-RPC. Run it with node mcp/src/server.ts.
import { createInterface } from "node:readline";
import { readConfig } from "./config.ts";
import { makePlatform } from "./platform.ts";
import type { Platform } from "./platform.ts";
import { callTool, tools as allTools } from "./tools/index.ts";
import type { Tool } from "./tools/index.ts";

const LATEST = "2025-06-18";
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const ok = (id: Message["id"], result: unknown): Reply => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Message["id"], code: number, message: string): Reply => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

// Answers one message, or returns undefined when none is due (a notification).
export async function handleMessage(msg: Message, tools: Tool[], platform: Platform): Promise<Reply | undefined> {
  if (typeof msg !== "object" || msg === null || typeof msg.method !== "string") return fail(msg?.id, -32600, "Not a JSON-RPC request.");
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const version = typeof asked === "string" && SUPPORTED.includes(asked) ? asked : LATEST;
      return ok(msg.id, { protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: "routa-identity", version: "0.1.0" } });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(msg.id, -32602, `No tool called ${JSON.stringify(msg.params?.name)}.`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(tool, args, platform);
      return ok(msg.id, { content: [{ type: "text", text: result.text }], isError: result.isError });
    }
    default:
      if (isNotification) return undefined;
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// Reads one JSON message per line from input and writes one reply per line to output.
export async function serve(input: NodeJS.ReadableStream, output: NodeJS.WritableStream, tools: Tool[], platform: Platform): Promise<void> {
  let queue: Promise<void> = Promise.resolve();
  const lines = createInterface({ input });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let reply: Reply | undefined;
      try {
        reply = await handleMessage(JSON.parse(line), tools, platform);
      } catch (err) {
        reply = err instanceof SyntaxError ? fail(null, -32700, "Parse error.") : fail(null, -32603, "Internal error.");
      }
      if (reply) output.write(JSON.stringify(reply) + "\n");
    });
  });
  await new Promise<void>((resolve) => lines.on("close", resolve));
  await queue;
}

if (import.meta.main) {
  const platform = makePlatform(readConfig(process.env));
  await serve(process.stdin, process.stdout, allTools, platform);
}
