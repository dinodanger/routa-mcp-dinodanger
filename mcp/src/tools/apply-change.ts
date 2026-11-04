// Applies a preview that was shown: exactly its change, once, and only if the settings still look as they did then.
import { UserError } from "../platform.ts";
import { findPreview, isStale, markUsed, PREVIEW_MINUTES } from "../previews.ts";
import { parseSettings } from "../settings.ts";
import type { Settings } from "../settings.ts";
import type { Change, Preview } from "../previews.ts";
import type { Tool } from "./index.ts";

// What the settings hold now, for the one thing the preview was about.
function currentValue(settings: Settings, change: Change): boolean | number | string | undefined {
  if (change.type === "access") return settings.access.find((r) => r.group === change.group)?.apps.includes(change.app);
  return settings.policies.find((p) => p.id === change.id)?.value;
}

export const applyChange: Tool = {
  name: "apply_change",
  description:
    "Apply a change that was previewed, by its preview id. It applies exactly what the preview showed, once, and refuses if the settings have changed since. Needs an admin token. Only call this after the user has seen the preview and said yes.",
  inputSchema: {
    type: "object",
    properties: { preview_id: { type: "string", description: "The preview id from preview_access_change or preview_policy_change" } },
    required: ["preview_id"],
  },
  needs: "admin",
  async run(args, platform) {
    const id = args.preview_id;
    if (typeof id !== "string" || !id) throw new UserError("apply_change needs the preview id. Preview the change first, then apply it by its id.");
    const preview: Preview | undefined = findPreview(id);
    if (!preview) throw new UserError(`There is no preview with id ${JSON.stringify(id)}. Previews are kept only while the server runs, so preview the change again. Nothing was changed.`);
    if (preview.used) throw new UserError(`Preview ${id} was already applied. Preview the change again if you want to repeat it. Nothing was changed.`);
    if (isStale(preview)) throw new UserError(`Preview ${id} is more than ${PREVIEW_MINUTES} minutes old. Preview the change again. Nothing was changed.`);

    const now = currentValue(parseSettings(await platform.getSettings()), preview.change);
    if (now !== preview.before) {
      throw new UserError(`The settings have changed since the preview, so it no longer shows what would happen: "${preview.description}" Nothing was applied. Preview the change again.`);
    }

    // The one change that was shown, and nothing else.
    const result = (await platform.patchSettings([preview.change])) as { applied?: unknown; settings?: unknown } | undefined;
    markUsed(preview);
    if (result?.applied !== 1) throw new UserError(`The platform's answer wasn't what was expected, so check the settings: ${preview.done}`);
    const after = currentValue(parseSettings(result.settings), preview.change);
    const wanted = preview.change.type === "access" ? preview.change.allowed : preview.change.value;
    if (after !== wanted) throw new UserError("The platform said it applied the change, but the settings don't show it. Check the settings.");
    return `Applied. ${preview.done}`;
  },
};
