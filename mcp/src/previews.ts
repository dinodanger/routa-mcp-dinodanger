// Previews waiting to be applied. A preview keeps the exact change that was shown; applying uses nothing else.
import { randomUUID } from "node:crypto";

export type Change =
  | { type: "access"; group: string; app: string; allowed: boolean }
  | { type: "policy"; id: string; value: boolean | number | string };

export type Preview = { id: string; change: Change; description: string; createdAt: number; used: boolean };

// A preview that nobody applied goes stale after this long.
export const PREVIEW_MINUTES = 15;

const previews = new Map<string, Preview>();

export function createPreview(change: Change, description: string, now = Date.now()): Preview {
  const preview = { id: randomUUID().slice(0, 8), change: Object.freeze({ ...change }) as Change, description, createdAt: now, used: false };
  previews.set(preview.id, preview);
  return preview;
}

export function findPreview(id: string): Preview | undefined {
  return previews.get(id);
}

export function isStale(preview: Preview, now = Date.now()): boolean {
  return now - preview.createdAt > PREVIEW_MINUTES * 60_000;
}

export function markUsed(preview: Preview): void {
  preview.used = true;
}
