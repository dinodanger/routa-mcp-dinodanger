// Who reaches what. Works with either token.
import { UserError } from "../platform.ts";
import { listOf, parseSettings } from "../settings.ts";
import type { Tool } from "./index.ts";

export const showAccess: Tool = {
  name: "show_access",
  description:
    "Show which groups reach which applications. With no arguments, shows every group. Give a group to see what it reaches, or an application to see which groups reach it. Works with a read-only or an admin token.",
  inputSchema: {
    type: "object",
    properties: {
      group: { type: "string", description: "A group name, such as ext-contractors" },
      app: { type: "string", description: "An application id, such as finance" },
    },
  },
  needs: "read",
  async run(args, platform) {
    const { access } = parseSettings(await platform.getSettings());
    const { group, app } = args;
    if (group !== undefined && typeof group !== "string") throw new UserError("group must be a group name.");
    if (app !== undefined && typeof app !== "string") throw new UserError("app must be an application id.");

    const rows = group === undefined ? access : access.filter((r) => r.group === group);
    if (group !== undefined && rows.length === 0) {
      throw new UserError(`There is no group called ${JSON.stringify(group)}. The groups are: ${access.map((r) => r.group).join(", ")}.`);
    }
    if (app !== undefined) {
      const reaching = rows.filter((r) => r.apps.includes(app)).map((r) => r.group);
      if (reaching.length > 0 || group !== undefined) {
        return group !== undefined
          ? `${group} ${reaching.length > 0 ? "reaches" : "does not reach"} ${app}.`
          : `${app} is reached by: ${listOf(reaching)}.`;
      }
      const known = [...new Set(access.flatMap((r) => r.apps))].sort();
      return `No group reaches ${app}. The applications that some group reaches are: ${known.join(", ")}.`;
    }
    return rows.map((r) => `${r.group}: ${listOf(r.apps)}`).join("\n");
  },
};
