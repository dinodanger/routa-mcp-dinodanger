// Shows, in words, what giving or taking away one group's access to one application would do. Changes nothing.
import { UserError } from "../platform.ts";
import { createPreview, PREVIEW_MINUTES } from "../previews.ts";
import { knownApps, parseSettings } from "../settings.ts";
import type { Tool } from "./index.ts";

export const previewAccessChange: Tool = {
  name: "preview_access_change",
  description:
    "Preview giving one group access to one application, or taking it away. Nothing is changed: it returns a plain-words description and a preview id. Applying needs that id. Needs an admin token.",
  inputSchema: {
    type: "object",
    properties: {
      group: { type: "string", description: "A group name, such as ext-contractors" },
      app: { type: "string", description: "An application id, such as finance" },
      allowed: { type: "boolean", description: "true to give access, false to take it away" },
    },
    required: ["group", "app", "allowed"],
  },
  needs: "admin",
  async run(args, platform) {
    const { access } = parseSettings(await platform.getSettings());
    const { group, app, allowed } = args;
    if (typeof group !== "string" || typeof app !== "string" || typeof allowed !== "boolean") {
      throw new UserError("A change needs a group, an application, and whether access is allowed (true) or taken away (false).");
    }
    const row = access.find((r) => r.group === group);
    if (!row) throw new UserError(`There is no group called ${JSON.stringify(group)}. The groups are: ${access.map((r) => r.group).join(", ")}.`);
    if (!knownApps().includes(app)) throw new UserError(`There is no application called ${JSON.stringify(app)}. The applications are: ${knownApps().join(", ")}.`);

    const now = row.apps.includes(app);
    if (now === allowed) return `No change: ${group} ${allowed ? "already reaches" : "already doesn't reach"} ${app}. There is nothing to apply.`;
    const description = allowed ? `${group} would gain access to ${app}.` : `${group} would lose access to ${app}.`;
    const done = allowed ? `${group} now has access to ${app}.` : `${group} no longer has access to ${app}.`;
    const preview = createPreview({ type: "access", group, app, allowed }, now, description, done);
    return `${description}\nNothing has been changed yet. To apply exactly this, use preview id ${preview.id} (valid for ${PREVIEW_MINUTES} minutes).`;
  },
};
