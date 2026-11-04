// The platform's settings, checked for shape before anything uses them.
import { UserError } from "./platform.ts";

export type AccessRow = { group: string; apps: string[] };
export type Policy = { id: string; label: string; value: boolean | number | string };
export type Settings = { access: AccessRow[]; policies: Policy[] };

const unexpected = () => new UserError("The platform's settings came back in a shape the server doesn't know, so nothing was done.");

export function parseSettings(raw: unknown): Settings {
  const s = raw as { access?: unknown; policies?: unknown } | null;
  if (!s || !Array.isArray(s.access) || !Array.isArray(s.policies)) throw unexpected();
  const access = s.access.map((r: { group?: unknown; apps?: unknown }) => {
    if (typeof r?.group !== "string" || !Array.isArray(r.apps) || r.apps.some((a) => typeof a !== "string")) throw unexpected();
    return { group: r.group, apps: [...(r.apps as string[])].sort() };
  });
  const policies = s.policies.map((p: { id?: unknown; label?: unknown; value?: unknown }) => {
    const t = typeof p?.value;
    if (typeof p?.id !== "string" || typeof p.label !== "string" || (t !== "boolean" && t !== "number" && t !== "string")) throw unexpected();
    return { id: p.id, label: p.label, value: p.value as Policy["value"] };
  });
  return { access, policies };
}

export function showValue(value: Policy["value"]): string {
  return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
}

export function listOf(items: string[]): string {
  return items.length === 0 ? "nothing" : items.join(", ");
}
