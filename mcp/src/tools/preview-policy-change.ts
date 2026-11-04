// Shows, in words, what changing one policy would do. Changes nothing.
import { UserError } from "../platform.ts";
import { createPreview, PREVIEW_MINUTES } from "../previews.ts";
import { parseSettings, showValue } from "../settings.ts";
import type { Tool } from "./index.ts";

export const previewPolicyChange: Tool = {
  name: "preview_policy_change",
  description:
    "Preview changing one security policy to a new value. Nothing is changed: it returns a plain-words description and a preview id. Applying needs that id. Needs an admin token.",
  inputSchema: {
    type: "object",
    properties: {
      policy: { type: "string", description: "The policy's name, such as Session length in hours, or its id, such as session-length-hours" },
      value: { type: ["boolean", "number", "string"], description: "The new value. It has the same kind as the current one: yes/no, a number, or text" },
    },
    required: ["policy", "value"],
  },
  needs: "admin",
  async run(args, platform) {
    const { policies } = parseSettings(await platform.getSettings());
    const { policy, value } = args;
    if (typeof policy !== "string" || (typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string")) {
      throw new UserError("A change needs a policy and its new value.");
    }
    const found = policies.find((p) => p.id === policy) ?? policies.find((p) => p.label.toLowerCase() === policy.toLowerCase());
    if (!found) throw new UserError(`There is no policy called ${JSON.stringify(policy)}. The policies are: ${policies.map((p) => `${p.label} (${p.id})`).join("; ")}.`);
    if (typeof value !== typeof found.value) {
      const kind = typeof found.value === "boolean" ? "yes or no (true or false)" : typeof found.value === "number" ? "a number" : "text";
      throw new UserError(`"${found.label}" takes ${kind}, not ${JSON.stringify(value)}.`);
    }
    if (value === found.value) return `No change: "${found.label}" is already ${showValue(value)}. There is nothing to apply.`;
    const description = `"${found.label}" would go from ${showValue(found.value)} to ${showValue(value)}.`;
    const preview = createPreview({ type: "policy", id: found.id, value }, description);
    return `${description}\nNothing has been changed yet. To apply exactly this, use preview id ${preview.id} (valid for ${PREVIEW_MINUTES} minutes).`;
  },
};
