// What a tool is, and the one place a tool is run. Every call asks the platform what the token may do.
import { UserError } from "../platform.ts";
import type { Platform, Scope } from "../platform.ts";
import { showAccess } from "./show-access.ts";
import { applyChange } from "./apply-change.ts";
import { previewAccessChange } from "./preview-access-change.ts";
import { previewPolicyChange } from "./preview-policy-change.ts";
import { showPolicies } from "./show-policies.ts";

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // "admin" for anything that previews or changes settings.
  needs: Scope;
  run(args: Record<string, unknown>, platform: Platform): Promise<string>;
};

export type ToolResult = { text: string; isError: boolean };

// The tools the server offers. Each step of the plan adds its own here.
export const tools: Tool[] = [showAccess, showPolicies, previewAccessChange, previewPolicyChange, applyChange];

export async function callTool(tool: Tool, args: Record<string, unknown>, platform: Platform): Promise<ToolResult> {
  try {
    const scope = await platform.whoami();
    if (tool.needs === "admin" && scope !== "admin") {
      return { text: "This token is read-only, so it can't change settings. Nothing was changed. Ask an administrator, or use an admin token.", isError: true };
    }
    return { text: await tool.run(args, platform), isError: false };
  } catch (err) {
    if (err instanceof UserError) return { text: err.message, isError: true };
    return { text: "Something went wrong inside the server. Nothing was changed.", isError: true };
  }
}
