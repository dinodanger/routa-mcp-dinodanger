// The security policies. Works with either token.
import { UserError } from "../platform.ts";
import { parseSettings, showValue } from "../settings.ts";
import type { Tool } from "./index.ts";

export const showPolicies: Tool = {
  name: "show_policies",
  description:
    "Show the security policies and their values. Give search to keep only the policies whose name or id contains that text, such as mfa or session. Works with a read-only or an admin token.",
  inputSchema: { type: "object", properties: { search: { type: "string", description: "Text to look for in the policy name or id" } } },
  needs: "read",
  async run(args, platform) {
    const { policies } = parseSettings(await platform.getSettings());
    const { search } = args;
    if (search !== undefined && typeof search !== "string") throw new UserError("search must be text.");
    const needle = search?.toLowerCase();
    const shown = needle ? policies.filter((p) => p.label.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)) : policies;
    if (shown.length === 0) return `No policy matches ${JSON.stringify(search)}.`;
    return shown.map((p) => `${p.label}: ${showValue(p.value)} (${p.id})`).join("\n");
  },
};
